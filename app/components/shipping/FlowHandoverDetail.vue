<script lang="ts" setup>
/**
 * 发货流程 ·「交承运商」一步的内容：完成发货（complete_shipping）。
 * - 实际交给承运商的时刻默认现在，可以改成更早的实际时刻（不能晚于现在）；没改时不传 shipped_at（后端按现在）。
 *   输入框是 DN 所属仓库时区的墙上时间（流程 provideTimeZone），提交带该时区的偏移（2026-10-23T13:03:00+09:00）
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

const { t } = useI18n()
const { bizErrorMessage } = useBizError()
const { timeZone, differs: zoneDiffers, description: zoneDescription, formatLocale, toOffsetIso } = useTimeZone()

/** 完成发货时要弹窗说明的业务码：自动运单锁定（16078）/ 结果不明（16079）/ 与 CI 上的运单号或承运商不一致（16080 / 16092）/ 不是当前任务（16091） */
const SHIPPING_BLOCK_CODES = [16078, 16079, 16080, 16091, 16092]

const done = computed(() => props.step.state === 'done')
/** 后端没列出 complete_shipping 时：这一步轮到了（current / warning）才给 */
const canComplete = computed(() => !!props.taskId && flowActionEnabled(props.step, 'complete_shipping',
  !props.locked && (props.step.state === 'current' || props.step.state === 'warning')))
const autoByTracking = computed(() => props.carrier?.methods.tracking === 'api')

/** 实际交出的时刻（带偏移的 ISO）；没改过时按现在提交（不传） */
const shippedAt = ref<string | null>(toOffsetIso(new Date()))
const touched = ref(false)
const maxValue = ref(new Date())
const resetNow = () => {
  const now = new Date()
  shippedAt.value = toOffsetIso(now)
  maxValue.value = now
  touched.value = false
}
// 读到流程的时区后（或时区变了）没改过的输入框按新时区重填
watch(timeZone, () => {
  if (!touched.value) resetNow()
})
const onInput = (value: string | null | undefined) => {
  shippedAt.value = value ?? null
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
    at = parseDateTime(shippedAt.value, timeZone.value)
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
  const confirmed = await wConfirm({
    title: t('shipping.handover.confirm-title'),
    message: t('shipping.handover.confirm', { time: formatLocale(at || new Date()) }),
    confirmText: t('shipping.actions.complete_shipping'),
    cancelText: t('button.cancel'),
  })
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
    if (at) body.shipped_at = toOffsetIso(at)
    await httpRequest(`/api/warehouse/delivery/${props.taskId}/complete/`, {
      method: 'PUT',
      body,
      onSuccess: () => {
        showToast(t('action-results.task-complete'), 'success')
      },
      onError: (error) => {
        if (SHIPPING_BLOCK_CODES.includes(Number(error.code))) {
          wAlert({ title: t('shipping.handover.blocked-title'), message: bizErrorMessage(error), tone: 'error' })
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
  <div class="w-flow-handover">
    <template v-if="!done">
      <div v-if="canComplete" class="w-flow-handover__form">
        <WField :label="t('shipping.handover.shipped-at')" :hint="zoneDiffers ? t('timezone.input-hint', { zone: zoneDescription }) : undefined"
          :help="t('shipping.handover.time-hint')" class="w-flow-handover__field">
          <div class="w-flow-handover__time">
            <WDatePicker :model-value="shippedAt" mode="datetime" :max="maxValue" :disabled="busy" @update:model-value="onInput" />
            <WButton :disabled="busy" @click="resetNow">{{ t('shipping.now') }}</WButton>
          </div>
        </WField>
        <div class="w-flow-handover__submit">
          <WButton variant="primary" icon="delivery" :loading="busy" @click="complete">{{ t('shipping.actions.complete_shipping') }}</WButton>
          <WHelp v-if="autoByTracking" :text="t('shipping.handover.auto-hint', { carrier: carrier?.name || '' })" />
        </div>
      </div>
      <p v-else-if="autoByTracking" class="w-flow-handover__note">{{ t('shipping.handover.auto-hint', { carrier: carrier?.name || '' }) }}</p>
    </template>
    <p v-else-if="step.source === 'carrier'" class="w-flow-handover__note">{{ t('shipping.handover.by-carrier') }}</p>
    <ShippingFlowActionNotes v-if="!locked" :actions="step.actions" :carrier-name="carrier?.name" />
  </div>
</template>

<style scoped>
.w-flow-handover { font-family: var(--w-font); }
.w-flow-handover__form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}
.w-flow-handover__field { flex: 1 1 320px; max-width: 420px; }
.w-flow-handover__time { display: flex; gap: 8px; }
.w-flow-handover__time > :first-child { flex: 1; min-width: 0; }
.w-flow-handover__submit { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
/* 有提示字时按钮与输入框对齐（提示字在输入框下面） */
.w-flow-handover__form:has(.w-field__hint) .w-flow-handover__submit { margin-bottom: 22px; }
.w-flow-handover__note {
  margin: 0;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-2);
}
</style>
