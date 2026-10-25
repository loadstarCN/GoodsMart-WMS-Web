<script lang="ts" setup>
/**
 * 记录手工约好的揽收的弹窗（揽收页用；发货单详情的「揽收」一步直接展开同一个表单 ManualPickupForm）。
 * 表单与提交在 ManualPickupForm 里；这里只是 WModal 外壳和底部按钮。提交后不论成败都 emit submitted，成功时关掉并 emit recorded。
 */
import type { CarrierPickup, ManualPickupShipment } from '~/composables/customs/carrierPickup'

const props = withDefaults(defineProps<{
  open: boolean
  carrierId: number | null
  carrierName: string
  warehouseId?: number | string | null
  shipments: ManualPickupShipment[]
  selectable?: boolean
  initialSelected?: number[] | null
  contact?: string | null
  defaultReadyTime?: string | null
  defaultCloseTime?: string | null
  today?: string | null
}>(), {
  warehouseId: null,
  selectable: false,
  initialSelected: null,
  contact: null,
  defaultReadyTime: null,
  defaultCloseTime: null,
  today: null,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'recorded', pickup: CarrierPickup | null): void
  (e: 'submitted'): void
}>()

const { t } = useI18n()
const form = ref<{ submit: () => Promise<void>; submitting: boolean; canSubmit: boolean } | null>(null)
const submitting = computed(() => !!form.value?.submitting)
const visible = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value && !submitting.value) emit('update:open', false)
  },
})
const onRecorded = (pickup: CarrierPickup | null) => {
  emit('recorded', pickup)
  emit('update:open', false)
}
</script>

<template>
  <WModal v-model:open="visible" :title="`${t('shipping.pickup.record-title')} · ${carrierName}`" size="lg" :closable="!submitting">
    <ManualPickupForm ref="form" :active="open" :carrier-id="carrierId" :carrier-name="carrierName" :warehouse-id="warehouseId"
      :shipments="shipments" :selectable="selectable" :initial-selected="initialSelected" :contact="contact"
      :default-ready-time="defaultReadyTime" :default-close-time="defaultCloseTime" :today="today"
      @recorded="onRecorded" @submitted="emit('submitted')" />
    <template #footer>
      <WButton :disabled="submitting" @click="visible = false">{{ t('button.cancel') }}</WButton>
      <WButton variant="primary" :loading="submitting" :disabled="!form?.canSubmit" @click="form?.submit()">
        {{ t('shipping.pickup.record-submit') }}
      </WButton>
    </template>
  </WModal>
</template>
