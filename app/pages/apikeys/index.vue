<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
})

// 获取国际化方法
const { t } = useI18n()

// 面包屑
const dataToPass = computed(() => ({
  current: t('nav.apikeys'),
  list: [t('nav.SYSTEM'), t('nav.apikeys')]
}))

const staffStore = useStaffStore()
const router = useRouter()
const route = useRoute()
let loading = ref(true)
let keyword = ref('')
let pageData = ref<PaginationData | null>(null)

// ==================== 列表数据 ====================
const fetchData = async () => {
  loading.value = true
  const companyId = staffStore.staffInfo?.company_id
  if (!companyId) {
    showToast(t('common.validation.company-required'), 'error')
    loading.value = false
    return
  }

  await httpRequest<PaginationData>('/api/system/third-party/api-keys', {
    method: 'GET',
    params: { ...route.query, company_id: companyId },
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
  if (!staffStore.staffInfo) {
    await staffStore.getCurrentStaffInfo()
  }
  await fetchData()
})

// ==================== 创建 Modal ====================
const showCreateModal = ref(false)
const creating = ref(false)
const newKeyResult = ref<string | null>(null) // 创建成功后显示 key

const createForm = ref({
  system_name: '',
  webhook_url: '',
  webhook_secret: '',
})

const createErrors = ref({
  system_name: null as string | null,
})

const openCreateModal = () => {
  createForm.value = { system_name: '', webhook_url: '', webhook_secret: '' }
  createErrors.value = { system_name: null }
  newKeyResult.value = null
  showCreateModal.value = true
}

const submitCreate = async () => {
  // 验证
  createErrors.value.system_name = !createForm.value.system_name?.trim()
    ? t('common.validation.name-required')
    : null

  if (Object.values(createErrors.value).some(v => v)) return

  const companyId = staffStore.staffInfo?.company_id
  if (!companyId) {
    showToast(t('common.validation.company-required'), 'error')
    return
  }

  creating.value = true
  await httpRequest('/api/system/third-party/api-keys', {
    method: 'POST',
    body: {
      system_name: createForm.value.system_name.trim(),
      company_id: companyId,
      webhook_url: createForm.value.webhook_url || null,
      webhook_secret: createForm.value.webhook_secret || null,
    },
    onSuccess: (data) => {
      newKeyResult.value = data.key
      showToast(t('action-results.success'), 'success')
      fetchData()
    },
    onError: (error) => {
      showToast(error.message, 'error')
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
    showToast('Copy failed', 'error')
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
      showToast(error.message, 'error')
    }
  })
}

// ==================== 删除 ====================
const deleteItem = async (itemId: number) => {
  const confirm = await showConfirm(
    t('action-results.delete-confirm-title'),
    t('action-results.delete-confirm'),
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
        showToast(error.message, 'error')
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
  await router.push({ query: { ...route.query, system_name: keyword.value.trim(), page: '1' } })
}

// ==================== 遮蔽密钥 ====================
const maskKey = (key: string) => {
  if (!key || key.length < 12) return key
  return key.slice(0, 8) + '••••••••' + key.slice(-4)
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
            {{ t('apikeys.title') }}
            <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total }}</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-primary btn-wave" @click="openCreateModal">
                <i class="ri-add-line me-1 fw-semibold align-middle"></i>{{ t('apikeys.operations.add') }}
              </button>
            </div>
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
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'active' }" href="javascript:void(0);"
                  @click="setActiveFilter(true)">{{ t('common.status.active') }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'inactive' }" href="javascript:void(0);"
                  @click="setActiveFilter(false)">{{ t('common.status.inactive') }}</a>
              </li>
            </ul>
          </div>

          <!-- Table -->
          <div class="table-responsive">
            <table class="table text-nowrap table-bordered table-hover">
              <thead>
                <tr>
                  <th scope="col">{{ t('common.fields.id') }}</th>
                  <th scope="col">{{ t('apikeys.fields.system-name') }}</th>
                  <th scope="col">{{ t('apikeys.fields.key') }}</th>
                  <th scope="col" class="d-none d-xxl-table-cell">{{ t('apikeys.fields.permissions') }}</th>
                  <th scope="col" class="d-none d-xxl-table-cell">{{ t('apikeys.fields.webhook-url') }}</th>
                  <th scope="col">{{ t('common.fields.status') }}</th>
                  <th scope="col">{{ t('common.fields.action') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pageData?.items" :key="item.id">
                  <td>{{ item.id }}</td>
                  <td>
                    <span class="fw-semibold">{{ item.system_name }}</span>
                  </td>
                  <td>
                    <code class="fs-12">{{ maskKey(item.key) }}</code>
                    <button class="btn btn-icon btn-sm btn-light ms-1" @click="copyKey(item.key)"
                      :title="t('apikeys.operations.copy')">
                      <i class="ri-file-copy-line"></i>
                    </button>
                  </td>
                  <td class="d-none d-xxl-table-cell">
                    <span v-if="item.permissions && item.permissions.length > 0">
                      <span class="badge bg-primary-transparent me-1" v-for="perm in item.permissions" :key="perm">{{ perm }}</span>
                    </span>
                    <span v-else class="text-muted fs-12">—</span>
                  </td>
                  <td class="d-none d-xxl-table-cell">
                    <span v-if="item.webhook_url" class="text-truncate d-inline-block" style="max-width: 200px;">{{ item.webhook_url }}</span>
                    <span v-else class="text-muted fs-12">—</span>
                  </td>
                  <td>
                    <span class="badge" :class="item.is_active ? 'bg-success-transparent' : 'bg-danger-transparent'">
                      {{ item.is_active ? t('common.status.active') : t('common.status.inactive') }}
                    </span>
                  </td>
                  <td>
                    <div class="hstack gap-2 fs-15">
                      <button @click="toggleActive(item)"
                        class="btn btn-icon btn-sm btn-warning-light product-btn"
                        :title="item.is_active ? t('common.status.inactive') : t('common.status.active')">
                        <i :class="item.is_active ? 'ri-eye-off-line' : 'ri-eye-line'"></i>
                      </button>
                      <button @click="deleteItem(item.id)"
                        class="btn btn-icon btn-sm btn-danger-light product-btn">
                        <i class="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-center p-5 border border-top-0" v-if="pageData?.items?.length == 0">
              {{ t('apikeys.tips.no-keys') }}
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

  <!-- ==================== Create Modal ==================== -->
  <Teleport to="body">
    <div class="modal fade" :class="{ show: showCreateModal }" :style="{ display: showCreateModal ? 'block' : 'none' }"
      tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ t('apikeys.operations.add') }}</h6>
            <button type="button" class="btn-close" @click="showCreateModal = false"></button>
          </div>
          <div class="modal-body">
            <!-- 创建成功后显示 Key -->
            <div v-if="newKeyResult" class="mb-3">
              <div class="alert alert-success-transparent">
                <div class="mb-2 fw-semibold">
                  <i class="ri-check-line me-1"></i>{{ t('action-results.success') }}
                </div>
                <p class="fs-12 mb-2 text-warning">
                  <i class="ri-error-warning-line me-1"></i>{{ t('apikeys.tips.key-warning') }}
                </p>
                <div class="input-group">
                  <input type="text" class="form-control form-control-sm font-monospace" :value="newKeyResult" readonly>
                  <button class="btn btn-sm btn-outline-primary" @click="copyKey(newKeyResult!)">
                    <i class="ri-file-copy-line me-1"></i>{{ t('apikeys.operations.copy') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 创建表单 -->
            <div v-if="!newKeyResult">
              <div class="mb-3">
                <label class="form-label">{{ t('apikeys.fields.system-name') }}
                  <abbr title="required" class="text-danger">*</abbr>
                </label>
                <input type="text" class="form-control" v-model="createForm.system_name"
                  :placeholder="t('apikeys.form.placeholders.system-name')">
                <div v-if="createErrors.system_name" class="invalid-feedback d-block">{{ createErrors.system_name }}</div>
              </div>
              <div class="mb-3">
                <label class="form-label">{{ t('apikeys.fields.webhook-url') }}</label>
                <input type="text" class="form-control" v-model="createForm.webhook_url"
                  :placeholder="t('apikeys.form.placeholders.webhook-url')">
              </div>
              <div class="mb-3">
                <label class="form-label">{{ t('apikeys.fields.webhook-secret') }}</label>
                <input type="text" class="form-control" v-model="createForm.webhook_secret"
                  :placeholder="t('apikeys.form.placeholders.webhook-secret')">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" @click="showCreateModal = false">
              {{ newKeyResult ? t('button.close') : t('button.cancel') }}
            </button>
            <button v-if="!newKeyResult" type="button" class="btn btn-primary" @click="submitCreate"
              :disabled="creating">
              <span v-if="creating" class="spinner-border spinner-border-sm me-1"></span>
              {{ t('apikeys.operations.add') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showCreateModal" @click="showCreateModal = false"></div>
  </Teleport>
</template>

<style scoped></style>
