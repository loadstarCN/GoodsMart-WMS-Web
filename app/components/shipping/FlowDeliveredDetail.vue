<script lang="ts" setup>
/**
 * 发货流程 ·「签收」一步的内容：
 * - 预计送达日（承运商跟踪给的）、自动视为签收的时刻（承运商设了 auto_sign_days、运单没有 API 跟踪时：交承运商 + N 天）
 * - 确认签收（sign）：签收时刻默认现在，可以改成实际时刻（不能晚于现在、不能早于交承运商的时刻）；
 *   没改时不传 signed_at（后端按现在）
 * - 已签收：来源是规则时说明是按规则自动视为签收
 * 做了操作 emit changed。
 */
import {
  flowActionEnabled,
  type FlowCarrier,
  type FlowStep,
} from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  step: FlowStep
  taskId: number | null
  carrier?: FlowCarrier | null
  /** DN 的状态：后端没列出 sign 时，已发货（delivered）才能签收 */
  dnStatus?: string | null
  /** 交承运商的时刻（流程 handover 一步的 at）：签收时刻不能早于它 */
  handoverAt?: string | null
}>(), {
  carrier: null,
  dnStatus: null,
  handoverAt: null,
})

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const { t, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()

const done = computed(() => props.step.state === 'done')
const estimated = computed(() => String(props.step.summary?.estimated_delivery || ''))
const autoSignAt = computed(() => String(props.step.summary?.auto_sign_at || ''))
const autoSignDays = computed(() => props.carrier?.auto_sign_days ?? null)
const autoByTracking = computed(() => props.carrier?.methods.tracking === 'api')
const canSign = computed(() => !!props.taskId && flowActionEnabled(props.step, 'sign', !done.value && props.dnStatus === 'delivered'))

/** 交承运商的时刻（精确到分，与时间输入框一致）；没有为 null */
const handoverDate = computed<Date | null>(() => {
  const date = props.handoverAt ? new Date(props.handoverAt) : null
  return date && !isNaN(date.getTime()) ? new Date(Math.floor(date.getTime() / 60000) * 60000) : null
})
const minValue = computed(() => (handoverDate.value ? toDateTimeLocalValue(handoverDate.value) : undefined))

const signedAt = ref(toDateTimeLocalValue())
const touched = ref(false)
const maxValue = ref(toDateTimeLocalValue())
const resetNow = () => {
  signedAt.value = toDateTimeLocalValue()
  maxValue.value = signedAt.value
  touched.value = false
}

const busy = ref(false)
const sign = async () => {
  if (!canSign.value || busy.value || !props.taskId) return
  let at: Date | null = null
  if (touched.value) {
    at = fromDateTimeLocalValue(signedAt.value)
    if (!at) {
      showToast(t('shipping.handover.time-invalid'), 'error')
      return
    }
    if (at.getTime() > Date.now() + 60 * 1000) {
      showToast(t('shipping.handover.time-future'), 'error')
      return
    }
    if (handoverDate.value && at.getTime() < handoverDate.value.getTime()) {
      const time = formatLocaleDateTime(handoverDate.value, String(localeProperties.value?.iso || '') || undefined)
      showToast(t('shipping.delivered.time-before-handover', { time }), 'error')
      return
    }
  }
  busy.value = true
  await httpRequest(`/api/warehouse/delivery/${props.taskId}/sign/`, {
    method: 'PUT',
    // 签收时刻按本地时间（不带时区）提交，与以前的配送任务页一致；不传 = 现在
    body: at ? { signed_at: formatDateTimeWithoutTimezone(at) } : {},
    onSuccess: () => {
      showToast(t('delivery.tips.signed'), 'success')
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      busy.value = false
    },
  })
  emit('changed')
}

const run = (key: string) => {
  if (key === 'sign') sign()
}

defineExpose({ run })
</script>

<template>
  <div class="flow-delivered fs-13">
    <template v-if="done">
      <p class="fs-12 text-muted mb-0" v-if="step.source === 'rule'">
        <i class="ri-information-line me-1"></i>{{ t('shipping.delivered.by-rule', { days: autoSignDays ?? '—' }) }}
      </p>
      <p class="fs-12 text-muted mb-0" v-else-if="step.source === 'carrier'">{{ t('shipping.delivered.by-carrier') }}</p>
    </template>
    <template v-else>
      <!-- 概要行先写自动签收时刻，没有时写预计送达：这里只补概要行没写的 -->
      <div class="text-muted" v-if="estimated && autoSignAt">
        <i class="ri-calendar-line me-1"></i>{{ t('customs.carrier.tracking.eta', { date: estimated }) }}
      </div>
      <div class="fs-12 text-muted" v-if="!autoSignAt && autoByTracking">{{ t('shipping.delivered.auto-by-tracking') }}</div>

      <div class="d-flex flex-wrap align-items-end gap-2 mt-2" v-if="canSign">
        <div>
          <label class="form-label fs-12 mb-1" for="flow-signed-at">{{ t('shipping.delivered.signed-at') }}</label>
          <div class="input-group input-group-sm">
            <input type="datetime-local" class="form-control" id="flow-signed-at" v-model="signedAt" :min="minValue" :max="maxValue"
              :disabled="busy" @input="touched = true">
            <button type="button" class="btn btn-light" :disabled="busy" @click="resetNow">{{ t('shipping.now') }}</button>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" :disabled="busy" @click="sign">
          <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="ri-checkbox-circle-line me-1"></i>{{ t('shipping.actions.sign') }}
        </button>
      </div>
      <p class="fs-12 text-muted mb-0 mt-1" v-if="canSign">{{ t('shipping.delivered.manual-hint') }}</p>
    </template>
    <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrier?.name" />
  </div>
</template>
