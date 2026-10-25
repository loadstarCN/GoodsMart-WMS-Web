<script lang="ts" setup>
/**
 * 发货流程一步里「现在不能做的操作」及原因（actions[].enabled = false 且带 reason）：原因按 reason_code 翻译
 * （flowActionReasonText），没有对应文案时显示后端的英文原因。
 * only：只列这些操作（这一步的详细内容里只关心其中几个时）；第二期的操作不列。
 */
import { HIDDEN_ACTIONS, flowActionReasonText, type FlowAction } from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  actions: FlowAction[]
  only?: string[] | null
  /** 原因文案里的 {carrier}（承运商名） */
  carrierName?: string | null
  /** 原因文案里的 {tracking}（运单号） */
  trackingNumber?: string | null
}>(), {
  only: null,
  carrierName: null,
  trackingNumber: null,
})

const { t, te } = useI18n()

const notes = computed(() => props.actions.filter((a: FlowAction) =>
  !a.enabled && !!a.reason && !HIDDEN_ACTIONS.includes(a.key) && (!props.only || props.only.includes(a.key))))
const actionText = (key: string) => (te(`shipping.actions.${key}`) ? t(`shipping.actions.${key}`) : key)
const reasonText = (a: FlowAction): string => flowActionReasonText(a, t, te, {
  carrier: props.carrierName || t('customs.carrier.carrier-fallback'), tracking: props.trackingNumber || '' })
</script>

<template>
  <ul v-if="notes.length" class="w-flow-notes">
    <li v-for="a in notes" :key="a.key">{{ t('shipping.action-disabled', { action: actionText(a.key), reason: reasonText(a) }) }}</li>
  </ul>
</template>

<style scoped>
.w-flow-notes {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-family: var(--w-font);
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-flow-notes li + li { margin-top: 2px; }
</style>
