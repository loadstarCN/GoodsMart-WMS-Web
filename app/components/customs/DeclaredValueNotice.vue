<script lang="ts" setup>
/**
 * 运送保险提示（出库单单证卡片、打包 / 发货详情的单证概要用）
 *
 * - 报关快照带运送申告价额（declared_value_carriage）→ 醒目提示：在承运商系统登记出货时填这个申告价额
 * - 没有 → 「无申告价额（未投保运送保险）」
 * - 没有报关快照（国内件）不显示
 */
import { formatMoney } from '~/composables/customs/customsDocuments'

const props = withDefaults(defineProps<{
  customs: Record<string, any> | null | undefined
  /** 紧凑显示（单证概要里用） */
  compact?: boolean
}>(), {
  compact: false,
})

const { t } = useI18n()

const currency = computed(() => String(props.customs?.currency || 'JPY'))
const hasValue = (v: unknown) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))
const declaredValue = computed(() =>
  hasValue(props.customs?.declared_value_carriage) ? Number(props.customs?.declared_value_carriage) : null)
const insuranceCharge = computed(() =>
  hasValue(props.customs?.insurance_charge) ? Number(props.customs?.insurance_charge) : null)
</script>

<template>
  <template v-if="customs">
    <div class="alert alert-warning d-flex align-items-start gap-2" :class="compact ? 'py-2 fs-13 mb-2' : 'mb-3'"
      role="alert" v-if="declaredValue !== null">
      <i class="ri-shield-check-line fs-18 lh-1"></i>
      <div>
        <div class="fw-semibold">
          {{ t('customs.tips.declared-value-carriage-heading') }}：<span class="fs-16 font-monospace">{{ formatMoney(declaredValue, currency) }}</span>
        </div>
        <div>{{ t('customs.tips.declared-value-carriage') }}</div>
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
