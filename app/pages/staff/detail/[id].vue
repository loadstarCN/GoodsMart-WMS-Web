<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

let loading = ref(true);
let route = useRoute();
const itemId = route.params.id;

const itemData = ref(null);

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.staff'),
  list: [t('nav.warehouse'), t('nav.staff')]
}));


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/staff/${itemId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
        },
        onError: (error) => {
            if (error.status === 404) {
                showError({ statusCode: 404, message: t('action-results.not-found',{entity:t('common.entities.staff'),identifier:itemId}) });
            }else {
                showToast(error.message, 'error')
            }
            
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
      <span class="visually-hidden">{{ t('common.loading') }}...</span>
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
                    <p class="fs-18 fw-semibold mb-3">{{ itemData?.user_name}}</p>
                    <div>
                      <span class="avatar me-2 avatar-rounded"><img :src="itemData?.avatar" alt="" v-if="itemData?.avatar">
                      <img src="/images/goods/default.png" alt="" v-else></span>
                      
                    </div>

                    <div class="mb-4" v-if="itemData?.roles">
                      <p class="fs-15 fw-semibold mb-1">{{t('staff.fields.roles')}} :</p>
                      <p class="text-muted mb-0"><span class="badge rounded-pill bg-info fs-10 fw-normal ms-2" v-for="role in itemData?.roles">{{ role }}</span></p>
                    </div>

                    <div class="mb-4" v-if="itemData?.email">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.email')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.email }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.phone">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.phone')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.phone }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.position">
                      <p class="fs-15 fw-semibold mb-1">{{t('staff.fields.position')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.position }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.employee_number">
                      <p class="fs-15 fw-semibold mb-1">{{t('staff.fields.employee-number')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.employee_number }}
                      </p>
                    </div>
                     <div class="mb-4" v-if="itemData?.warehouses">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.entities.warehouse')}} :</p>
                      <p class="text-muted mb-0"><span class="badge rounded-pill bg-info fs-10 fw-normal ms-2" v-for="warehouse in itemData?.warehouses">{{ warehouse.name }}</span></p>
                    </div>
                    <div class="mb-4" v-if="itemData?.department">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.entities.department')}} :</p>
                      <p class="text-muted mb-0">{{ itemData?.department?.name }}
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
          <NuxtLink :to="`/staff/edit/${itemId}`" class="btn btn-primary mb-2">{{t('staff.operations.edit')}}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->

</template>
<style>

</style>