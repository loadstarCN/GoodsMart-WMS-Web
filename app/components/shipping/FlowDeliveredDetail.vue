<script lang="ts" setup>
/**
 * 发货流程 ·「签收」一步的内容：
 * - 预计送达日（承运商跟踪给的）、自动视为签收的时刻（承运商设了 auto_sign_days、运单没有 API 跟踪时：交承运商 + N 天）
 * - 确认签收（sign）：签收时刻默认现在，可以改成实际时刻（不能晚于现在、不能早于交承运商的时刻）；
 *   没改时不传 signed_at（后端按现在）。输入框是 DN 所属仓库时区的墙上时间（流程 provideTimeZone），提交带该时区的偏移
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

const { t } = useI18n()
const { bizErrorMessage } = useBizError()
const { timeZone, differs: zoneDiffers, description: zoneDescription, formatLocale, toOffsetIso } = useTimeZone()

const done = computed(() => props.step.state === 'done')
const estimated = computed(() => String(props.step.summary?.estimated_delivery || ''))
const autoSignAt = computed(() => String(props.step.summary?.auto_sign_at || ''))
const autoSignDays = computed(() => props.carrier?.auto_sign_days ?? null)
const autoByTracking = computed(() => props.carrier?.methods.tracking === 'api')
const canSign = computed(() => !!props.taskId && flowActionEnabled(props.step, 'sign', !done.value && props.dnStatus === 'delivered'))

/** 交承运商的时刻（精确到分，与时间输入框一致）；没有为 null */
const handoverDate = computed<Date | null>(() => {
  const date = parseDateTime(props.handoverAt, timeZone.value)
  return date ? new Date(Math.floor(date.getTime() / 60000) * 60000) : null
})

const signedAt = ref<string | null>(toOffsetIso(new Date()))
const touched = ref(false)
const maxValue = ref(new Date())
const resetNow = () => {
  const now = new Date()
  signedAt.value = toOffsetIso(now)
  maxValue.value = now
  touched.value = false
}
// 读到流程的时区后（或时区变了）没改过的输入框按新时区重填
watch(timeZone, () => {
  if (!touched.value) resetNow()
})
const onInput = (value: string | null | undefined) => {
  signedAt.value = value ?? null
  touched.value = true
}

const busy = ref(false)
const sign = async () => {
  if (!canSign.value || busy.value || !props.taskId) return
  let at: Date | null = null
  if (touched.value) {
    at = parseDateTime(signedAt.value, timeZone.value)
    if (!at) {
      showToast(t('shipping.handover.time-invalid'), 'error')
      return
    }
    if (at.getTime() > Date.now() + 60 * 1000) {
      showToast(t('shipping.handover.time-future'), 'error')
      return
    }
    if (handoverDate.value && at.getTime() < handoverDate.value.getTime()) {
      const time = formatLocale(handoverDate.value)
      showToast(t('shipping.delivered.time-before-handover', { time }), 'error')
      return
    }
  }
  busy.value = true
  await httpRequest(`/api/warehouse/delivery/${props.taskId}/sign/`, {
    method: 'PUT',
    // 签收时刻带仓库时区的偏移提交（后端 doc/timezone-utc.md）；不传 = 现在
    body: at ? { signed_at: toOffsetIso(at) } : {},
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
  <div class="w-flow-signed">
    <template v-if="done">
      <p v-if="step.source === 'rule'" class="w-flow-signed__note">{{ t('shipping.delivered.by-rule', { days: autoSignDays ?? '—' }) }}</p>
      <p v-else-if="step.source === 'carrier'" class="w-flow-signed__note">{{ t('shipping.delivered.by-carrier') }}</p>
    </template>
    <template v-else>
      <!-- 概要行先写自动签收时刻，没有时写预计送达：这里只补概要行没写的 -->
      <p v-if="estimated && autoSignAt" class="w-flow-signed__note">{{ t('customs.carrier.tracking.eta', { date: estimated }) }}</p>
      <p v-if="!autoSignAt && autoByTracking" class="w-flow-signed__note">{{ t('shipping.delivered.auto-by-tracking') }}</p>

      <div v-if="canSign" class="w-flow-signed__form">
        <WField :label="t('shipping.delivered.signed-at')" :help="t('shipping.delivered.manual-hint')"
          :hint="zoneDiffers ? t('timezone.input-hint', { zone: zoneDescription }) : undefined" class="w-flow-signed__field">
          <div class="w-flow-signed__time">
            <WDatePicker :model-value="signedAt" mode="datetime" :min="handoverDate" :max="maxValue" :disabled="busy"
              @update:model-value="onInput" />
            <WButton :disabled="busy" @click="resetNow">{{ t('shipping.now') }}</WButton>
          </div>
        </WField>
        <WButton variant="primary" icon="check" :loading="busy" class="w-flow-signed__submit" @click="sign">{{ t('shipping.actions.sign') }}</WButton>
      </div>
    </template>
    <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrier?.name" />
  </div>
</template>

<style scoped>
.w-flow-signed {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--w-font);
}
.w-flow-signed__note {
  margin: 0;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-2);
}
.w-flow-signed__form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}
.w-flow-signed__field { flex: 1 1 320px; max-width: 420px; }
.w-flow-signed__time { display: flex; gap: 8px; }
.w-flow-signed__time > :first-child { flex: 1; min-width: 0; }
.w-flow-signed__submit { margin-left: auto; }
.w-flow-signed__form:has(.w-field__hint) .w-flow-signed__submit { margin-bottom: 22px; }
</style>
