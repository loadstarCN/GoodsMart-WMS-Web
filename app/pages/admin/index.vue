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
  tenants: { total: number };
  users: { total: number };
  roles: { total: number };
}

let stats = ref<DashboardStats>({
  tenants: { total: 0 },
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
useHead({title:()=>t('admin.nav.dashboard')})
</script>

<template><div class="w-admin-home w-scope"><header><h1>{{t('admin.nav.dashboard')}}</h1></header><div class="metrics"><WCard v-for="key in ['tenants','users','roles'] as const" :key="key"><span>{{t('admin.dashboard.total-'+key)}}</span><strong>{{loading?'—':stats[key].total}}</strong><NuxtLink class="w-metric-link" :to="'/admin/'+key">{{t('admin.dashboard.view-all')}}<WIcon name="chevron-right" :size="14"/></NuxtLink></WCard></div></div></template>
<style scoped>.w-admin-home{display:flex;flex-direction:column;gap:16px}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.metrics :deep(.w-card__body){display:flex;flex-direction:column;gap:8px}.metrics span{font-size:13px;line-height:20px;color:var(--w-text-2)}.metrics strong{display:block;font-size:28px;line-height:36px;font-weight:600;margin:8px 0 16px}.w-metric-link{display:flex;gap:4px;align-items:center;font-size:13px;line-height:20px;color:var(--w-link);text-decoration:none}@media(max-width:700px){.metrics{grid-template-columns:minmax(0,1fr)}}</style>
