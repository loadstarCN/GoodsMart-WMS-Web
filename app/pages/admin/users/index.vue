<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
const authStore = useAuthStore();

const dataToPass = computed(() => ({
  current: t('admin.nav.users'),
  list: [t('admin.title'), t('admin.nav.users')]
}));

const router = useRouter();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    await httpRequest<PaginationData>('/api/system/user/users', {
        method: 'GET',
        // 默认展示启用中的用户，与下方 Tab 高亮保持一致
        params: { is_active: 'true', ...route.query },
        onSuccess: async(data) => {
            pageData.value = data;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
            loading.value = false;
        }
    })
};

watch(() => route.query, async () => {
    await fetchData();
});

async function search() {
    const query: Record<string, any> = { ...route.query, page: 1 };
    if (keyword.value.trim()) {
        query.keyword = keyword.value.trim();
    } else {
        delete query.keyword;
    }
    await router.push({ query });
}

// ==================== 角色选项（用于新增/编辑弹窗） ====================
let roleOptions = ref<string[]>([]);

const fetchRoles = async () => {
    if (roleOptions.value.length > 0) return;
    await httpRequest<any>('/api/system/user/roles', {
        method: 'GET',
        params: { all: true },
        onSuccess: (data) => {
            const items = Array.isArray(data) ? data : (data?.items || []);
            roleOptions.value = items.map((r: any) => r.name).filter(Boolean);
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    });
};

onMounted(async() => {
    keyword.value = (route.query.keyword as string) || '';
    fetchData();
});

// 当前登录的管理员自己：隐藏删除/停用按钮
const isSelf = (user: any) => String(user?.id) === String(authStore.userInfo?.id);

const deleteItem = async (item_id: Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('common.entities.user') }), t('button.confirm'), t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/system/user/users/${item_id}`, {
            method: 'DELETE',
            onSuccess: async() => {
                showToast(t('action-results.success'), 'success')
                await fetchData();
            },
            onError: (error) => {
                showToast(error.message, 'error')
            }
        })
    }
}

const activeItem = async (item_id: Number) => {
    await httpRequest(`/api/system/user/users/${item_id}`, {
        method: 'PUT',
        body: { is_active: true },
        onSuccess: async() => {
            showToast(t('action-results.success'), 'success')
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
}

const inactiveItem = async (item_id: Number) => {
    await httpRequest(`/api/system/user/users/${item_id}`, {
        method: 'PUT',
        body: { is_active: false },
        onSuccess: async() => {
            showToast(t('action-results.success'), 'success')
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
}

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

// ==================== 新增 / 编辑弹窗 ====================
const showModal = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);

const form = ref({
    user_name: '',
    email: '',
    password: '',
    roles: [] as string[],
    is_active: true,
});

let formErrors = ref<Record<string, string>>({});

const openCreateModal = async () => {
    editingId.value = null;
    form.value = { user_name: '', email: '', password: '', roles: [], is_active: true };
    formErrors.value = {};
    showModal.value = true;
    await fetchRoles();
};

const openEditModal = async (user: any) => {
    editingId.value = user.id;
    form.value = {
        user_name: user.user_name || '',
        email: user.email || '',
        password: '',
        roles: [...(user.roles || [])],
        is_active: user.is_active ?? true,
    };
    formErrors.value = {};
    showModal.value = true;
    await fetchRoles();
};

const validateForm = () => {
    formErrors.value = {};
    if (!form.value.user_name.trim()) {
        formErrors.value.user_name = t('common.validation.name-required', { entity: t('common.entities.user') });
    }
    if (!form.value.email.trim()) {
        formErrors.value.email = t('common.validation.email-required');
    } else if (!/\S+@\S+\.\S+/.test(form.value.email)) {
        formErrors.value.email = t('common.validation.email-format');
    }
    // 新增必须填密码；编辑留空表示不修改
    if (!editingId.value && !form.value.password) {
        formErrors.value.password = t('common.validation.password-required');
    }
    if (form.value.roles.length === 0) {
        formErrors.value.roles = t('common.validation.role-min-count');
    }
    return Object.keys(formErrors.value).length === 0;
};

const submitForm = async () => {
    if (!validateForm()) return;
    saving.value = true;
    const body: Record<string, any> = {
        user_name: form.value.user_name.trim(),
        email: form.value.email.trim(),
        roles: form.value.roles,
        is_active: form.value.is_active,
    };
    if (form.value.password) {
        body.password = form.value.password;
    }
    const isEdit = !!editingId.value;
    await httpRequest(isEdit ? `/api/system/user/users/${editingId.value}` : '/api/system/user/users', {
        method: isEdit ? 'PUT' : 'POST',
        body,
        onSuccess: async () => {
            showToast(t('action-results.success'), 'success');
            showModal.value = false;
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error');
        },
        onFinally: () => {
            saving.value = false;
        }
    });
};

</script>

<template>
  <PageHeader :propData="dataToPass" />

  <div class="row d-flex justify-content-center mb-4" v-if="loading">
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
        </div>
  </div>
  <div class="row" v-else>
        <div class="col-xl-12">
            <div class="card custom-card">
                <div class="card-header justify-content-between">
                    <div class="card-title">
                        {{ t('admin.users.title') }} <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total }}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn btn-primary btn-wave" @click="openCreateModal"><i class="ri-add-line me-1 fw-semibold align-middle"></i>{{ t('admin.users.operations.add') }}</button>
                        </div>
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')" v-model="keyword" style="width: auto;" @keyup.enter="search">
                            <button class="btn btn-light" type="submit" @click="search">{{ t('common.search') }}</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div>
                        <ul class="nav nav-pills nav-style-3 mb-3" role="tablist">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'active' }" href="javascript:void(0);" @click="setActiveFilter(true)">{{ t('common.status.active') }}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'inactive' }" href="javascript:void(0);" @click="setActiveFilter(false)">{{ t('common.status.inactive') }}</a>
                            </li>
                        </ul>
                    </div>

                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered table-hover">
                            <thead>
                                <tr>
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ t('common.fields.name') }}</th>
                                    <th scope="col">{{ t('common.fields.email') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('admin.users.company') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.fields.type') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('staff.fields.roles') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.created') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="user in pageData?.items" :key="user?.id" class="invoice-list">
                                    <td class="d-none d-md-table-cell">{{ user?.id }}</td>
                                    <td>{{ user?.user_name }}</td>
                                    <td>{{ user?.email }}</td>
                                    <td class="d-none d-lg-table-cell">{{ user?.company_name || '-' }}</td>
                                    <td class="d-none d-xxl-table-cell">
                                      <span class="badge" :class="user?.type === 'user' ? 'bg-primary-transparent' : 'bg-info-transparent'">
                                        {{ user?.type === 'user' ? t('admin.users.type-admin') : t('admin.users.type-staff') }}
                                      </span>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">
                                      <span v-for="role in user?.roles" :key="role" class="badge bg-light text-default me-1">{{ role }}</span>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(user?.created_at) }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">
                                            <NuxtLink href="javascript:void(0);" @click="openEditModal(user)" class="btn btn-icon btn-sm btn-info-light product-btn" :title="t('admin.users.operations.edit')"><i class="ri-edit-line"></i></NuxtLink>
                                            <template v-if="!isSelf(user)">
                                                <NuxtLink href="javascript:void(0);" @click="inactiveItem(user.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-if="activeTab === 'active'"><i class="ri-eye-off-line"></i></NuxtLink>
                                                <NuxtLink href="javascript:void(0);" @click="activeItem(user.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-else><i class="ri-eye-line"></i></NuxtLink>
                                                <NuxtLink href="javascript:void(0);" @click="deleteItem(user.id)" class="btn btn-icon btn-sm btn-danger-light product-btn"><i class="ri-delete-bin-line"></i></NuxtLink>
                                            </template>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="text-center p-5 border border-top-0" v-if="pageData?.items?.length==0">{{ t('common.status.nothing-show')}}</div>
                    </div>
                </div>
                <div class="card-footer border-top-0">
                    <div class="d-flex align-items-center justify-content-between flex-wrap">
                        <template v-if="pageData">
                            <Pagination :page-size=pageData?.per_page
                                :current-page=pageData?.page
                                :total=pageData?.total
                                :params=$route.query
                                v-if="pageData.pages > 1"></Pagination>
                        </template>
                    </div>
                </div>
            </div>
        </div>
      </div>

  <!-- ==================== Create / Edit Modal ==================== -->
  <Teleport to="body">
    <div class="modal fade" :class="{ show: showModal }" :style="{ display: showModal ? 'block' : 'none' }"
      tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ editingId ? t('admin.users.operations.edit') : t('admin.users.operations.add') }}</h6>
            <button type="button" class="btn-close" @click="showModal = false"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="submitForm" autocomplete="off">
              <div class="mb-3">
                <label class="form-label">{{ t('common.fields.name') }} <span class="text-danger">*</span></label>
                <input type="text" class="form-control" v-model="form.user_name" :class="{'is-invalid': formErrors.user_name}" :placeholder="t('common.placeholders.name')">
                <div class="invalid-feedback">{{ formErrors.user_name }}</div>
              </div>
              <div class="mb-3">
                <label class="form-label">{{ t('common.fields.email') }} <span class="text-danger">*</span></label>
                <input type="email" class="form-control" v-model="form.email" :class="{'is-invalid': formErrors.email}" :placeholder="t('common.placeholders.email')">
                <div class="invalid-feedback">{{ formErrors.email }}</div>
              </div>
              <div class="mb-3">
                <label class="form-label">{{ t('common.fields.password') }} <span class="text-danger" v-if="!editingId">*</span></label>
                <input type="password" class="form-control" v-model="form.password" :class="{'is-invalid': formErrors.password}"
                  :placeholder="editingId ? t('admin.users.password-keep-hint') : t('common.placeholders.password')" autocomplete="new-password">
                <div class="invalid-feedback">{{ formErrors.password }}</div>
              </div>
              <div class="mb-3">
                <label class="form-label">{{ t('staff.fields.roles') }} <span class="text-danger">*</span></label>
                <VueMultiselect :show-labels="false" :options="roleOptions" :multiple="true" v-model="form.roles"></VueMultiselect>
                <div v-if="formErrors.roles" class="invalid-feedback d-block">{{ formErrors.roles }}</div>
              </div>
              <div class="mb-1">
                <label class="form-label">{{ t('common.fields.status') }}</label>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="user-is-active" v-model="form.is_active">
                  <label class="form-check-label" for="user-is-active">{{ form.is_active ? t('common.status.active') : t('common.status.inactive') }}</label>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" @click="showModal = false">{{ t('button.cancel') }}</button>
            <button type="button" class="btn btn-primary" @click="submitForm" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
              {{ t('button.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showModal" @click="showModal = false"></div>
  </Teleport>
</template>

<style scoped></style>
