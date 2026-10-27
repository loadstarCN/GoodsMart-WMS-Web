<script lang="ts" setup>

// 定义页面元数据
definePageMeta({})

// 获取国际化方法
const { t, te } = useI18n()
const staffStore = useStaffStore()

// 面包屑
const dataToPass = computed(() => ({
  current: t('nav.webhook-logs'),
  list: [t('nav.SYSTEM'), t('nav.webhook-logs')]
}))

const router = useRouter()
const route = useRoute()
let loading = ref(true)
let pageData = ref<PaginationData | null>(null)

// 筛选条件
let keyword = ref('')
let eventTypeFilter = ref('')
let statusFilter = ref('')

// ==================== 列表数据 ====================
let loadGeneration=0
const loadError=ref('')
const {bizErrorMessage}=useBizError()
onBeforeUnmount(()=>loadGeneration++)
const fetchData = async () => {
  const generation=++loadGeneration
  loadError.value=''
  pageData.value=null
  loading.value = true
  await httpRequest<PaginationData>('/api/system/webhook/', {
    method: 'GET',
    params: { ...route.query },
    onSuccess: (data) => {
      if(generation===loadGeneration)pageData.value = data
    },
    onError: (error) => {
      if(generation===loadGeneration)loadError.value=bizErrorMessage(error)
    },
    onFinally: () => {
      if(generation===loadGeneration)loading.value = false
    }
  })
}

watch(() => route.query, async () => {
  await fetchData()
})

onMounted(async () => {
  // 从 URL 恢复筛选状态
  keyword.value = (route.query.keyword as string) || ''
  eventTypeFilter.value = (route.query.event_type as string) || ''
  statusFilter.value = (route.query.status as string) || ''
  await Promise.all([fetchData(), fetchApiKeys()])
})

// ==================== 目标系统（API Key 的系统名） ====================
// 推送日志只带 api_key_id：按本公司的 API Key 列表换成系统名（含已停用的）；没有 API 密钥查看权限 / 读不到时显示 #ID
const apiKeyNames = ref<Record<string, string>>({})
const keyLoadError = ref('')
const apiKeyFilter = computed({
  get: () => String(route.query.api_key_id || ''),
  set: (value: string) => router.push({query: {...route.query, page:'1', api_key_id:value||undefined}}),
})
const apiKeyOptions = computed(() => {
  const options = Object.entries(apiKeyNames.value).map(([value,label]) => ({value,label}))
  if (apiKeyFilter.value && !apiKeyNames.value[apiKeyFilter.value]) options.unshift({value:apiKeyFilter.value,label:'#'+apiKeyFilter.value})
  return [{value:'',label:t('webhook-logs.status.all')},...options]
})
const fetchApiKeys = async () => {
  if (!staffStore.staffInfo) await staffStore.getCurrentStaffInfo()
  if (!staffStore.hasPermission('api_keys_read')) return
  const companyId = staffStore.staffInfo?.company_id
  if (!companyId) return
  keyLoadError.value = ''
  const names: Record<string,string> = {}
  let page=1, pages=1
  do {
    let failed=false
    await httpRequest<PaginationData>('/api/system/third-party/api-keys', {
      method:'GET', params:{company_id:companyId,per_page:100,page},
      onSuccess:data=>{
        for (const key of data.items||[]) if (key.id!=null && key.system_name) names[String(key.id)]=key.system_name
        pages=Math.ceil((data.total||0)/100)
      },
      onError:error=>{failed=true;keyLoadError.value=bizErrorMessage(error)},
    })
    if(failed) return
    page++
  } while(page<=pages)
  apiKeyNames.value=names
}
const targetSystemName = (apiKeyId: number | null | undefined) =>
  apiKeyId === null || apiKeyId === undefined ? '—' : apiKeyNames.value[String(apiKeyId)] || `#${apiKeyId}`

// ==================== 状态 Tab ====================
const statusTabs = ['all', 'pending', 'sending', 'sent', 'failed', 'superseded'] as const

const activeTab = computed(() => {
  const statusParam = route.query.status as string
  if (!statusParam) return 'all'
  return statusParam
})

const setStatusFilter = (status: string) => {
  const query: Record<string, any> = { ...route.query }
  if (status === 'all') {
    delete query.status
  } else {
    query.status = status
  }
  query.page = '1'
  router.push({ query })
}

// ==================== 事件类型筛选 ====================
// 与后端 system/webhook/schemas.py 的 EVENT_TYPES 一致（asn.cancelled / dn.cancelled：取消单据时推送；
// goods.spec_updated：商品规格变更时按公司推送）
const eventTypes = [
  'asn.received',
  'asn.completed',
  'asn.cancelled',
  'dn.in_progress',
  'dn.picked',
  'dn.packed',
  'dn.delivered',
  'dn.tracking_updated',
  'dn.completed',
  'dn.cancelled',
  'goods.spec_updated',
]

/** 事件类型的译名（dn.packed → 已打包）；没有译名时显示代码 */
const eventLabel = (eventType: string | null | undefined) => {
  if (!eventType) return '—'
  const key = `webhook-logs.events.${eventType.replace(/\./g, '_')}`
  return te(key) ? t(key) : eventType
}

const setEventTypeFilter = () => {
  const query: Record<string, any> = { ...route.query }
  if (!eventTypeFilter.value) {
    delete query.event_type
  } else {
    query.event_type = eventTypeFilter.value
  }
  query.page = '1'
  router.push({ query })
}

// ==================== 搜索 ====================
async function search() {
  const query: Record<string, any> = { ...route.query }
  if (keyword.value.trim()) {
    query.keyword = keyword.value.trim()
  } else {
    delete query.keyword
  }
  query.page = '1'
  await router.push({ query })
}

// ==================== 手动重试 ====================
const retrying = ref<number | null>(null)

/**
 * 能否手动重推（与后端 system/webhook/views.py 一致）：已发送的不行；推送中且租约未到期的不行（409）；
 * 其余（推送失败 / 待发送 / 已作废 / 推送中但租约已过期）都可以——重推会把尝试次数清零后立即推一次。
 */
const canRetry = (item: any) => {
  if (!item || item.status === 'sent') return false
  if (item.status === 'sending') {
    const lease = item.lease_expires_at ? parseDateTime(item.lease_expires_at, 'UTC') : null
    return !!lease && lease.getTime() <= Date.now()
  }
  return true
}

const retryEvent = async (eventId: number) => {
  if(retrying.value!==null)return
  retrying.value = eventId
  await httpRequest(`/api/system/webhook/${eventId}/retry`, {
    method: 'POST',
    onSuccess: () => {
      showToast(t('webhook-logs.operations.retry-success'), 'success')
      fetchData()
      if(detailItem.value?.id===eventId)showDetailModal.value=false
    },
    onError: (error) => {
      showToast(error.message, 'error')
    },
    onFinally: () => {
      retrying.value = null
    }
  })
}

// ==================== 详情 Modal ====================
const showDetailModal = ref(false)
const detailItem = ref<any>(null)

const openDetail = (item: any) => {
  detailItem.value = item
  showDetailModal.value = true
}

// ==================== 状态样式 ====================
const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'sent': return 'bg-success-transparent'
    case 'failed': return 'bg-danger-transparent'
    case 'pending': return 'bg-warning-transparent'
    case 'sending': return 'bg-info-transparent'
    default: return 'bg-secondary-transparent'
  }
}

// ==================== 格式化 ====================
/** 时刻按记录的仓库（有时）→ 页头选中的仓库 → 浏览器的时区显示；与浏览器不同时带时区缩写 */
const formatDate = (dateStr: string | null, row?: Record<string, any> | null) => {
  if (!dateStr) return '—'
  return formatInTimeZone(dateStr, 'YYYY-MM-DD HH:mm:ss', resolveTimeZone(row)) || '—'
}

const truncateError = (error: string | null, maxLen = 60) => {
  if (!error) return '—'
  return error.length > maxLen ? error.slice(0, maxLen) + '...' : error
}


const tabs=computed(()=>statusTabs.map(key=>({key,label:t('webhook-logs.status.'+key)})))
const columns=computed(()=>[{key:'event',label:t('webhook-logs.fields.event-type')},{key:'target',label:t('webhook-logs.fields.target-system')},{key:'status',label:t('common.fields.status')},{key:'attempts',label:t('webhook-logs.fields.attempts'),type:'qty' as const},{key:'created',label:t('webhook-logs.fields.created-at')},{key:'sent',label:t('webhook-logs.fields.sent-at')},{key:'action',label:t('common.fields.action'),align:'right' as const}])
const tone=(status:string)=>status==='sent'?'ok' as const:status==='failed'?'bad' as const:status==='pending'||status==='sending'?'warn' as const:'none' as const
useHead({title:()=>t('nav.webhook-logs')})
</script>
<template><div class="w-webhooks w-scope"><header><div><h1>{{t('nav.webhook-logs')}}</h1><span>{{pageData?.total}}</span></div><WButton v-if="staffStore.hasPermission('api_keys_read')" to="/apikeys">{{t('nav.apikeys')}}</WButton></header><WCard flush><WTabs :items="tabs" :model-value="activeTab" :label="t('common.fields.status')" inset @update:model-value="value=>setStatusFilter(value||'all')"/><form class="filters" @submit.prevent="search"><WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('common.search-placeholder')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WButton type="submit">{{t('common.search')}}</WButton><WSelect v-model="eventTypeFilter" :aria-label="t('webhook-logs.fields.event-type')" :options="[{value:'',label:t('webhook-logs.filters.all-types')},...eventTypes.map(value=>({value,label:eventLabel(value)}))]" @change="setEventTypeFilter"/><WSelect v-if="staffStore.hasPermission('api_keys_read')||apiKeyFilter" v-model="apiKeyFilter" :aria-label="t('webhook-logs.fields.target-system')" :options="apiKeyOptions"/></form><WAlert v-if="keyLoadError" tone="warn" :title="keyLoadError"><template #actions><WButton @click="fetchApiKeys">{{t('dn.list.retry')}}</WButton></template></WAlert><WAlert v-if="loadError" tone="block" :title="loadError"><template #actions><WButton @click="fetchData">{{t('dn.list.retry')}}</WButton></template></WAlert><WTable :columns="columns" :rows="pageData?.items||[]" :loading="loading" inset><template #head-action><span class="w-sr-only">{{t('common.fields.action')}}</span></template><template #cell-event="{row}"><button class="event-name" @click="openDetail(row)">{{eventLabel(row.event_type)}}</button><code>{{row.event_type}}</code></template><template #cell-target="{row}">{{targetSystemName(row.api_key_id)}}</template><template #cell-status="{row}"><WStatus :tone="tone(row.status)">{{t('webhook-logs.status.'+row.status)}}</WStatus><small v-if="row.next_retry_at">{{t('webhook-logs.fields.next-retry')}} {{formatDate(row.next_retry_at,row)}}</small><small v-if="row.last_error" :title="row.last_error" class="error">{{truncateError(row.last_error)}}</small></template><template #cell-created="{row}">{{formatDate(row.created_at,row)}}</template><template #cell-sent="{row}">{{formatDate(row.sent_at,row)}}</template><template #cell-action="{row}"><div class="actions"><WButton size="sm" @click="openDetail(row)">{{t('webhook-logs.operations.detail')}}</WButton><WButton v-if="canRetry(row)" size="sm" :disabled="retrying!==null" @click="retryEvent(row.id)">{{t('webhook-logs.operations.retry')}}</WButton></div></template></WTable><footer><WPagination :page="Number(route.query.page)||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/></footer></WCard><WDrawer v-model:open="showDetailModal" :title="t('webhook-logs.operations.detail')" width="560px"><div v-if="detailItem" class="detail"><dl><dt>{{t('common.fields.id')}}</dt><dd>{{detailItem.id}}</dd><dt>{{t('webhook-logs.fields.event-type')}}</dt><dd>{{eventLabel(detailItem.event_type)}}<code>{{detailItem.event_type}}</code></dd><dt>{{t('common.fields.status')}}</dt><dd><WStatus :tone="tone(detailItem.status)">{{t('webhook-logs.status.'+detailItem.status)}}</WStatus></dd><dt>{{t('webhook-logs.fields.attempts')}}</dt><dd>{{detailItem.attempts}}</dd><dt>{{t('webhook-logs.fields.created-at')}}</dt><dd>{{formatDate(detailItem.created_at,detailItem)}}</dd><dt>{{t('webhook-logs.fields.sent-at')}}</dt><dd>{{formatDate(detailItem.sent_at,detailItem)}}</dd><dt>{{t('webhook-logs.fields.next-retry')}}</dt><dd>{{formatDate(detailItem.next_retry_at,detailItem)}}</dd></dl><WAlert v-if="detailItem.last_error" tone="block" :title="t('webhook-logs.fields.last-error')">{{detailItem.last_error}}</WAlert><h3>{{t('webhook-logs.fields.payload')}}</h3><pre>{{JSON.stringify(detailItem.payload,null,2)}}</pre></div><template #footer><WButton @click="showDetailModal=false">{{t('button.close')}}</WButton><WButton v-if="canRetry(detailItem)" variant="primary" :loading="retrying===detailItem?.id" :disabled="retrying!==null" @click="retryEvent(detailItem.id)">{{t('webhook-logs.operations.retry')}}</WButton></template></WDrawer></div></template>
<style scoped>
.w-webhooks{display:flex;flex-direction:column;gap:16px}header,header>div{display:flex;align-items:center;gap:12px}header{justify-content:space-between;flex-wrap:wrap}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}header span{font-size:13px;color:var(--w-text-2)}.filters{display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;border-bottom:1px solid var(--w-line)}.filters>.w-input{width:300px;max-width:100%}.filters>.w-select{width:200px}.w-webhooks :deep(.w-table){min-width:1060px}.w-webhooks :deep(.w-table-wrap.is-inset){--w-table-edge:20px}.w-webhooks :deep(.w-table th){height:auto;padding-top:10px;padding-bottom:8px;line-height:16px}.w-webhooks :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}.event-name{border:0;background:none;padding:0;font:inherit;font-size:14px;line-height:20px;font-weight:500;color:var(--w-text-1);text-align:left}.event-name:hover{color:var(--w-link)}code{display:block;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:18px;color:var(--w-text-3)}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.error{max-width:200px;white-space:normal;color:#B32322}.actions{display:flex;gap:8px;justify-content:flex-end}footer{padding:12px 20px;border-top:1px solid var(--w-border)}.detail{display:flex;flex-direction:column;gap:16px}.detail dl{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;font-size:13px;line-height:20px;margin:0}.detail dt{color:var(--w-text-3);font-weight:400}.detail dd{margin:0;overflow-wrap:anywhere}.detail h3{font-size:14px;line-height:22px;font-weight:600;margin:0}.detail pre{margin:0;padding:16px;border:1px solid var(--w-border);border-radius:6px;background:#F6F7FA;font-size:12px;line-height:18px;max-height:360px;overflow:auto}
</style>
