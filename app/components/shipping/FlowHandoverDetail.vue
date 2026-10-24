<script lang="ts" setup>
/**
 * 发货流程 ·「交承运商」一步的内容：完成发货（complete_shipping）。
 * - 实际交给承运商的时刻默认现在，可以改成更早的实际时刻（不能晚于现在）；没改时不传 shipped_at（后端按现在）
 * - 发货任务还没开始（pending）时先开始（PUT process），再完成（PUT complete）
 * - 配送任务页传 completeExtras：把页面上的运费、承运商、运输方式、备注一起提交（返回 null = 页面校验没过，不提交）
 * - 有 API 跟踪的承运商揽收后会自动完成发货（来源记承运商），也可以在这里手工完成
 * 运单号在「运单」一步填（国内件手工填运单号后就能完成）。做了操作 emit changed。
 */
import {
  flowActionEnabled,
  type FlowCarrier,
  type FlowStep,
} from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  step: FlowStep
  /** 当前发货任务 */
  taskId: number | null
  carrier?: FlowCarrier | null
  /** DN 已发货 */
  locked?: boolean
  /** 页面上要一起提交的字段；返回 null 表示不提交 */
  completeExtras?: (() => Record<string, any> | null | Promise<Record<string, any> | null>) | null
}>(), {
  carrier: null,
  locked: false,
  completeExtras: null,
})

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const { t, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()

/** 完成发货时要弹窗说明的业务码：自动运单锁定（16078）/ 结果不明（16079）/ 与 CI 上的运单号或承运商不一致（16080 / 16092）/ 不是当前任务（16091） */
const SHIPPING_BLOCK_CODES = [16078, 16079, 16080, 16091, 16092]

const done = computed(() => props.step.state === 'done')
/** 后端没列出 complete_shipping 时：这一步轮到了（current / warning）才给 */
const canComplete = computed(() => !!props.taskId && flowActionEnabled(props.step, 'complete_shipping',
  !props.locked && (props.step.state === 'current' || props.step.state === 'warning')))
const autoByTracking = computed(() => props.carrier?.methods.tracking === 'api')

const shippedAt = ref(toDateTimeLocalValue())
const touched = ref(false)
const maxValue = ref(toDateTimeLocalValue())
const resetNow = () => {
  shippedAt.value = toDateTimeLocalValue()
  maxValue.value = shippedAt.value
  touched.value = false
}
const onInput = () => {
  touched.value = true
}

const busy = ref(false)

/** 读发货任务现在的状态（DN 详情页不知道任务状态） */
const taskStatus = async (): Promise<string | null> => {
  let status: string | null = null
  await httpRequest<any>(`/api/warehouse/delivery/${props.taskId}`, {
    method: 'GET',
    onSuccess: (data) => {
      status = data?.status ? String(data.status) : null
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
  })
  return status
}

const complete = async () => {
  if (!canComplete.value || busy.value || !props.taskId) return
  let at: Date | null = null
  if (touched.value) {
    at = fromDateTimeLocalValue(shippedAt.value)
    if (!at) {
      showToast(t('shipping.handover.time-invalid'), 'error')
      return
    }
    // 不能晚于现在（留一分钟的时钟误差）
    if (at.getTime() > Date.now() + 60 * 1000) {
      showToast(t('shipping.handover.time-future'), 'error')
      return
    }
  }
  const extras = props.completeExtras ? await props.completeExtras() : {}
  if (extras === null) return
  const confirmed = await showConfirm(
    t('shipping.handover.confirm-title'),
    t('shipping.handover.confirm', { time: formatLocaleDateTime(at || new Date(), String(localeProperties.value?.iso || '') || undefined) }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (!confirmed) return

  busy.value = true
  try {
    const status = await taskStatus()
    if (!status) return
    if (status === 'pending') {
      let started = false
      await httpRequest(`/api/warehouse/delivery/${props.taskId}/process/`, {
        method: 'PUT',
        onSuccess: () => {
          started = true
        },
        onError: (error) => {
          showToast(bizErrorMessage(error), 'error')
        },
      })
      if (!started) {
        emit('changed')
        return
      }
    } else if (status !== 'in_progress') {
      // 别人刚完成（或任务已停用）：按最新状态显示
      showToast(t('shipping.tips.state-changed'), 'warning')
      emit('changed')
      return
    }
    const body: Record<string, any> = { ...(extras || {}) }
    if (at) body.shipped_at = safeFormatDateTime(at)
    await httpRequest(`/api/warehouse/delivery/${props.taskId}/complete/`, {
      method: 'PUT',
      body,
      onSuccess: () => {
        showToast(t('action-results.task-complete'), 'success')
      },
      onError: (error) => {
        if (SHIPPING_BLOCK_CODES.includes(Number(error.code))) {
          showAlert(t('shipping.handover.blocked-title'), bizErrorMessage(error), 'error')
          return
        }
        showToast(bizErrorMessage(error), 'error')
      },
    })
    emit('changed')
  } finally {
    busy.value = false
  }
}

const run = (key: string) => {
  if (key === 'complete_shipping') complete()
}

defineExpose({ run })
</script>

<template>
  <div class="flow-handover fs-13">
    <template v-if="!done">
      <p class="fs-12 text-muted mb-2" v-if="autoByTracking">
        <i class="ri-information-line me-1"></i>{{ t('shipping.handover.auto-hint', { carrier: carrier?.name || '' }) }}
      </p>
      <div class="d-flex flex-wrap align-items-end gap-2" v-if="canComplete">
        <div>
          <label class="form-label fs-12 mb-1" for="flow-shipped-at">{{ t('shipping.handover.shipped-at') }}</label>
          <div class="input-group input-group-sm">
            <input type="datetime-local" class="form-control" id="flow-shipped-at" v-model="shippedAt" :max="maxValue"
              :disabled="busy" @input="onInput">
            <button type="button" class="btn btn-light" :disabled="busy" @click="resetNow">{{ t('shipping.now') }}</button>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" :disabled="busy" @click="complete">
          <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="ri-check-double-line me-1"></i>{{ t('shipping.actions.complete_shipping') }}
        </button>
      </div>
      <p class="fs-12 text-muted mb-0 mt-1" v-if="canComplete">{{ t('shipping.handover.time-hint') }}</p>
    </template>
    <p class="fs-12 text-muted mb-0" v-else-if="step.source === 'carrier'">{{ t('shipping.handover.by-carrier') }}</p>
    <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrier?.name" v-if="!locked" />
  </div>
</template>
