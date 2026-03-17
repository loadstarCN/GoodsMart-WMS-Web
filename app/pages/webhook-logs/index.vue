<script lang="ts" setup>

// 定义页面元数据
definePageMeta({})

// 获取国际化方法
const { t } = useI18n()

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
  await fetchData()
})

// ==================== 状态 Tab ====================
const statusTabs = ['all', 'pending', 'sent', 'failed'] as const

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
const eventTypes = [
  'asn.received',
  'asn.completed',
  'dn.in_progress',
  'dn.delivered',
  'dn.completed',
]

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
    default: return 'bg-secondary-transparent'
  }
}

// ==================== 格式化 ====================
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString()
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
            <select class="form-select form-select-sm" style="width: 160px;" v-model="eventTypeFilter"
              @change="setEventTypeFilter">
              <option value="">{{ t('webhook-logs.filters.all-types') }}</option>
              <option v-for="et in eventTypes" :key="et" :value="et">{{ et }}</option>
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
                  <th scope="col">{{ t('webhook-logs.fields.api-key') }}</th>
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
                    <span class="badge bg-primary-transparent">{{ item.event_type }}</span>
                  </td>
                  <td>{{ item.api_key_id }}</td>
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
                  <td>{{ formatDate(item.created_at) }}</td>
                  <td>
                    <div class="hstack gap-2 fs-15">
                      <!-- 详情 -->
                      <button @click="openDetail(item)"
                        class="btn btn-icon btn-sm btn-info-light product-btn"
                        :title="t('webhook-logs.operations.detail')">
                        <i class="ri-eye-line"></i>
                      </button>
                      <!-- 重试 -->
                      <button v-if="item.status === 'failed'" @click="retryEvent(item.id)"
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
                <p><span class="badge bg-primary-transparent">{{ detailItem.event_type }}</span></p>
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
                <p>{{ detailItem.attempts }} / 10</p>
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('webhook-logs.fields.created-at') }}</label>
                <p>{{ formatDate(detailItem.created_at) }}</p>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">{{ t('webhook-logs.fields.sent-at') }}</label>
                <p>{{ formatDate(detailItem.sent_at) }}</p>
              </div>
            </div>
            <div class="mb-3" v-if="detailItem.next_retry_at">
              <label class="form-label fw-semibold">{{ t('webhook-logs.fields.next-retry') }}</label>
              <p>{{ formatDate(detailItem.next_retry_at) }}</p>
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
            <button v-if="detailItem && detailItem.status === 'failed'" type="button" class="btn btn-warning"
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
