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
  current: t('nav.cyclecount'),
  list: [t('nav.warehouse'), t('nav.cyclecount')]
}));


const totalNewCyclecount = computed<number>(() => {
  return (itemData.value?.task_details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.new_cyclecount_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})

const totalOldCyclecount = computed<number>(() => {
  return (itemData.value?.task_details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.old_cyclecount_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})



const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}`, {
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



const addCycleCountQTY = (item:any) => {
    item.new_cyclecount_quantity = 0;
};

const resetTask = () => {
    itemData.value.task_details.forEach((item:any) => {
        item.new_cyclecount_quantity = undefined;
    });
};

const saveTask = async () => {
  // 安全访问嵌套属性并处理空值
  const details = (itemData.value?.task_details ?? [])
    .map((item: any) => {
      const newQuantity = Number(item?.new_cyclecount_quantity) || 0;
      const actualQuantity = newQuantity + (Number(item.actual_quantity) || 0);
      return {
        id: item.id,
        actual_quantity: actualQuantity,
      };
    })
    .filter((item: any) => item.new_cyclecount_quantity !== 0);

  // 组合请求参数（保持原逻辑不变）
  const payload = {
    task_id: itemData.value?.id,
    details:details
  };
  if (payload.details.length === 0) {
    showToast('Please add cycle count quantity', 'error');
    return;
  }

  try {
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/details-batch-save/`, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' }, // 明确设置类型
        onSuccess: async(data) => {
            await fetchData();
            await resetTask();
            showToast(t('action-results.success'), 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data; 
    
    // 处理成功逻辑
  } catch (err) {
    // 处理错误逻辑
  }
};

const processTask = async () => {
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/process/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            itemData.value = data;
            showToast(t('action-results.task-start-process'), 'success')
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

const completeTask = async () => {
  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/complete/`, {
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

const completeItem = async (item:any) => {
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/details/${item.id}/complete/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            // 更新当前项的状态
            await fetchData(); 
            showToast(t('action-results.task-item-complete'), 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

const hasUnsavedChanges = computed(() => {
  return itemData.value?.task_details?.some((item: any) => {
    const checked = Number(item?.new_cyclecount_quantity) || 0
    return checked > 0 
  }) ?? false
})

const allItemsCompleted = computed(() => {
  return itemData.value?.task_details?.every((item: any) => {
    return item.status === 'completed'
  }) ?? false
})

function completeFn(item: any) {

  // 强制获取最新计算值
  if (hasUnsavedChanges.value) {
    showToast(t('action-results.task-save-changes-before-complete'), 'error');
    return;
  }

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

const adjustment_reason = ref('');
const validDetails = computed(() => {
  return itemData.value?.task_details
    ?.filter((item: any) => item.difference !== 0)
    ?? []
})
const carete_adjustmentFn = async () => {
  // 如果无有效记录，直接提示并返回
  if (validDetails.value.length === 0) {
    showToast(t('cyclecount.validation.no-valid-records'), 'warning')
    return null
  }
  // 使用封装的确认对话框
  showConfirm(
    t('action-results.create-confirm-title'),
    t('action-results.create-confirm'),
    t('button.confirm'),
    t('button.cancel'),
  ).then((confirmed) => {
    if (confirmed) {
      // 执行创建调整
      carete_adjustment();
    }
  });
  
};

const carete_adjustment = async () => {
 

  const data = await httpRequest(`/api/warehouse/adjustment/create_adjustment_by_cyclecount/${taskId}`, {
    method: 'POST',
    onSuccess: (data) => showToast(t('action-results.success'), 'success'),
    onError: (error) => showToast(error.message, 'error'),
  });

  return data;
};

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
                <span class="text-primary">#C-{{ itemData?.id }}</span>
                <span class="badge bg-primary ms-2">{{ t('common.status.' + itemData?.status.replace('_',"-"))}}</span>
              </div>
            </div>
            <div class="card-body row">
              <div class="col-xl-6">
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('cyclecount.fields.name')}} :</span>
                  {{ itemData?.task_name }}
                </p>
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
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.dates.scheduled')}} :</span>
                  {{ $dayjs(itemData?.scheduled_date,'YYYY-MM-DD') }}
                </p>

              </div>
              <div class="col-xl-6 text-end">
                <Barcode :value="`C-${taskId}`" />
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
                  {{t('common.dates.created')}}:{{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'in_progress'">
                  {{t('common.dates.started')}}:{{ $dayjs(itemData?.started_at,'YYYY-MM-DD HH:mm:ss') }}
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
                      <th scope="col">{{t('common.fields.items')}}({{ itemData?.task_details.length }})</th>
                      <th scope="col">{{t('common.entities.location')}}</th>
                      <th scope="col">{{t('common.quantities.system')}}</th>
                      <th scope="col">{{t('common.quantities.actual')}}</th>
                      <th scope="col" v-if="itemData?.status==='in_progress'">{{ t('common.fields.action') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.task_details">
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
                          {{ item?.location?.code }} | {{t('common.locations.'+item?.location?.location_type)}}
                        </NuxtLink>
                      </td>
                      <td>{{ item.system_quantity}}
                        <template v-if="itemData.status !== 'pending'">
                          <span class="text-danger ms-2"
                            v-if="item.system_quantity!=item.actual_quantity+(item.new_cyclecount_quantity ?? 0) + (item.old_cyclecount_quantity??0)">({{
                            item.actual_quantity-item.system_quantity+(item.new_cyclecount_quantity ?? 0) +
                            (item.old_cyclecount_quantity??0) }})</span>
                        </template>
                      </td>

                      <td>
                        <span v-if="itemData.status != 'in_progress'">{{ item.actual_quantity }}</span>
                        <span class="mb-2" v-if="itemData.status == 'in_progress'">{{t('common.status.processed')}}:{{ item.actual_quantity}}</span>
                        <NuxtLink class="ms-2 btn btn-secondary btn-wave btn-sm" @click="addCycleCountQTY(item)"
                          v-show="item.new_cyclecount_quantity==undefined" v-if="itemData.status == 'in_progress' && item.status == 'pending'">
                          <i class="ri-add-line"></i>
                        </NuxtLink>
                        <input v-maska:[] type="number" class="form-control number-format" id="product-length"
                          data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          v-model="item.new_cyclecount_quantity" v-show="item.new_cyclecount_quantity>=0"
                          v-if="itemData.status == 'in_progress'">
                      </td>
                      <td v-if="itemData.status == 'in_progress'">
                        <NuxtLink class="btn btn-info btn-sm" @click="completeItem(item)" v-if="item.status =='pending' && !hasUnsavedChanges"><i class="ri-checkbox-line"></i></NuxtLink>
                      </td>
                    </tr>

                    <tr>
                      <td colspan="2"></td>
                      <td colspan="1">
                        <div class="fw-semibold">{{t('common.quantities.total-system')}}:</div>
                      </td>
                      <td>                        
                          <span v-if="itemData.status !== 'pending'">{{ itemData?.total_system_quantity }}</span>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2"></td>
                      <td colspan="1">
                        <div class="fw-semibold">{{t('common.quantities.total-actual')}} :</div>
                      </td>
                      <td>
                        <span v-if="itemData.status == 'in_progress'">{{
                          itemData?.total_actual_quantity+totalOldCyclecount+totalNewCyclecount }}</span>
                        <span v-else>{{ itemData?.total_actual_quantity }}</span>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2"></td>
                      <td colspan="1">
                        <div class="fw-semibold">{{t('common.quantities.total-difference')}} :</div>
                      </td>
                      <td>
                        <span v-if="itemData.status == 'in_progress'">{{ totalOldCyclecount+totalNewCyclecount }}</span>
                        <span v-else>{{ itemData?.total_difference }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="card-footer border-top-0">
              <div class="btn-list float-end">
                <!-- <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/cyclecount/print/${taskId}`"><i
                    class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink> -->

                <NuxtLink class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status==='pending'"
                  :title="t('button.process')" @click="processTask()"><i class="ri-checkbox-line me-1 align-middle"></i>{{t('button.process')}}
                </NuxtLink>

                <NuxtLink class="btn btn-warning btn-wave btn-sm" v-if="itemData?.status =='in_progress'" :title="t('button.reset')"
                  @click="resetTask()"><i class="ri-reset-left-line me-1 align-middle"></i>{{t('button.reset')}}</NuxtLink>
                <button class="btn btn-info btn-wave btn-sm" v-if="itemData?.status =='in_progress'" :title="t('button.save')"
                  @click="saveTask()" :disabled="!hasUnsavedChanges"><i class="ri-draft-line me-1 align-middle"></i>{{t('button.save')}}</button>

                <button class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status =='in_progress'" :title="t('button.complete')"
                  @click="completeFn()" :disabled="hasUnsavedChanges || !allItemsCompleted"><i class="ri-save-line me-1 align-middle"></i>{{t('button.complete')}}
                </button>
                <button class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status =='completed' && validDetails.length > 0" title="Create Adjustment"
                    @click="carete_adjustmentFn()"><i class="ri-save-line me-1 align-middle"></i>{{t('adjustment.operations.add')}}
                </button>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->

  <div class="row" v-if="!loading">
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-header justify-content-between">
          <div class="">
            <ul class="nav nav-pills nav-style-3" role="tablist">

              <li class="nav-item">
                <a class="nav-link active" data-bs-toggle="tab" role="tab" aria-current="page" href="#logs"
                  aria-selected="true">{{t('common.fields.task-logs')}}</a>
              </li>
            </ul>
          </div>
        </div>

        <div class="card-body">
          <div class="row tab-content">

            <div class="tab-pane text-muted  show active" id="logs" role="tabpanel">
              <div class="table-responsive">
                <table class="table text-nowrap table-bordered table-hover">
                  <thead>
                    <tr>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.task-id') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.old-status') }}</th>
                      <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.new-status') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.dates.changed') }}</th>
                      <th scope="col">{{ t('common.users.operator') }}</th>
                    </tr>

                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.status_logs" class="invoice-list">
                      <td>{{ item?.task_id }}</td>
                      <td>{{t('common.status.'+item?.old_status.replace('_',"-"))}}</td>
                      <td>{{t('common.status.'+item?.new_status.replace('_',"-"))}}</td>
                      <td class="d-none d-md-table-cell">{{ $dayjs(item?.changed_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                      <td class="d-none d-xl-table-cell">{{ item?.operator?.user_name }}</td>
                    </tr>

                  </tbody>
                </table>
                <div class="text-center p-5 border border-top-0" v-if="itemData?.status_logs?.length <=0">{{t('common.status.nothing-show')}}</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Start::Modal -->
  <div class="modal fade" id="djustmentModal" tabindex="-1" aria-labelledby="djustmentModalLabel" aria-hidden="true">
    <div class="modal-dialog  modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title" id="exampleModalLabel1">{{t('adjustment.operations.add')}}</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">{{t('common.fields.reason')}}</label>
            <div class="flex-nowrap input-group-custom">
              <textarea class="form-control" v-model="adjustment_reason" :placeholder="t('common.placeholders.reason')" rows="5"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ t('button.close') }}</button>
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">{{t('button.save')}}</button>
        </div>
      </div>
    </div>
  </div>
  <!-- End::Modal -->

</template>
<style scoped></style>
