<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

let loading = ref(true);
const route = useRoute();
const taskId = route.params.id;

const itemData = ref(null);
const activeTab = ref('details');
const { t } = useI18n();
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.adjustment'),
  list: [t('nav.warehouse'), t('nav.adjustment')]
}));


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/adjustment/${taskId}`, {
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

const approveTask = async () => {
    const data = await httpRequest(`/api/warehouse/adjustment/${taskId}/approve/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.task-approved'), 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

const completeTask = async () => {
  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/adjustment/${taskId}/complete/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.task-complete'), 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

function completeFn(item: any) {

  // 使用封装的确认对话框
  showConfirm(
    t('action-results.complete-confirm-title'),
    t('action-results.complete-confirm'),
    t('button.confirm'),
    t('button.cancel'),
  ).then((confirmed) => {
    if (confirmed) {
      // 执行完成任务
      completeTask()
    }
  });
}

onMounted(async() => {
  await fetchData();
});

</script>
<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row" v-if="!loading">
    <div class="col-xl-12">
      <div class="row">
        <div class="col-xl-12">
          <div class="card custom-card">
            <div class="card-header">
              <div class="card-title">
                <span class="text-primary">#ADJ-{{ itemData?.id }}</span>
                <span class="badge bg-primary ms-2">{{ t('common.status.' + itemData?.status.replace('_',"-"))}}</span>
              </div>
            </div>
            <div class="card-body row">
              <div class="col-xl-6">
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.entities.warehouse')}} :</span>
                  <NuxtLink :to="`/warehouse/detail/${itemData?.warehouse_id}`">{{ itemData?.warehouse?.name
                    }}</NuxtLink>
                </p>
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.users.creator')}} :</span>
                  {{ itemData?.creator?.user_name }}
                </p>
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.dates.created')}} :</span>
                  {{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                </p>
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.dates.updated')}} :</span>
                  {{ $dayjs(itemData?.updated_at,'YYYY-MM-DD HH:mm:ss') }}
                </p>

                <p class="mb-2 text-muted" v-if="itemData?.approver">
                  <span class="fw-semibold text-default">{{t('common.users.approver')}} :</span>
                  {{ itemData?.approver?.user_name }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.approved_at">
                  <span class="fw-semibold text-default">{{t('common.dates.approved')}} :</span>
                  {{ $dayjs(itemData?.approved_at,'YYYY-MM-DD HH:mm:ss') }}
                </p>

                <p class="mb-2 text-muted" v-if="itemData?.operator">
                  <span class="fw-semibold text-default">{{t('common.users.operator')}} :</span>
                  {{ itemData?.operator?.user_name }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.completed_at">
                  <span class="fw-semibold text-default">{{t('common.dates.completed')}} :</span>
                  {{ $dayjs(itemData?.completed_at,'YYYY-MM-DD HH:mm:ss') }}
                </p>

              </div>
              <div class="col-xl-6 text-end">
                <Barcode :value="`ADJ-${taskId}`" />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
    <div class="col-xl-12">
      <div class="row">
        <div class="col-xl-12">
          <div class="card custom-card">
            <div class="card-header d-flex justify-content-between">
              <div class="card-title">
                <span class="text-primary">{{t('common.fields.items')}}</span>
              </div>
              <div>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'pending'">
                  {{t('common.dates.created')}}{{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'approved'">
                  {{t('common.dates.started')}}:{{ $dayjs(itemData?.approved_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'completed'">
                  {{t('common.dates.completed')}}:{{ $dayjs(itemData?.completed_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>

              </div>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">{{t('common.fields.items')}}({{ itemData?.details.length }})</th>
                      <th scope="col">{{t('common.entities.location')}}</th>
                      <th scope="col">{{t('common.quantities.system')}}</th>
                      <th scope="col">{{t('common.quantities.actual')}}</th>
                      <th scope="col">{{t('common.quantities.adjusted')}}</th>

                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.details">
                      <td>
                        <div class="d-flex align-items-center">
                          <div class="me-2 lh-1">
                            <span class="avatar avatar-xxl me-2">
                              <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                                <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                                <img src="/images/goods/default.png" alt="" v-else>
                              </NuxtLink>
                            </span>
                          </div>
                          <div>
                            <p class="mb-0 fw-semibold">
                              <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name
                                }}
                              </NuxtLink>
                            </p>
                            <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                            <p class="mb-0 fs-11 text-muted">{{ item?.goods?.brand }}</p>
                            <p class="mb-0 fs-11 text-muted">{{ item?.goods?.category }}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <NuxtLink :to="`/location/detail/${item?.location?.id}`">
                          {{ item?.location?.code }} |
                          {{t('common.locations.'+item?.location?.location_type)}}
                        </NuxtLink>
                      </td>
                      <td>{{ item.system_quantity}}</td>
                      <td>{{ item.actual_quantity }}</td>
                      <td><span class="text-danger">{{ item.actual_quantity-item.system_quantity }}</span></td>
                    </tr>

                    <tr>
                      <td colspan="2"></td>
                      <td colspan="1">
                        <div class="fw-semibold">{{t('common.quantities.total-system')}}:</div>
                      </td>
                      <td>                        
                          <span>{{ itemData?.total_system_quantity }}</span>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2"></td>
                      <td colspan="1">
                        <div class="fw-semibold">{{t('common.quantities.total-actual')}} :</div>
                      </td>
                      <td>
                        <span>{{ itemData?.total_actual_quantity }}</span>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2"></td>
                      <td colspan="1">
                        <div class="fw-semibold">{{t('common.quantities.total-difference')}} :</div>
                      </td>
                      <td>
                        <span>{{ itemData?.total_actual_quantity-itemData?.total_system_quantity }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="card-footer border-top-0">
              <div class="btn-list float-end">
                <!-- <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/adjustment/print/${taskId}`"><i
                    class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink> -->

                <NuxtLink class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status==='pending'"
                  title="Approve" @click="approveTask()"><i class="ri-checkbox-line me-1 align-middle"></i>{{t('button.approved')}}
                </NuxtLink>

                <button class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status =='approved'" :title="t('button.complete')"
                  @click="completeFn()" ><i class="ri-save-line me-1 align-middle"></i>{{t('button.complete')}}
                </button>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>
<style scoped></style>
