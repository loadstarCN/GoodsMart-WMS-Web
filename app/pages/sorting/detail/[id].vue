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
  current: t('nav.sorting'),
  list: [t('nav.warehouse'), t('nav.sorting')]
}));


const totalNewSorted = computed<number>(() => {
  return (itemData.value?.asn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.new_sorted_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})

const totalNewDamaged = computed<number>(() => {
  return (itemData.value?.asn?.details ?? [])
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.new_damage_quantity) || 0)
    }, 0)
})


const totalOldSorted = computed<number>(() => {
  return (itemData.value?.asn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.old_sorted_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})

const totalOldDamaged = computed<number>(() => {
  return (itemData.value?.asn?.details ?? [])
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.old_damage_quantity) || 0)
    }, 0)
})


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          if (itemData.value?.status !== 'in_progress') {
            return;
          }
          const taskSummary = (itemData.value?.task_details ?? []) 
            .reduce((acc: Record<string, { sorted: number; damage: number }>, item:any) => {
              const goodsId = item?.goods_id; // 可选链防止空值 
              
              // 类型校验防御
              if (typeof goodsId !== 'string' && typeof goodsId !== 'number') return acc;
              
              const current = acc[goodsId] || { sorted: 0, damage: 0 }; // 默认值兜底
              const sorted = Number(item.sorted_quantity) || 0; // 安全数值转换
              const damage = Number(item.damage_quantity) || 0;

              acc[goodsId] = {
                sorted: current.sorted + sorted,
                damage: current.damage + damage
              };
              
              return acc;
            }, {});
          // 更新asn.details中的旧数量
          itemData.value.asn.details.forEach((item:any) => {
            const goodsId = item.goods_id;
            // 统计task_details中的数据（按goods_id聚合）
            // 使用可选链防止undefined错误
            // 双问号操作符设置默认值
            item.old_sorted_quantity = taskSummary[goodsId]?.sorted ?? 0;
            item.old_damage_quantity = taskSummary[goodsId]?.damage ?? 0;
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



const addSortedQTY = (item:any) => {
    item.new_sorted_quantity = 0;
};
const addDamageQTY = (item:any) => {
    item.new_damage_quantity = 0;
};

const resetTask = () => {
    itemData.value.asn.details.forEach((item:any) => {
        item.new_sorted_quantity = undefined;
        item.new_damage_quantity = undefined;
    });
};

const saveTask = async () => {
  // 安全访问嵌套属性并处理空值
  const details = (itemData.value?.asn?.details ?? [])
    .map((item:any) => ({
      goods_id: item?.goods_id ?? null,
      sorted_quantity: Number(item?.new_sorted_quantity) || 0,
      damage_quantity: Number(item?.new_damage_quantity) || 0
    }))
    .filter((item:any) => {
      // 同时满足两个条件才保留条目
      return (
        item.goods_id !== undefined && // 原始过滤条件[1](@ref)
        (item.sorted_quantity !== 0 || item.damage_quantity !== 0) // 新增过滤条件
      );
    });

  // 组合请求参数（保持原逻辑不变）
  const payload = {
    details
  };
  if (payload.details.length === 0) {
    showToast('Please add sorted or damage quantity', 'error');
    return;
  }

  try {
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}/batches/`, {
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
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}/process/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            itemData.value = data;
            showToast(t('action-results.task-start-process'), 'success')
            await fetchData(); // 确保数据是最新的
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};



const completeTask = async () => {
  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}/complete/`, {
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
  return itemData.value?.asn?.details?.some((item: any) => {
    const sorted = Number(item?.new_sorted_quantity) || 0
    const damaged = Number(item?.new_damage_quantity) || 0
    return sorted > 0 || damaged > 0
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


// 删除Item
const deleteDetailItem = async (item_id:Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm'),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/sorting/${taskId}/details/${item_id}`, {
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
                <span class="text-primary">#SORT-{{ itemData?.id }}</span>
                <span class="badge bg-primary ms-2">{{ t('common.status.' + itemData?.status.replace('_',"-"))}}</span>
              </div>
            </div>
            <div class="card-body row">
              <div class="col-xl-6">
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">ASN :</span>
                  <NuxtLink :to="`/asn/detail/${itemData?.asn_id}`">#ASN-{{ itemData?.asn_id }}</NuxtLink>
                </p>
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.entities.warehouse')}} :</span>
                  <NuxtLink :to="`/warehouse/detail/${itemData?.asn?.warehouse_id}`">{{ itemData?.asn?.warehouse?.name
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
              </div>
              <div class="col-xl-6 text-end">
                <Barcode :value="`SORT-${taskId}`" />
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
                      <th scope="col">{{t('common.fields.items')}}({{ itemData?.asn?.detail_count }})</th>
                      <th scope="col">{{t('common.fields.quantity')}}</th>
                      <th scope="col">{{t('common.quantities.actual')}}</th>
                      <th scope="col">{{t('common.quantities.sorted')}}</th>
                      <th scope="col">{{t('common.quantities.damaged')}}</th>
                      <th scope="col">{{t('common.fields.remark')}}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.asn?.details">
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
                          v-if="item.quantity!=item.sorted_quantity">({{
                          item.sorted_quantity-item.quantity+(item.new_sorted_quantity ?? 0) +(item.new_damage_quantity
                          ?? 0) + (item.old_sorted_quantity??0) + (item.old_damage_quantity??0)}})</span>
                      </td>
                      <td>{{
                        (item.actual_quantity || 0) +
                        (item.new_sorted_quantity ?? 0) +
                        (item.new_damage_quantity ?? 0) +
                        (item.old_sorted_quantity ?? 0) +
                        (item.old_damage_quantity ?? 0)
                        }}</td>
                      <td>
                        <span v-if="itemData.status != 'in_progress'">{{ item.sorted_quantity }}</span>
                        <span class="mb-2" v-if="itemData.status == 'in_progress'">{{t('common.status.processed')}}:{{
                          item.old_sorted_quantity
                          }}</span>
                        <NuxtLink class="ms-2 btn btn-secondary btn-wave btn-sm" @click="addSortedQTY(item)" v-show="item.new_sorted_quantity==undefined"
                          v-if="itemData.status == 'in_progress'">
                          <i class="ri-add-line"></i>
                        </NuxtLink>
                        <input v-maska:[] type="number" class="form-control number-format" id="product-length"
                          data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          v-model="item.new_sorted_quantity" v-show="item.new_sorted_quantity>=0"
                          v-if="itemData.status == 'in_progress'">
                      </td>
                      <td>
                        <span v-if="itemData.status != 'in_progress'">{{ item.damage_quantity }}</span>
                        <span class="mb-2" v-if="itemData.status == 'in_progress'">{{t('common.status.processed')}}:{{
                          item.old_damage_quantity
                          }}</span>
                        <NuxtLink class="ms-2 btn btn-secondary btn-wave btn-sm" @click="addDamageQTY(item)" v-show="item.new_damage_quantity==undefined"
                          v-if="itemData.status == 'in_progress'">
                          <i class="ri-add-line"></i>
                        </NuxtLink>
                        <input v-maska:[] type="number" class="form-control number-format" id="product-length"
                          data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          v-model="item.new_damage_quantity" v-show="item.new_damage_quantity>=0"
                          v-if="itemData.status == 'in_progress'">
                      </td>
                      <td>{{ item.remark}}</td>
                    </tr>

                    <tr>
                      <td colspan="3"></td>
                      <td colspan="2">
                        <div class="fw-semibold">{{t('common.quantities.expected')}} :</div>
                      </td>
                      <td>
                        {{ itemData?.expected_quantity }}
                      </td>
                    </tr>
                    <tr>
                      <td colspan="3"></td>
                      <td colspan="2">
                        <div class="fw-semibold">{{t('common.quantities.total-actual')}} :</div>
                      </td>
                      <td>
                        <span v-if="itemData.status == 'in_progress'">{{
                          totalOldSorted+totalNewSorted+totalOldDamaged+totalNewDamaged }}</span>
                        <span v-else>{{ itemData?.total_sorted_quantity+itemData?.total_damage_quantity }}</span>


                      </td>
                    </tr>
                    <tr>
                      <td colspan="3"></td>
                      <td colspan="2">
                        <div class="fw-semibold">{{t('common.quantities.total-sorted')}} :</div>
                      </td>
                      <td>
                        <span v-if="itemData.status == 'in_progress'">{{ totalOldSorted+totalNewSorted }}</span>
                        <span v-else>{{ itemData?.total_sorted_quantity }}</span>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="3"></td>
                      <td colspan="2">
                        <div class="fw-semibold">{{t('common.quantities.total-damage')}} :</div>
                      </td>
                      <td>
                        <span v-if="itemData.status == 'in_progress'">{{ totalOldDamaged+totalNewDamaged }}</span>
                        <span v-else>{{ itemData?.total_damage_quantity }}</span>

                      </td>
                    </tr>


                  </tbody>
                </table>
              </div>
            </div>
            <div class="card-footer border-top-0">
              <div class="btn-list float-end">
                <!-- <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/sorting/print/${taskId}`"><i
                    class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink> -->

                <NuxtLink class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status==='pending'"
                  :title="t('button.process')" @click="processTask()"><i
                    class="ri-checkbox-line me-1 align-middle"></i>{{t('button.process')}}
                </NuxtLink>

                <NuxtLink class="btn btn-warning btn-wave btn-sm" v-if="itemData?.status =='in_progress'"
                  :title="t('button.reset')" @click="resetTask()"><i
                    class="ri-reset-left-line me-1 align-middle"></i>{{t('button.reset')}}</NuxtLink>
                <button class="btn btn-info btn-wave btn-sm" v-if="itemData?.status =='in_progress'"
                  :title="t('button.save')" @click="saveTask()" :disabled="!hasUnsavedChanges"><i
                    class="ri-draft-line me-1 align-middle"></i>{{t('button.save')}}</button>

                <button class="btn btn-primary btn-wave btn-sm" v-if="itemData?.status =='in_progress'"
                  :title="t('button.complete')" @click="completeFn()" :disabled="hasUnsavedChanges"><i
                    class="ri-save-line me-1 align-middle"></i>{{t('button.complete')}}
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
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.quantities.sorted') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.quantities.damaged') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.dates.sorting') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell" v-if="itemData?.status =='in_progress'">{{
                        t('common.fields.action') }}</th>
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
                      <td class="d-none d-lg-table-cell">{{ item?.sorted_quantity }}</td>
                      <td class="d-none d-lg-table-cell">{{ item?.damage_quantity }}</td>
                      <td class="d-none d-md-table-cell">{{ $dayjs(item?.sorting_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                      <td class="d-none d-xl-table-cell">{{ item?.operator?.user_name }}</td>
                      <td v-if="itemData?.status =='in_progress'">
                        <NuxtLink href="javascript:void(0);" @click="deleteDetailItem(item.id)"
                          class="btn btn-icon btn-sm btn-danger-light product-btn"><i class="ri-delete-bin-line"></i>
                        </NuxtLink>
                      </td>

                    </tr>

                  </tbody>
                </table>
                <div class="text-center p-5 border border-top-0" v-if="itemData?.task_details?.length <=0">
                  {{t('common.status.nothing-show')}}</div>
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
                <div class="text-center p-5 border border-top-0" v-if="itemData?.status_logs?.length <=0">
                  {{t('common.status.nothing-show')}}</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

</template>
<style scoped></style>
