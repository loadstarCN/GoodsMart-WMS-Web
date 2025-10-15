<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

let loading = ref(true);
const route = useRoute();
const taskId = route.params.id;

const itemData = ref(null);
const currentItem = ref(null);
const activeTab = ref('details');
const { t } = useI18n();
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.picking'),
  list: [t('nav.warehouse'), t('nav.picking')]
}));


const totalNewPicked = computed<number>(() => {
  return (itemData.value?.dn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.new_picked_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})


const totalOldPicked = computed<number>(() => {
  return (itemData.value?.dn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.old_picked_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/picking/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          if (itemData.value?.status !== 'in_progress') {
            return;
          }
          const taskSummary = (itemData.value?.task_details ?? []) 
            .reduce((acc: Record<string, { picked: number}>, item:any) => {
              const goodsId = item?.goods_id; // 可选链防止空值 
              
              // 类型校验防御
              if (typeof goodsId !== 'string' && typeof goodsId !== 'number') return acc;
              
              const current = acc[goodsId] || { picked: 0 }; // 默认值兜底
              const picked = Number(item.picked_quantity) || 0; // 安全数值转换

              acc[goodsId] = {
                picked: current.picked + picked,
              };
              
              return acc;
            }, {});
          // 更新asn.details中的旧数量
          itemData.value.dn.details.forEach((item:any) => {
            const goodsId = item.goods_id;
            // 统计task_details中的数据（按goods_id聚合）
            // 使用可选链防止undefined错误
            // 双问号操作符设置默认值
            item.old_picked_quantity = taskSummary[goodsId]?.picked ?? 0;
          });
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



const addPickedQTY = (item:any) => {
    item.new_picked_quantity = item.quantity-item.picked_quantity-item.old_picked_quantity;
};

const resetTask = () => {
    itemData.value.dn.details.forEach((item:any) => {
        item.new_picked_quantity = undefined;
    });
};

const saveTask = async () => {
  // 安全访问嵌套属性并处理空值
  const details = (itemData.value?.dn?.details ?? [])
    .map((item: any) => {
      // 检查 new_picked_quantity 是否超过可用库存
      const available = Math.max(0, 
        (Number(item?.quantity) || 0) - 
        (Number(item?.picked_quantity) || 0) -
        (Number(item?.old_picked_quantity) || 0)
      );
      const newPicked = Number(item?.new_picked_quantity) || 0;

      if (newPicked > available) {
        showToast(t('error.check-quantities'), 'error');
        return null; // 标记无效条目
      }

      return {
        goods_id: item?.goods_id ?? null,
        picked_quantity: newPicked,
        location_id: item?.location_id ?? null,
      };
    })
    .filter(Boolean) // 移除被标记为null的无效条目
    .filter((item: any) => {
      // 同时满足三个条件才保留条目
      return (
        item.goods_id !== undefined &&
        item.location_id &&
        item.picked_quantity !== 0
      );
    });

  // 组合请求参数（保持原逻辑不变）
  const payload = {
    details
  };
  if (payload.details.length === 0) {
    showToast(t('error.empty-items'), 'error');
    return;
  }

  try {
    const data = await httpRequest(`/api/warehouse/picking/${taskId}/batches/`, {
        method: 'POST',
        body: payload,
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
    const data = await httpRequest(`/api/warehouse/picking/${taskId}/process/`, {
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
    const data = await httpRequest(`/api/warehouse/picking/${taskId}/complete/`, {
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

const hasUnsavedChanges = computed(() => {
  return itemData.value?.dn?.details?.some((item: any) => {
    const picked = Number(item?.new_picked_quantity) || 0
    return picked > 0 
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



const isLoading = ref(false);
const selectedLocation = ref(null);
const locationSelectedOptions = ref([]);
const nameWithQuantity = (({ location,quantity }: any) => {
  return `[${location.location_type}] ${location.code} (${quantity})`
})
const fetchLocationData = async (goods_id: number, targetRef: Ref<any[]>) => {
  if (!goods_id) return;
  isLoading.value = true;
  
  const data = await httpRequest<PaginationData>('/api/warehouse/goods/locations/', {
    method: 'GET',
    params: {warehouse_id:itemData.value.dn?.warehouse_id, all: true, goods_id: goods_id },
    onSuccess: (data) => targetRef.value = data.items,
    onError: (error) => showToast(error.message, 'error'),
    onFinally: () => isLoading.value = false
  });

  return data;
};


const addLocationFn = (item:any) => {
  currentItem.value = item;
  selectedLocation.value = null;
  fetchLocationData(item.goods_id, locationSelectedOptions);
};

const addLocation = (item:any) => {
  if (!selectedLocation.value) {
    showToast('Please select an item', 'error');
    return;
  }
  item.location_id = selectedLocation.value.location_id;
  item.location = selectedLocation.value.location;
  selectedLocation.value = null;
};



// 删除Item
const deleteDetailItem = async (item_id:Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm'),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/picking/${taskId}/details/${item_id}`, {
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
                <span class="text-primary">#PICK-{{ itemData?.id }}</span>
                <span class="badge bg-primary ms-2">{{ t('common.status.'+itemData?.status.replace('_',"-")) }}</span>
              </div>
            </div>
            <div class="card-body row">
              <div class="col-xl-6">
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">DN :</span>
                  <NuxtLink :to="`/dn/detail/${itemData?.dn_id}`">#DN-{{ itemData?.dn_id }}</NuxtLink>
                </p>
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.entities.warehouse')}} :</span>
                  <NuxtLink :to="`/warehouse/detail/${itemData?.dn?.warehouse_id}`">{{ itemData?.dn?.warehouse?.name
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
                <p class="mb-2 text-muted" v-if="itemData?.dn?.special_handling">
                  <span class="fw-semibold text-default">special_handling :</span>
                  {{ itemData?.dn?.special_handling }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.dn?.remark">
                  <span class="fw-semibold text-default">{{t('common.fields.remark')}} :</span>
                  {{ itemData?.dn?.remark }}
                </p>
              </div>
              <div class="col-xl-6 text-end">
                <Barcode :value="`PICK-${taskId}`" />
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
                      <th scope="col">{{t('common.fields.items')}}({{ itemData?.dn?.detail_count }})</th>
                      <th scope="col">{{t('common.fields.quantity')}}</th>
                      <th scope="col">{{t('common.quantities.picked')}}</th>
                      <th scope="col">{{t('common.entities.location')}}</th>
                      <th scope="col">{{t('common.fields.remark')}}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.dn?.details">
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
                      <td>{{ item.quantity}}<span class="text-danger ms-2"
                          v-if="item.quantity!=item.picked_quantity">({{ item.picked_quantity-item.quantity+(item.new_picked_quantity ?? 0) + (item.old_picked_quantity??0)}})</span>
                      </td>
                     
                      <td>
                        <span v-if="itemData.status != 'in_progress'">{{ item.picked_quantity+(item.old_picked_quantity??0) }}</span>
                        <span class="mb-2" v-if="itemData.status == 'in_progress'">{{t('common.status.processed')}}:{{ item.picked_quantity+item.old_picked_quantity }}</span>
                        <NuxtLink class="ms-2 btn btn-secondary btn-wave btn-sm" @click="addPickedQTY(item)" v-show="item.new_picked_quantity==undefined"
                          v-if="itemData.status == 'in_progress'">
                          <i class="ri-add-line"></i>
                        </NuxtLink>
                        <input v-maska:[] type="number" class="form-control number-format" id="product-length"
                          data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional" :max="item.quantity-item.picked_quantity-item.old_picked_quantity"
                          v-model="item.new_picked_quantity" v-show="item.new_picked_quantity>=0"
                          v-if="itemData.status == 'in_progress'">
                      </td>
                      <td>
                        {{ item.location?.code }}
                        <NuxtLink class="ms-2 btn btn-secondary btn-wave btn-sm" @click="addLocationFn(item)"  data-bs-toggle="modal" data-bs-target="#locationModal" v-if="itemData.status == 'in_progress'"><i class="ri-add-line"></i></NuxtLink></td>
                      <td>{{ item.remark}}</td>
                     
                    </tr>

                    <tr>
                      <td colspan="2"></td>
                      <td colspan="2">
                        <div class="fw-semibold">{{t('common.quantities.expected')}} :</div>
                      </td>
                      <td>
                        {{ itemData?.expected_quantity }}
                      </td>
                    </tr>
                    
                    <tr>
                      <td colspan="2"></td>
                      <td colspan="2">
                        <div class="fw-semibold">{{t('common.quantities.total-picked')}} :</div>
                      </td>
                      <td>
                        <span v-if="itemData.status == 'in_progress'">{{ totalOldPicked+totalNewPicked }}</span>
                        <span v-else>{{ itemData?.total_picked_quantity }}</span>
                      </td>
                    </tr>
                   


                  </tbody>
                </table>
              </div>
            </div>
            <div class="card-footer border-top-0">
              <div class="btn-list float-end">
                <!-- <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/picking/print/${taskId}`"><i
                    class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink> -->

                <NuxtLink class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status==='pending'"
                  :title="t('button.process')" @click="processTask()"><i class="ri-checkbox-line me-1 align-middle"></i>{{t('button.process')}}
                </NuxtLink>

                <NuxtLink class="btn btn-warning btn-wave btn-sm" v-if="itemData?.status =='in_progress'" :title="t('button.reset')"
                  @click="resetTask()"><i class="ri-reset-left-line me-1 align-middle"></i>{{t('button.reset')}}</NuxtLink>
                <button class="btn btn-info btn-wave btn-sm" v-if="itemData?.status =='in_progress'" :title="t('button.save')"
                  @click="saveTask()" :disabled="!hasUnsavedChanges"><i class="ri-draft-line me-1 align-middle"></i>{{t('button.save')}}</button>

                <button class="btn btn-primary btn-wave btn-sm" v-if="itemData?.status =='in_progress'"
                  :title="t('button.complete')" @click="completeFn()" :disabled="hasUnsavedChanges"><i class="ri-save-line me-1 align-middle"></i>{{t('button.complete')}}
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
                <a class="nav-link active" data-bs-toggle="tab" role="tab" aria-current="page" href="#details"
                  aria-selected="true">{{t('common.fields.task-details')}}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" data-bs-toggle="tab" role="tab" aria-current="page" href="#logs"
                  aria-selected="true">{{t('common.fields.task-logs')}}</a>
              </li>
            </ul>
          </div>
        </div>

        <div class="card-body">
          <div class="row tab-content">

            <div class="tab-pane text-muted show active" id="details" role="tabpanel">
              

              <div class="table-responsive">
                <table class="table text-nowrap table-bordered table-hover">
                  <thead>
                    <tr>
                      <th scope="col">{{ t('common.fields.batch-id') }}</th>
                      <th scope="col">{{t('common.entities.goods')}}</th>
                      <th scope="col">{{t('common.entities.location')}}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{t('common.quantities.picked')}}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{t('common.dates.picked')}}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                      <th scope="col" v-if="itemData?.status =='in_progress'">{{ t('common.fields.action') }}</th>
                    </tr>

                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.task_details" class="invoice-list">
                      <td>{{ item?.batch_id }}</td>
                      <td>
                        <div class="d-flex align-items-center">
                          <div>
                            <p class="mb-0 fw-semibold">
                              <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name
                                }}
                              </NuxtLink>
                            </p>
                            <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                          </div>
                        </div>
                      </td>
                      <td class="d-none d-xl-table-cell">{{ item?.location?.code }}</td>
                      <td class="d-none d-lg-table-cell">{{ item?.picked_quantity }}</td>
                      <td class="d-none d-md-table-cell">{{ $dayjs(item?.picking_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                      <td class="d-none d-xl-table-cell">{{ item?.operator?.user_name }}</td>
                      <td v-if="itemData?.status =='in_progress'">
                        <NuxtLink href="javascript:void(0);" @click="deleteDetailItem(item.id)"
                          class="btn btn-icon btn-sm btn-danger-light product-btn"><i class="ri-delete-bin-line"></i></NuxtLink>
                      </td>
                     
                    </tr>

                  </tbody>
                </table>
                <div class="text-center p-5 border border-top-0" v-if="itemData?.task_details?.length <=0">{{t('common.status.nothing-show')}}</div>
              </div>
            </div>
            <div class="tab-pane text-muted" id="logs" role="tabpanel">
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


  
  <div class="modal fade" id="locationModal" tabindex="-1" aria-labelledby="locationModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title" id="exampleModalLabel1">Search location</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Location <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">

                <VueMultiselect id="location" :show-labels="false" :options="locationSelectedOptions" :multiple="false" v-model="selectedLocation"  :custom-label="nameWithQuantity">
                </VueMultiselect>

            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ t('button.close') }}</button>
          <button type="button" class="btn btn-primary" @click="addLocation(currentItem)">{{ t('button.submit') }}</button>
        </div>
      </div>
    </div>
  </div>


</template>
<style scoped></style>
