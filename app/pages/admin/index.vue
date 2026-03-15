<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();

const dataToPass = computed(() => ({
  current: t('admin.nav.dashboard'),
  list: [t('admin.title')]
}));

let loading = ref(true);

interface DashboardStats {
  tenants: { total: number; active: number; expired: number };
  users: { total: number };
  roles: { total: number };
}

let stats = ref<DashboardStats>({
  tenants: { total: 0, active: 0, expired: 0 },
  users: { total: 0 },
  roles: { total: 0 },
});

const fetchStats = async () => {
  loading.value = true;

  const [companies, users, roles] = await Promise.all([
    httpRequest<any>('/api/warehouse/company/', {
      method: 'GET',
      params: { per_page: 1 },
    }),
    httpRequest<any>('/api/system/user/users', {
      method: 'GET',
      params: { per_page: 1 },
    }),
    httpRequest<any>('/api/system/user/roles', {
      method: 'GET',
      params: { per_page: 1 },
    }),
  ]);

  if (companies) {
    stats.value.tenants.total = companies.total || 0;
  }
  if (users) {
    stats.value.users.total = users.total || 0;
  }
  if (roles) {
    stats.value.roles.total = roles.total || 0;
  }

  loading.value = false;
};

onMounted(() => {
  fetchStats();
});
</script>

<template>
  <PageHeader :propData="dataToPass" />

  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>

  <div class="row" v-else>
    <!-- Tenants Card -->
    <div class="col-xl-4 col-lg-4 col-md-6 col-sm-12">
      <div class="card custom-card">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between mb-3">
            <div>
              <span class="d-block mb-1 text-muted">{{ t('admin.dashboard.total-tenants') }}</span>
              <h3 class="fw-semibold mb-0">{{ stats.tenants.total }}</h3>
            </div>
            <div class="avatar avatar-md avatar-rounded bg-primary-transparent">
              <i class="ri-building-line fs-20 text-primary"></i>
            </div>
          </div>
          <NuxtLink to="/admin/tenants/" class="text-muted fs-12">
            {{ t('admin.dashboard.view-all') }} <i class="ri-arrow-right-s-line align-middle"></i>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Users Card -->
    <div class="col-xl-4 col-lg-4 col-md-6 col-sm-12">
      <div class="card custom-card">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between mb-3">
            <div>
              <span class="d-block mb-1 text-muted">{{ t('admin.dashboard.total-users') }}</span>
              <h3 class="fw-semibold mb-0">{{ stats.users.total }}</h3>
            </div>
            <div class="avatar avatar-md avatar-rounded bg-success-transparent">
              <i class="ri-user-settings-line fs-20 text-success"></i>
            </div>
          </div>
          <NuxtLink to="/admin/users/" class="text-muted fs-12">
            {{ t('admin.dashboard.view-all') }} <i class="ri-arrow-right-s-line align-middle"></i>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Roles Card -->
    <div class="col-xl-4 col-lg-4 col-md-6 col-sm-12">
      <div class="card custom-card">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between mb-3">
            <div>
              <span class="d-block mb-1 text-muted">{{ t('admin.dashboard.total-roles') }}</span>
              <h3 class="fw-semibold mb-0">{{ stats.roles.total }}</h3>
            </div>
            <div class="avatar avatar-md avatar-rounded bg-warning-transparent">
              <i class="ri-shield-user-line fs-20 text-warning"></i>
            </div>
          </div>
          <NuxtLink to="/admin/roles/" class="text-muted fs-12">
            {{ t('admin.dashboard.view-all') }} <i class="ri-arrow-right-s-line align-middle"></i>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
