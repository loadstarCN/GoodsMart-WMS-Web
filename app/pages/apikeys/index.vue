<script lang="ts" setup>
import type { PermissionModuleSummary } from '~/utils/permissionGroups'
import type { ApiKeyTemplate } from '~/utils/apiKeyTemplates'

// 定义页面元数据
definePageMeta({
})

// 获取国际化方法
const { t, te } = useI18n()

// 面包屑
const dataToPass = computed(() => ({
  current: t('nav.apikeys'),
  list: [t('nav.SYSTEM'), t('nav.apikeys')]
}))

const { bizErrorMessage } = useBizError()
// 按权限显示新建 / 编辑 / 启停 / 删除（鉴权仍以后端为准）
const staffStore = useStaffStore()
const router = useRouter()
const route = useRoute()
let loading = ref(true)
let keyword = ref('')
let pageData = ref<PaginationData | null>(null)
const loadError = ref('')
const recentByKey = ref<Record<string, any>>({})
const recentError = ref('')
const recentLoading = ref(false)
let loadGeneration = 0
onBeforeUnmount(() => loadGeneration++)
const loadRecent = async (ids: number[], generation: number) => {
  if (!staffStore.hasPermission('webhook_read') || !ids.length) return
  recentLoading.value = true
  recentError.value = ''
  await httpRequest<{items: any[]}>('/api/system/webhook/key-summary', {
    method: 'GET', params: {api_key_ids: ids.join(',')},
    onSuccess: data => {
      if (generation === loadGeneration) recentByKey.value = Object.fromEntries(data.items.map((row: any) => [row.api_key_id, row]))
    },
    onError: error => { if (generation === loadGeneration) recentError.value = bizErrorMessage(error) },
    onFinally: () => { if (generation === loadGeneration) recentLoading.value = false },
  })
}

// ==================== 列表数据 ====================
const fetchData = async () => {
  const generation = ++loadGeneration
  loadError.value = ''
  pageData.value = null
  recentByKey.value = {}
  recentError.value = ''
  recentLoading.value = false
  loading.value = true
  const companyId = staffStore.staffInfo?.company_id
  if (!companyId) {
    loadError.value = t('common.validation.company-required')
    loading.value = false
    return
  }

  await httpRequest<PaginationData>('/api/system/third-party/api-keys', {
    method: 'GET',
    // 默认展示启用中的 Key，与下方 Tab 高亮保持一致
    params: { is_active: 'true', ...route.query, company_id: companyId },
    onSuccess: (data) => {
      if (generation === loadGeneration) pageData.value = data
    },
    onError: (error) => {
      if (generation === loadGeneration) loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      if (generation === loadGeneration) loading.value = false
    }
  })
  const fetched = pageData.value as PaginationData | null
  if (generation === loadGeneration && fetched) {
    await loadRecent(fetched.items.map((item: any) => item.id), generation)
  }
}

watch(() => route.query, async () => {
  await fetchData()
})

// ==================== 权限数据 ====================
// API Key 只允许分配业务相关权限（不含系统管理类权限）
const API_KEY_PERM_PREFIXES = [
  'goods_', 'inventory_',
  'asn_', 'putaway_',
  'dn_', 'picking_', 'sorting_', 'packing_', 'delivery_', 'payment_',
  'adjustment_', 'cycle_count_', 'transfer_', 'removal_',
  'carrier_', 'recipient_', 'supplier_', 'warehouse_', 'location_',
]

const allPermissions = ref<any[]>([])

// ==================== Webhook 订阅事件 ====================
// 需要勾选订阅才推送的事件（目前后端只允许 goods.spec_updated）；出入库完成等既有事件不受影响
const WEBHOOK_SUBSCRIPTION_EVENTS = ['goods.spec_updated'] as const
const eventLabelKey = (event: string) => `apikeys.events.${event.replace(/\./g, '_')}`
const eventDescKey = (event: string) => `apikeys.events.${event.replace(/\./g, '_')}_desc`
const eventLabel = (event: string) => (te(eventLabelKey(event)) ? t(eventLabelKey(event)) : event)
const toggleSubscription = (list: string[], event: string) => {
  const idx = list.indexOf(event)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(event)
}

/** 列表的权限列：按模块归并显示「商品：查看 / 编辑」（见 utils/permissionGroups.ts），权限代码放在 title 里 */
const permissionSummaries = computed<Record<string, ReturnType<typeof summarizePermissions>>>(() =>
  Object.fromEntries((pageData.value?.items || []).map((item: any) => [item.id, summarizePermissions(item.permissions)]))
)
const moduleSummaryText = (mod: PermissionModuleSummary) => {
  const ops = mod.items.filter(i => i.opLabel).map(i => t(i.opLabel!))
  return ops.length ? t('apikeys.tips.permission-module', { module: t(mod.label), ops: ops.join(' / ') }) : t(mod.label)
}

const apiKeyPermissions = computed(() =>
  allPermissions.value.filter((p: any) =>
    API_KEY_PERM_PREFIXES.some(prefix => p.name.startsWith(prefix))
  )
)

const loadPermissions = async () => {
  if (allPermissions.value.length > 0) return
  await httpRequest<any>('/api/system/user/permissions', {
    method: 'GET',
    params: { per_page: 200 },
    onSuccess: (data) => {
      allPermissions.value = data.items || data
    },
  })
}

onMounted(async () => {
  keyword.value = (route.query.keyword as string) || ''
  if (!staffStore.staffInfo) {
    await staffStore.getCurrentStaffInfo()
  }
  await fetchData()
  await loadPermissions()
})

// ==================== 创建 Modal ====================
const showCreateModal = ref(false)
const creating = ref(false)
const newKeyResult = ref<string | null>(null) // 创建成功后显示 key

const createForm = ref({
  system_name: '',
  webhook_url: '',
  webhook_secret: '',
  permissions: [] as number[],
  webhook_subscriptions: [] as string[],
})

const createErrors = ref({
  system_name: null as string | null,
})

// 权限模板（utils/apiKeyTemplates.ts）：选中后按模板勾好权限，之后仍可增减
const applyTemplate = (template: ApiKeyTemplate) => {
  createForm.value.permissions = apiKeyTemplatePermissionIds(template, apiKeyPermissions.value)
}
/** 当前勾选正好等于某个模板时高亮它 */
const activeTemplateKey = computed(() => {
  const current = [...createForm.value.permissions].sort((a, b) => a - b).join(',')
  return API_KEY_TEMPLATES.find(tpl =>
    apiKeyTemplatePermissionIds(tpl, apiKeyPermissions.value).sort((a, b) => a - b).join(',') === current
  )?.key ?? null
})

const openCreateModal = () => {
  createForm.value = { system_name: '', webhook_url: '', webhook_secret: '', permissions: [], webhook_subscriptions: [] }
  createErrors.value = { system_name: null }
  newKeyResult.value = null
  showCreateModal.value = true
}

const submitCreate = async () => {
  if(creating.value)return
  // 验证
  createErrors.value.system_name = !createForm.value.system_name?.trim()
    ? t('common.validation.name-required', { entity: t('apikeys.entity') })
    : null

  if (Object.values(createErrors.value).some(v => v)) return

  const companyId = staffStore.staffInfo?.company_id
  if (!companyId) {
    showToast(t('common.validation.company-required'), 'error')
    return
  }

  creating.value = true
  // 将权限 ID 转换为权限名称
  const createPermNames = allPermissions.value
    .filter((p: any) => createForm.value.permissions.includes(p.id))
    .map((p: any) => p.name)
  await httpRequest('/api/system/third-party/api-keys', {
    method: 'POST',
    body: {
      system_name: createForm.value.system_name.trim(),
      company_id: companyId,
      webhook_url: createForm.value.webhook_url || null,
      webhook_secret: createForm.value.webhook_secret || null,
      permissions: createPermNames,
      webhook_subscriptions: [...createForm.value.webhook_subscriptions],
    },
    onSuccess: (data) => {
      newKeyResult.value = data.key
      showToast(t('action-results.success'), 'success')
      fetchData()
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      creating.value = false
    }
  })
}

// ==================== 复制密钥 ====================
const copyKey = async (key: string) => {
  try {
    await navigator.clipboard.writeText(key)
    showToast(t('apikeys.operations.copied'), 'success')
  } catch {
    showToast(t('apikeys.operations.copy-failed'), 'error')
  }
}

// ==================== 启用/禁用 ====================
const toggleActive = async (item: any) => {
  const newState = !item.is_active
  await httpRequest(`/api/system/third-party/api-keys/${item.id}`, {
    method: 'PUT',
    body: { is_active: newState },
    onSuccess: () => {
      showToast(t('action-results.success'), 'success')
      fetchData()
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    }
  })
}

// ==================== 删除 ====================
const deleteItem = async (itemId: number) => {
  const confirm = await showConfirm(
    t('action-results.delete-confirm-title'),
    t('action-results.delete-confirm', { entity: t('apikeys.entity') }),
    t('button.confirm'),
    t('button.cancel')
  )
  if (confirm) {
    await httpRequest(`/api/system/third-party/api-keys/${itemId}`, {
      method: 'DELETE',
      onSuccess: () => {
        showToast(t('action-results.success'), 'success')
        fetchData()
      },
      onError: (error) => {
        showToast(bizErrorMessage(error), 'error')
      }
    })
  }
}

// ==================== 状态 Tab ====================
const setActiveFilter = (status: boolean | null) => {
  const query: Record<string, any> = { ...route.query }
  if (status === null) {
    delete query.is_active
  } else {
    query.is_active = String(status)
  }
  query.page = '1'
  router.push({ query })
}

const activeTab = computed(() => {
  const statusParam = route.query.is_active
  return statusParam === 'false' ? 'inactive' : 'active'
})

// ==================== 搜索 ====================
async function search() {
  const query: Record<string, any> = { ...route.query, page: '1' }
  if (keyword.value.trim()) {
    query.keyword = keyword.value.trim()
  } else {
    delete query.keyword
  }
  await router.push({ query })
}

// ==================== 编辑 Modal ====================
const showEditModal = ref(false)
const editing = ref(false)
const editingItem = ref<any>(null)

const editForm = ref({
  system_name: '',
  webhook_url: '',
  webhook_secret: '',
  permissions: [] as number[],
  webhook_subscriptions: [] as string[],
})

const editErrors = ref({
  system_name: null as string | null,
})

const openEditModal = (item: any) => {
  editingItem.value = item
  // 将权限名称转换为权限 ID
  const permNames: string[] = item.permissions || []
  const permIds = allPermissions.value
    .filter((p: any) => permNames.includes(p.name))
    .map((p: any) => p.id)

  editForm.value = {
    system_name: item.system_name || '',
    webhook_url: item.webhook_url || '',
    webhook_secret: '',
    permissions: permIds,
    webhook_subscriptions: Array.isArray(item.webhook_subscriptions) ? [...item.webhook_subscriptions] : [],
  }
  editErrors.value = { system_name: null }
  showEditModal.value = true
}

const submitEdit = async () => {
  if(editing.value)return
  editErrors.value.system_name = !editForm.value.system_name?.trim()
    ? t('common.validation.name-required', { entity: t('apikeys.entity') })
    : null

  if (Object.values(editErrors.value).some(v => v)) return

  editing.value = true
  // 将权限 ID 转换回权限名称
  const permNames = allPermissions.value
    .filter((p: any) => editForm.value.permissions.includes(p.id))
    .map((p: any) => p.name)
  const body: any = {
    system_name: editForm.value.system_name.trim(),
    webhook_url: editForm.value.webhook_url || null,
    permissions: permNames,
    webhook_subscriptions: [...editForm.value.webhook_subscriptions],
  }
  // 只在填写了新密钥时才提交
  if (editForm.value.webhook_secret) {
    body.webhook_secret = editForm.value.webhook_secret
  }

  await httpRequest(`/api/system/third-party/api-keys/${editingItem.value.id}`, {
    method: 'PUT',
    body,
    onSuccess: () => {
      showToast(t('action-results.success'), 'success')
      showEditModal.value = false
      fetchData()
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      editing.value = false
    }
  })
}


const formModel=computed(()=>showEditModal.value?editForm.value:createForm.value)
const formErrors=computed(()=>showEditModal.value?editErrors.value:createErrors.value)
const formOpen=computed({get:()=>showCreateModal.value||showEditModal.value,set:(value:boolean)=>{if(!value){showCreateModal.value=false;showEditModal.value=false;newKeyResult.value=null}}})
const busy=computed(()=>creating.value||editing.value)
useHead({title:()=>t('nav.apikeys')})
</script>
<template><div class="w-api-keys w-scope"><header><div><h1>{{t('nav.apikeys')}}</h1><span>{{pageData?.total}}</span></div><div class="header-actions"><WButton v-if="staffStore.hasPermission('webhook_read')" to="/webhook-logs">{{t('nav.webhook-logs')}}</WButton><WButton v-if="staffStore.hasPermission('api_keys_edit')" variant="primary" icon="plus" @click="openCreateModal">{{t('apikeys.operations.add')}}</WButton></div></header><div class="filters"><div class="segments" role="group" :aria-label="t('common.fields.status')"><button v-for="key in ['active','inactive']" :key="key" type="button" :class="{active:activeTab===key}" :aria-pressed="activeTab===key" @click="setActiveFilter(key==='active')">{{t('common.status.'+key)}}</button></div><form @submit.prevent="search"><WInput v-model="keyword" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WButton type="submit">{{t('common.search')}}</WButton></form></div><WCard v-if="loading"><WEmptyState :title="t('common.status.loading')"/></WCard><WAlert v-else-if="loadError" tone="block" :title="loadError"><template #actions><WButton @click="fetchData">{{t('dn.list.retry')}}</WButton></template></WAlert><WCard v-else-if="!pageData?.items?.length"><WEmptyState :title="t('apikeys.tips.no-keys')"/></WCard><template v-else><WCard v-for="item in pageData.items" :key="item.id" flush><div class="key-heading"><h2>{{item.system_name}}</h2><WStatus :tone="item.is_active?'ok':'none'">{{t('common.status.'+(item.is_active?'active':'inactive'))}}</WStatus><code>{{item.key_prefix ? item.key_prefix+'…' : '—'}}</code><div class="key-actions"><WButton v-if="staffStore.hasPermission('api_keys_edit')" size="sm" @click="openEditModal(item)">{{t('button.edit')}}</WButton><WDropdown v-if="staffStore.hasPermission('api_keys_edit')||staffStore.hasPermission('api_keys_delete')" :label="t('common.fields.action')" placement="bottom-end" width="180px"><template #trigger="{attrs}"><WButton v-bind="attrs" class="key-more" size="sm" icon="more" icon-only :aria-label="t('common.fields.action')"/></template><button v-if="staffStore.hasPermission('api_keys_edit')" class="w-menu-item" role="menuitem" @click="toggleActive(item)">{{t('common.status.'+(item.is_active?'inactive':'active'))}}</button><button v-if="staffStore.hasPermission('api_keys_delete')" class="w-menu-item" role="menuitem" @click="deleteItem(item.id)">{{t('button.delete')}}</button></WDropdown></div></div><div class="key-grid"><section><h3>{{t('apikeys.fields.permissions')}} · {{item.permissions?.length||0}}</h3><dl><template v-for="mod in permissionSummaries[item.id]?.modules" :key="mod.label"><dt>{{t(mod.label)}}</dt><dd :title="mod.items.map(i=>i.name).join(', ')">{{mod.items.filter(i=>i.opLabel).map(i=>t(i.opLabel!)).join(' / ')||'—'}}</dd></template></dl><span v-for="permission in permissionSummaries[item.id]?.others" :key="permission">{{permission}}</span><span v-if="!item.permissions?.length">—</span></section><section><h3>{{t('apikeys.fields.webhook-url')}}</h3><template v-if="item.webhook_url"><code class="webhook-url">{{item.webhook_url}}</code><WStatus :tone="item.has_webhook_secret?'ok':'warn'">{{t(item.has_webhook_secret?'api-key-review.signed':'api-key-review.unsigned')}}</WStatus><div class="subscriptions"><span :title="t('api-key-review.document-events-help')">{{t('api-key-review.document-events')}}</span><div v-for="event in WEBHOOK_SUBSCRIPTION_EVENTS" :key="event" class="subscription-row"><span>{{eventLabel(event)}}<small>{{event}}</small></span><WStatus :tone="item.webhook_subscriptions?.includes(event)?'ok':'none'">{{t(item.webhook_subscriptions?.includes(event)?'api-key-review.subscribed':'api-key-review.unsubscribed')}}</WStatus></div></div></template><span v-else class="key-muted">{{t('api-key-review.no-url')}}</span></section><section><h3>{{t('api-key-review.recent')}}</h3><small>{{t('api-key-review.call-unrecorded')}}</small><template v-if="staffStore.hasPermission('webhook_read')"><small v-if="recentLoading">{{t('common.status.loading')}}</small><WAlert v-else-if="recentError" tone="warn" :title="recentError"><template #actions><WButton size="sm" @click="loadRecent(pageData.items.map((key:any)=>key.id),loadGeneration)">{{t('dn.list.retry')}}</WButton></template></WAlert><dl v-else-if="recentByKey[item.id]"><dt>{{t('api-key-review.latest-event')}}</dt><dd><template v-if="recentByKey[item.id].latest_event"><WStatus :tone="recentByKey[item.id].latest_event.status==='failed'?'bad':recentByKey[item.id].latest_event.status==='sent'?'ok':'none'">{{t('webhook-logs.status.'+recentByKey[item.id].latest_event.status)}}</WStatus><small>{{recentByKey[item.id].latest_event.created_at?$dayjs(recentByKey[item.id].latest_event.created_at,'YYYY-MM-DD HH:mm'):'—'}}</small></template><span v-else>{{t('api-key-review.no-events')}}</span></dd><dt>{{t('api-key-review.failed')}}</dt><dd><NuxtLink v-if="recentByKey[item.id].failed_count" :to="'/webhook-logs?status=failed&api_key_id='+item.id">{{recentByKey[item.id].failed_count}} →</NuxtLink><span v-else>0</span></dd></dl><WButton size="sm" :to="'/webhook-logs?api_key_id='+item.id">{{t('nav.webhook-logs')}} →</WButton></template><small v-else>{{t('api-key-review.no-log-permission')}}</small></section></div></WCard></template><WPagination :page="pageData?.page||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/><WDrawer v-model:open="formOpen" :title="t(showEditModal?'apikeys.operations.edit':'apikeys.operations.add')" width="600px" :closable="!busy" :close-on-backdrop="!busy"><div v-if="newKeyResult" class="key-result"><WAlert tone="warn" :title="t('apikeys.tips.key-warning')"/><WInput :model-value="newKeyResult" readonly :aria-label="t('apikeys.fields.key')"/><WButton @click="copyKey(newKeyResult)">{{t('apikeys.operations.copy')}}</WButton></div><fieldset v-else :disabled="busy" class="key-form"><WField :label="t('apikeys.fields.system-name')" required :error="formErrors.system_name"><WInput v-model="formModel.system_name" :placeholder="t('apikeys.form.placeholders.system-name')"/></WField><WField :label="t('apikeys.fields.webhook-url')"><WInput v-model="formModel.webhook_url" :placeholder="t('apikeys.form.placeholders.webhook-url')"/></WField><WField :label="t('apikeys.fields.webhook-secret')"><SecretInput v-model="formModel.webhook_secret" autocomplete="new-password" :placeholder="showEditModal&&editingItem?.has_webhook_secret?t('apikeys.form.placeholders.webhook-secret-keep'):t('apikeys.form.placeholders.webhook-secret')"/></WField><section><h3>{{t('apikeys.fields.webhook-subscriptions')}}</h3><small>{{t('apikeys.tips.subscriptions')}}</small><WCheckbox v-for="event in WEBHOOK_SUBSCRIPTION_EVENTS" :key="event" :model-value="formModel.webhook_subscriptions.includes(event)" @update:model-value="toggleSubscription(formModel.webhook_subscriptions,event)">{{eventLabel(event)}} <code>{{event}}</code></WCheckbox><small v-if="formModel.webhook_subscriptions.length&&!formModel.webhook_url">{{t('apikeys.tips.subscriptions-need-url')}}</small></section><section><h3>{{t('apikeys.fields.permissions')}}</h3><div v-if="!showEditModal" class="templates"><WButton v-for="tpl in API_KEY_TEMPLATES" :key="tpl.key" size="sm" :variant="activeTemplateKey===tpl.key?'primary':'secondary'" :title="t('apikeys.templates.'+tpl.key+'.desc')" @click="applyTemplate(tpl)">{{t('apikeys.templates.'+tpl.key+'.name')}}</WButton><WButton size="sm" @click="createForm.permissions=[]">{{t('button.reset')}}</WButton></div><PermissionSelector v-if="apiKeyPermissions.length" :all-permissions="apiKeyPermissions" v-model="formModel.permissions"/></section></fieldset><template #footer><WButton :disabled="busy" @click="formOpen=false">{{t(newKeyResult?'button.close':'button.cancel')}}</WButton><WButton v-if="!newKeyResult" variant="primary" :loading="busy" @click="showEditModal?submitEdit():submitCreate()">{{t(showEditModal?'button.save':'apikeys.operations.add')}}</WButton></template></WDrawer></div></template>
<style scoped>
.w-api-keys{display:flex;flex-direction:column;gap:16px}header,header>div{display:flex;align-items:center;gap:12px}header{justify-content:space-between;flex-wrap:wrap}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}header span{font-size:13px;color:var(--w-text-2)}.filters,.filters form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.filters form{margin-left:auto}.filters .w-input{width:300px;max-width:100%}.segments{display:flex;padding:2px;border-radius:6px;background:#EDEFF3}.segments button{height:28px;padding:0 12px;border:0;border-radius:6px;font:inherit;font-size:13px;line-height:20px;color:var(--w-text-2);background:transparent}.segments button.active{background:white;box-shadow:0 1px 2px #10121b1a;color:var(--w-text-1);font-weight:600}.key-heading{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:16px 24px;border-bottom:1px solid var(--w-line)}h2{font-size:16px;line-height:24px;font-weight:600;margin:0}.key-heading code{border:1px solid var(--w-border);border-radius:6px;padding:1px 6px;line-height:16px}.key-actions{display:flex;gap:8px;margin-left:auto}.key-grid{display:grid;grid-template-columns:1fr 1fr .85fr}.key-grid section{padding:16px 24px 20px;display:flex;flex-direction:column;gap:8px;min-width:0}.key-grid section+section{border-left:1px solid var(--w-line)}h3{font-size:12px;line-height:18px;font-weight:500;color:var(--w-text-3);margin:0}.key-grid dl{display:grid;grid-template-columns:72px minmax(0,1fr);gap:6px 12px;font-size:13px;line-height:20px;margin:0}.key-grid dt{color:var(--w-text-3);font-weight:400}.key-grid dd{margin:0;overflow-wrap:anywhere}code{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--w-text-2)}.webhook-url{overflow-wrap:anywhere}.subscriptions{display:flex;flex-direction:column;gap:8px;font-size:13px;border-top:1px solid var(--w-line);padding-top:8px}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.key-form{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:16px;min-width:0}.key-form section{border-top:1px solid var(--w-line);padding-top:16px;display:flex;flex-direction:column;gap:8px}.key-form h3{font-size:14px;line-height:22px;font-weight:600;color:var(--w-text-1)}.templates{display:flex;flex-wrap:wrap;gap:8px}.header-actions{display:flex;gap:8px;flex-wrap:wrap}.key-more{color:var(--w-text-1)}.subscription-row{display:flex;align-items:start;justify-content:space-between;gap:8px;flex-wrap:wrap}.key-muted{font-size:13px;line-height:20px;color:var(--w-text-3)}.key-result{display:flex;flex-direction:column;gap:16px}@media(max-width:1000px){.key-grid{grid-template-columns:minmax(0,1fr)}.key-grid section+section{border-left:0;border-top:1px solid var(--w-line)}}@media(max-width:600px){.filters form{margin-left:0;width:100%}.filters .w-input{width:100%}.key-actions{margin-left:0;flex-wrap:wrap}}
</style>
