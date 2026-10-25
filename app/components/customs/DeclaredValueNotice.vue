<script lang="ts" setup>
/**
 * 运送保险提示（出库单单证卡片、打包 / 配送任务的海外发货区用）
 *
 * - 报关快照带运送申告价额（declared_value_carriage）→ 按建单方式提示：
 *   manual（手工建单）：在承运商系统登记出货时填这个申告价额
 *   auto（已启用自动建单、还没建）：自动建单会随运单提交；手工建单时仍要填写
 *   submitted（已自动建单）：申告价额已随运单提交
 * - 自动建单时申告价额高于已打包货值会被压到货值：carrierValue 给出实际（将）提交的值，另起一行说明
 * - 没有 → 「无申告价额（未投保运送保险）」
 * - 没有报关快照（国内件）不显示
 */
import { formatMoney } from '~/composables/customs/customsDocuments'
import { declaredAmountOrNull, type DeclaredValueMode } from '~/composables/customs/carrierShipment'

const props = withDefaults(defineProps<{
  customs: Record<string, any> | null | undefined
  /** 紧凑显示 */
  compact?: boolean
  mode?: DeclaredValueMode
  /** 随 FedEx 运单实际（将）提交的申告价额，与快照不同时才传；null = 不提交 */
  carrierValue?: number | null
}>(), {
  compact: false,
  mode: 'manual',
})

const { t } = useI18n()

const currency = computed(() => String(props.customs?.currency || 'JPY'))
const hasValue = (v: unknown) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))
/** 申告价额为 0 时按「没有申告价额」处理（后端把 0 视为不提交） */
const declaredValue = computed(() => declaredAmountOrNull(props.customs?.declared_value_carriage))
const insuranceCharge = computed(() =>
  hasValue(props.customs?.insurance_charge) ? Number(props.customs?.insurance_charge) : null)
const submitted = computed(() => props.mode === 'submitted')
const TIP_KEYS: Record<DeclaredValueMode, string> = {
  manual: 'customs.tips.declared-value-carriage',
  auto: 'customs.tips.declared-value-carriage-auto',
  submitted: 'customs.tips.declared-value-carriage-submitted',
}
const tipKey = computed(() => TIP_KEYS[props.mode as DeclaredValueMode] || TIP_KEYS.manual)
/** 自动建单时的实际提交值（被压到已打包货值）：手工建单模式不显示 */
const cappedText = computed(() => {
  if (props.mode === 'manual' || props.carrierValue === undefined) return ''
  const applied = declaredAmountOrNull(props.carrierValue)
  const amount = applied === null ? '—' : formatMoney(applied, currency.value)
  return t(props.mode === 'submitted' ? 'customs.tips.declared-value-capped-submitted' : 'customs.tips.declared-value-capped-auto',
    { amount })
})
</script>

<template>
  <template v-if="customs">
    <WAlert v-if="declaredValue !== null" :tone="submitted ? 'ok' : 'warn'" :title="t('customs.tips.declared-value-carriage-heading')"
      class="w-declared">
      <span class="w-declared__amount">{{ formatMoney(declaredValue, currency) }}</span>
      <span class="w-declared__tip">{{ t(tipKey) }}</span>
      <span v-if="cappedText" class="w-declared__capped">{{ cappedText }}</span>
      <span v-if="insuranceCharge" class="w-declared__tip">{{ t('customs.fields.insurance') }} {{ formatMoney(insuranceCharge, currency) }}</span>
    </WAlert>
    <p v-else class="w-declared__none">{{ t('customs.tips.no-declared-value') }}</p>
  </template>
</template>

<style scoped>
.w-declared :deep(.w-alert__text) { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.w-declared__amount { font-weight: var(--w-fw-semibold); font-variant-numeric: tabular-nums; }
.w-declared__tip { color: var(--w-text-2); }
.w-declared__capped { font-weight: var(--w-fw-medium); }
.w-declared__none {
  margin: 0;
  font-family: var(--w-font);
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
</style>
