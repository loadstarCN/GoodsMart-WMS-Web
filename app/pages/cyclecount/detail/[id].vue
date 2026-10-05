<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
const route = useRoute();
const taskId = route.params.id;

const itemData = ref(null);
const activeTab = ref('details');
const { t } = useI18n();
const { bizErrorMessage } = useBizError();
const router = useRouter();
// 防重复提交：保存明细 / 生成调整单进行中
const saving = ref(false);
const creatingAdjustment = ref(false);
// 本页已生成过调整单（拿不到调整单 ID 无法跳转时，隐藏按钮防止再生成）
const adjustmentCreated = ref(false);
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



/**
 * 本次录入过的行（点了「+」或改过数量）：保存时只提交这些行，盘到 0 件（增量 0）也要提交——
 * 后端要求每条明细都明确录入过才能完成盘点（16114），不能再按「数量是否为 0」判断要不要提交
 */
const isTouched = (item: any) => !!item?.touched && item?.status !== 'completed';
/** 完成盘点被拒（16114）时还没录入的明细 id：对应行标红 */
const unrecordedIds = ref<number[]>([]);

const addCycleCountQTY = (item:any) => {
    item.new_cyclecount_quantity = 0;
    item.touched = true;
};
const markTouched = (item: any) => {
    item.touched = true;
};

const resetTask = () => {
    itemData.value.task_details.forEach((item:any) => {
        item.new_cyclecount_quantity = undefined;
        item.touched = false;
    });
};

const saveTask = async () => {
  if (saving.value) return;
  // 只提交本次录入过且未完成的行（含增量 0：盘到 0 件也要提交），没动过的行不提交：
  // 先过滤再映射（映射后的对象没有录入标记）；整单提交会按打开页面时的旧值覆盖别人刚录的结果；已完成的行后端也会拒绝
  const details = (itemData.value?.task_details ?? [])
    .filter((item: any) => isTouched(item))
    .map((item: any) => {
      const newQuantity = Number(item?.new_cyclecount_quantity) || 0;
      const actualQuantity = newQuantity + (Number(item.actual_quantity) || 0);
      return {
        id: item.id,
        actual_quantity: actualQuantity,
      };
    });

  // 组合请求参数（保持原逻辑不变）
  const payload = {
    task_id: itemData.value?.id,
    details:details
  };
  if (payload.details.length === 0) {
    showToast(t('cyclecount.validation.no-quantity'), 'error');
    return;
  }

  saving.value = true;
  try {
    let done = false;
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/details-batch-save/`, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' }, // 明确设置类型
        onSuccess: () => {
            done = true;
        },
        onError: (error) => {
            showToast(bizErrorMessage(error), 'error')
        }
    })
    // 重新读取完、清掉本次录入后再解锁：否则读取期间录入值还在，再点保存会把同一批数量再加一次
    if (done) {
        // 保存过的行不再标红；后端按录入时的系统数量重算差异，重新读取即可
        const savedIds = details.map((d: any) => d.id);
        unrecordedIds.value = unrecordedIds.value.filter((id: number) => !savedIds.includes(id));
        await fetchData();
        await resetTask();
        showToast(t('action-results.success'), 'success')
    }
    return data; 
    
    // 处理成功逻辑
  } catch (err) {
    // 处理错误逻辑
  } finally {
    saving.value = false;
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
            unrecordedIds.value = [];
            showToast(t('action-results.task-complete'), 'success')
        },
        onError: (error) => {
            // 16114：还有明细没录入（details.detail_ids），标红这些行
            if (error.code === 16114) {
                const ids = error.details?.detail_ids;
                unrecordedIds.value = Array.isArray(ids) ? ids.map((id: any) => Number(id)) : [];
                showAlert(t('button.complete'), bizErrorMessage(error), 'warning');
                return;
            }
            showToast(bizErrorMessage(error), 'error')
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
            showToast(bizErrorMessage(error), 'error')
        }
    })
    return data;   
};

// 有录入过但还没保存的行（含录入 0）
const hasUnsavedChanges = computed(() => {
  return itemData.value?.task_details?.some((item: any) => isTouched(item)) ?? false
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
  if (creatingAdjustment.value || adjustmentCreated.value) return null
  // 如果无有效记录，直接提示并返回
  if (validDetails.value.length === 0) {
    showToast(t('cyclecount.validation.no-valid-records'), 'warning')
    return null
  }
  // 使用封装的确认对话框
  const confirmed = await showConfirm(
    t('action-results.create-confirm-title'),
    t('action-results.create-confirm'),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (confirmed) {
    // 执行创建调整
    await carete_adjustment();
  }
  return null
};

const carete_adjustment = async () => {
  // 提交锁：连点只生成一张调整单（同一盘点单重复生成后端返回 409）
  if (creatingAdjustment.value || adjustmentCreated.value) return null
  creatingAdjustment.value = true
  // 在回调里赋值：用 as 声明，避免 TS 把它收窄成 null
  let createdId = null as number | string | null

  const data = await httpRequest(`/api/warehouse/adjustment/create_adjustment_by_cyclecount/${taskId}`, {
    method: 'POST',
    onSuccess: (data) => {
      adjustmentCreated.value = true
      createdId = data?.id ?? null
      showToast(t('action-results.success'), 'success')
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
      // 16086：该盘点单已生成过调整单，details.adjustment_id 是已有的那张，直接跳过去
      if (Number(error?.code) === 16086 && error?.details?.adjustment_id) {
        adjustmentCreated.value = true
        createdId = error.details.adjustment_id
      }
    },
    onFinally: () => {
      creatingAdjustment.value = false
    },
  });

  // 成功后跳到新建的调整单（审批在调整单详情页进行）
  if (createdId !== null) {
    await router.push(`/adjustment/detail/${createdId}`)
  }
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
                    <tr v-for="item in itemData?.task_details" :class="{ 'table-danger': unrecordedIds.includes(Number(item.id)) }">
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
                          v-model="item.new_cyclecount_quantity" v-show="item.new_cyclecount_quantity>=0" @input="markTouched(item)"
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
                  @click="saveTask()" :disabled="!hasUnsavedChanges || saving">
                  <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
                  <i v-else class="ri-draft-line me-1 align-middle"></i>{{t('button.save')}}</button>

                <button class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status =='in_progress'" :title="t('button.complete')"
                  @click="completeFn()" :disabled="hasUnsavedChanges || !allItemsCompleted"><i class="ri-save-line me-1 align-middle"></i>{{t('button.complete')}}
                </button>
                <button class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status =='completed' && validDetails.length > 0 && !adjustmentCreated" title="Create Adjustment"
                    @click="carete_adjustmentFn()" :disabled="creatingAdjustment">
                    <span v-if="creatingAdjustment" class="spinner-border spinner-border-sm me-1"></span>
                    <i v-else class="ri-save-line me-1 align-middle"></i>{{t('adjustment.operations.add')}}
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
