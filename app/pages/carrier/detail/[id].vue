<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
let route = useRoute();
const itemId = route.params.id;

const itemData = ref<any>(null);

// 获取国际化方法
const { t } = useI18n();
const staffStore = useStaffStore();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.carrier'),
  list: [t('nav.warehouse'), t('nav.carrier')]
}));


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/carrier/${itemId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
        },
        onError: (error) => {
            showToast(error.message, 'error')            
        },
        onFinally: () => {
            loading.value = false;
        }
    })
    return data;   
};

onMounted(async() => {
  await fetchData();
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
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-body">
          <div class="row gx-5">
            <div class="col-xxl-9 col-xl-12">
              <div class="row gx-5">
                <div class="col-xl-8 mt-xxl-0 mt-3">
                  <div>
                    <p class="fs-18 fw-semibold mb-3">{{ itemData?.name}} <span
                        class="badge rounded-pill bg-info fs-10 fw-normal ms-2">{{ itemData?.location_type }}</span><span v-if="itemData?.code" class="badge rounded-pill bg-secondary fs-10 fw-normal ms-2">{{ itemData?.code }}</span></p>

                    <div class="mb-4">
                      <p class="fs-15 fw-semibold mb-1">{{ t('carrier.integration.title') }} :</p>
                      <p class="text-muted mb-0">
                        <template v-if="itemData?.integration">
                          <i class="ri-plug-line me-1"></i>{{ itemData.integration.name }}
                          <span class="badge ms-1" :class="itemData.integration.enabled ? 'bg-success-transparent' : 'bg-light text-muted'">
                            {{ itemData.integration.enabled ? t('carrier.integration.on') : t('carrier.integration.off') }}
                          </span>
                        </template>
                        <template v-else>{{ t('carrier.integration.none-detail') }}</template>
                        <NuxtLink :to="`/carrier/edit/${itemData?.id}`" class="ms-2 fs-13" v-if="staffStore.hasPermission('carrier_edit')">
                          {{ t('carrier.integration.open-settings') }}
                        </NuxtLink>
                      </p>
                    </div>

                    <div class="mb-4" v-if="itemData?.address">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.address')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.address }} {{ itemData.zip_code }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.phone">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.phone')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.phone }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.email">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.email')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.email }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.contact">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.contact')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.contact }}
                      </p>
                    </div>

                    <div class="table-responsive mb-4">
                      <table class="table table-bordered text-nowrap">
                        <tbody>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{ t('common.users.creator') }}
                            </th>
                            <td>
                              {{ itemData?.creator.user_name }}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{ t('common.dates.created') }}
                            </th>
                            <td>
                              {{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{ t('common.dates.updated') }}
                            </th>
                            <td>
                              {{ $dayjs(itemData?.updated_at,'YYYY-MM-DD HH:mm:ss') }}
                            </td>
                          </tr>

                        </tbody>
                      </table>

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
          <NuxtLink :to="`/carrier/edit/${itemId}`" class="btn btn-primary mb-2">{{t('carrier.operations.edit')}}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->

</template>
<style>

</style>