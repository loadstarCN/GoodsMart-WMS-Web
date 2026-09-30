<script lang="ts" setup>
/**
 * 运送保险提示（出库单单证卡片、打包 / 发货详情的单证概要用）
 *
 * - 报关快照带运送申告价额（declared_value_carriage）→ 按建单方式提示：
 *   manual（手工建单）：在承运商系统登记出货时填这个申告价额
 *   auto（已启用自动建单、还没建）：自动建单会随运单提交；手工建单时仍要填写
 *   submitted（已自动建单）：申告价额已随运单提交
 * - 没有 → 「无申告价额（未投保运送保险）」
 * - 没有报关快照（国内件）不显示
 */
import { formatMoney } from '~/composables/customs/customsDocuments'
import type { DeclaredValueMode } from '~/composables/customs/carrierShipment'

const props = withDefaults(defineProps<{
  customs: Record<string, any> | null | undefined
  /** 紧凑显示（单证概要里用） */
  compact?: boolean
  mode?: DeclaredValueMode
}>(), {
  compact: false,
  mode: 'manual',
})

const { t } = useI18n()

const currency = computed(() => String(props.customs?.currency || 'JPY'))
const hasValue = (v: unknown) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))
const declaredValue = computed(() =>
  hasValue(props.customs?.declared_value_carriage) ? Number(props.customs?.declared_value_carriage) : null)
const insuranceCharge = computed(() =>
  hasValue(props.customs?.insurance_charge) ? Number(props.customs?.insurance_charge) : null)
const submitted = computed(() => props.mode === 'submitted')
const TIP_KEYS: Record<DeclaredValueMode, string> = {
  manual: 'customs.tips.declared-value-carriage',
  auto: 'customs.tips.declared-value-carriage-auto',
  submitted: 'customs.tips.declared-value-carriage-submitted',
}
const tipKey = computed(() => TIP_KEYS[props.mode as DeclaredValueMode] || TIP_KEYS.manual)
</script>

<template>
  <template v-if="customs">
    <div class="alert d-flex align-items-start gap-2" :class="[submitted ? 'alert-success-transparent' : 'alert-warning', compact ? 'py-2 fs-13 mb-2' : 'mb-3']"
      role="alert" v-if="declaredValue !== null">
      <i class="fs-18 lh-1" :class="submitted ? 'ri-checkbox-circle-line' : 'ri-shield-check-line'"></i>
      <div>
        <div class="fw-semibold">
          {{ t('customs.tips.declared-value-carriage-heading') }}：<span class="fs-16 font-monospace">{{ formatMoney(declaredValue, currency) }}</span>
        </div>
        <div>{{ t(tipKey) }}</div>
        <div class="fs-12 mt-1" v-if="insuranceCharge">
          {{ t('customs.fields.insurance') }}：{{ formatMoney(insuranceCharge, currency) }}
        </div>
      </div>
    </div>
    <div class="fs-12 text-muted" :class="compact ? 'mb-2' : 'mb-3'" v-else>
      <i class="ri-shield-line me-1"></i>{{ t('customs.tips.no-declared-value') }}
    </div>
  </template>
</template>
