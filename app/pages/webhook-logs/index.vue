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
const fetchData = async () => {
  loading.value = true
  await httpRequest<PaginationData>('/api/system/webhook/', {
    method: 'GET',
    params: { ...route.query },
    onSuccess: (data) => {
      pageData.value = data
    },
    onError: (error) => {
      showToast(error.message, 'error')
    },
    onFinally: () => {
      loading.value = false
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
const fetchApiKeys = async () => {
  if (!staffStore.staffInfo) {
    await staffStore.getCurrentStaffInfo()
  }
  const companyId = staffStore.staffInfo?.company_id
  if (!companyId) return
  await httpRequest<PaginationData>('/api/system/third-party/api-keys', {
    method: 'GET',
    params: { company_id: companyId, per_page: 100 },
    onSuccess: (data) => {
      const names: Record<string, string> = {}
      for (const key of data?.items || []) {
        if (key?.id !== undefined && key?.system_name) names[String(key.id)] = key.system_name
      }
      apiKeyNames.value = names
    },
  })
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
  retrying.value = eventId
  await httpRequest(`/api/system/webhook/${eventId}/retry`, {
    method: 'POST',
    onSuccess: () => {
      showToast(t('webhook-logs.operations.retry-success'), 'success')
      fetchData()
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

</script>

<template>
  <PageHeader :propData="dataToPass" />

  <!-- Loading -->
  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>

  <!-- Content -->
  <div class="row" v-else>
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-header justify-content-between">
          <div class="card-title">
            {{ t('webhook-logs.title') }}
            <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total }}</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <!-- 事件类型筛选 -->
            <select class="form-select form-select-sm" style="width: 240px;" v-model="eventTypeFilter"
              @change="setEventTypeFilter">
              <option value="">{{ t('webhook-logs.filters.all-types') }}</option>
              <option v-for="et in eventTypes" :key="et" :value="et">{{ eventLabel(et) }} ({{ et }})</option>
            </select>
            <!-- 关键词搜索 -->
            <div class="d-flex" role="search">
              <input class="form-control me-2" type="search" :placeholder="t('common.search-placeholder')"
                v-model="keyword" style="width: auto;" @keyup.enter="search">
              <button class="btn btn-light" type="submit" @click="search">{{ t('common.search') }}</button>
            </div>
          </div>
        </div>
        <div class="card-body">
          <!-- Status Tabs -->
          <div>
            <ul class="nav nav-pills nav-style-3 mb-3" role="tablist">
              <li class="nav-item" v-for="tab in statusTabs" :key="tab">
                <a class="nav-link" :class="{ active: activeTab === tab }" href="javascript:void(0);"
                  @click="setStatusFilter(tab)">
                  {{ t(`webhook-logs.status.${tab}`) }}
                </a>
              </li>
            </ul>
          </div>

          <!-- Table -->
          <div class="table-responsive">
            <table class="table text-nowrap table-bordered table-hover">
              <thead>
                <tr>
                  <th scope="col">{{ t('common.fields.id') }}</th>
                  <th scope="col">{{ t('webhook-logs.fields.event-type') }}</th>
                  <th scope="col">{{ t('webhook-logs.fields.target-system') }}</th>
                  <th scope="col">{{ t('common.fields.status') }}</th>
                  <th scope="col">{{ t('webhook-logs.fields.attempts') }}</th>
                  <th scope="col" class="d-none d-xxl-table-cell">{{ t('webhook-logs.fields.last-error') }}</th>
                  <th scope="col">{{ t('webhook-logs.fields.created-at') }}</th>
                  <th scope="col">{{ t('common.fields.action') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pageData?.items" :key="item.id">
                  <td>{{ item.id }}</td>
                  <td>
                    <span class="badge bg-primary-transparent">{{ eventLabel(item.event_type) }}</span>
                    <div class="fs-11 text-muted font-monospace">{{ item.event_type }}</div>
                  </td>
                  <td :title="item.api_key_id !== null && item.api_key_id !== undefined ? `API Key #${item.api_key_id}` : undefined">{{ targetSystemName(item.api_key_id) }}</td>
                  <td>
                    <span class="badge" :class="statusBadgeClass(item.status)">
                      {{ t(`webhook-logs.status.${item.status}`) }}
                    </span>
                  </td>
                  <td>{{ item.attempts }}</td>
                  <td class="d-none d-xxl-table-cell">
                    <span v-if="item.last_error" class="text-danger fs-12" :title="item.last_error">
                      {{ truncateError(item.last_error) }}
                    </span>
                    <span v-else class="text-muted fs-12">—</span>
                  </td>
                  <td>{{ formatDate(item.created_at, item) }}</td>
                  <td>
                    <div class="hstack gap-2 fs-15">
                      <!-- 详情 -->
                      <button @click="openDetail(item)"
                        class="btn btn-icon btn-sm btn-info-light product-btn"
                        :title="t('webhook-logs.operations.detail')">
                        <i class="ri-eye-line"></i>
                      </button>
                      <!-- 重试 -->
                      <button v-if="canRetry(item)" @click="retryEvent(item.id)"
                        class="btn btn-icon btn-sm btn-warning-light product-btn"
                        :disabled="retrying === item.id"
                        :title="t('webhook-logs.operations.retry')">
                        <i class="ri-loader-4-line spin-icon" v-if="retrying === item.id"></i>
                        <i v-else class="ri-refresh-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-center p-5 border border-top-0" v-if="pageData?.items?.length == 0">
              {{ t('webhook-logs.tips.no-events') }}
            </div>
          </div>
        </div>
        <div class="card-footer border-top-0">
          <div class="d-flex align-items-center justify-content-between flex-wrap">
            <template v-if="pageData">
              <Pagination :page-size="pageData?.per_page" :current-page="pageData?.page" :total="pageData?.total"
                :params="$route.query" v-if="pageData.pages > 1" />
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== Detail Modal ==================== -->
  <Teleport to="body">
    <div class="modal fade" :class="{ show: showDetailModal }" :style="{ display: showDetailModal ? 'block' : 'none' }"
      tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ t('webhook-logs.operations.detail') }}</h6>
            <button type="button" class="btn-close" @click="showDetailModal = false"></button>
          </div>
          <div class="modal-body" v-if="detailItem">
            <div class="row mb-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('common.fields.id') }}</label>
                <p>{{ detailItem.id }}</p>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('webhook-logs.fields.event-type') }}</label>
                <p>
                  <span class="badge bg-primary-transparent">{{ eventLabel(detailItem.event_type) }}</span>
                  <code class="fs-11 ms-1">{{ detailItem.event_type }}</code>
                </p>
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('common.fields.status') }}</label>
                <p>
                  <span class="badge" :class="statusBadgeClass(detailItem.status)">
                    {{ t(`webhook-logs.status.${detailItem.status}`) }}
                  </span>
                </p>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('webhook-logs.fields.attempts') }}</label>
                <p>{{ detailItem.attempts }}</p>
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('webhook-logs.fields.created-at') }}</label>
                <p>{{ formatDate(detailItem.created_at, detailItem) }}</p>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('webhook-logs.fields.sent-at') }}</label>
                <p>{{ formatDate(detailItem.sent_at, detailItem) }}</p>
              </div>
            </div>
            <div class="mb-3" v-if="detailItem.next_retry_at">
              <label class="form-label fw-semibold">{{ t('webhook-logs.fields.next-retry') }}</label>
              <p>{{ formatDate(detailItem.next_retry_at, detailItem) }}</p>
            </div>
            <div class="mb-3" v-if="detailItem.last_error">
              <label class="form-label fw-semibold">{{ t('webhook-logs.fields.last-error') }}</label>
              <div class="alert alert-danger-transparent fs-12 font-monospace mb-0">
                {{ detailItem.last_error }}
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">{{ t('webhook-logs.fields.payload') }}</label>
              <pre class="bg-light p-3 rounded fs-12" style="max-height: 300px; overflow: auto;">{{ JSON.stringify(detailItem.payload, null, 2) }}</pre>
            </div>
          </div>
          <div class="modal-footer">
            <button v-if="canRetry(detailItem)" type="button" class="btn btn-warning"
              @click="retryEvent(detailItem.id)" :disabled="retrying === detailItem?.id">
              <span v-if="retrying === detailItem?.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-refresh-line me-1"></i>{{ t('webhook-logs.operations.retry') }}
            </button>
            <button type="button" class="btn btn-light" @click="showDetailModal = false">
              {{ t('button.close') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showDetailModal" @click="showDetailModal = false"></div>
  </Teleport>
</template>

<style scoped>
.spin-icon {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
