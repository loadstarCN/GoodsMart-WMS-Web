<script lang="ts" setup>
/**
 * 预约上门揽收的弹窗（揽收页用；发货单详情的「揽收」一步直接展开同一个表单 CarrierPickupForm）。
 * 表单、可约时间、提交都在 CarrierPickupForm 里；这里只是 WModal 外壳和底部按钮。
 * 提交后不论成败都 emit submitted，成功时关掉并 emit booked。
 */
import type {
  CarrierPickup,
  PickupLocation,
  PickupShipmentRow,
} from '~/composables/customs/carrierPickup'

const props = withDefaults(defineProps<{
  open: boolean
  carrierId: number | null
  /** 文案里的承运商名（FedEx） */
  carrierName: string
  /** 揽收仓库（X-WAREHOUSE-ID）；不传用页头的当前仓库 */
  warehouseId?: number | string | null
  shipments: PickupShipmentRow[]
  /** 列出运单让人勾选；initialSelected 是默认勾上的（不传 = 全部） */
  selectable?: boolean
  initialSelected?: number[] | null
  location?: PickupLocation | null
  maxRemarks?: number | null
  /** 仓库当地今天（YYYY-MM-DD） */
  today?: string | null
  /** 弹窗顶部的补充说明（如「今天已经约过一次」） */
  note?: string | null
}>(), {
  warehouseId: null,
  selectable: false,
  initialSelected: null,
  location: null,
  maxRemarks: null,
  today: null,
  note: null,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'booked', pickup: CarrierPickup): void
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
const onBooked = (pickup: CarrierPickup) => {
  emit('booked', pickup)
  emit('update:open', false)
}
</script>

<template>
  <WModal v-model:open="visible" :title="`${t('delivery.pickup.modal.title')} · ${carrierName}`" size="xl" :closable="!submitting">
    <CarrierPickupForm ref="form" :active="open" :carrier-id="carrierId" :carrier-name="carrierName" :warehouse-id="warehouseId"
      :shipments="shipments" :selectable="selectable" :initial-selected="initialSelected" :location="location"
      :max-remarks="maxRemarks" :today="today" :note="note" @booked="onBooked" @submitted="emit('submitted')" />
    <template #footer>
      <WButton :disabled="submitting" @click="visible = false">{{ t('button.cancel') }}</WButton>
      <WButton variant="primary" :loading="submitting" :disabled="!form?.canSubmit" @click="form?.submit()">
        {{ t('delivery.pickup.modal.submit') }}
      </WButton>
    </template>
  </WModal>
</template>
