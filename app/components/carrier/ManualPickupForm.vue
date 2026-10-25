<script lang="ts" setup>
/**
 * 记录手工约好的揽收（承运商的揽收方式 = manual：电话 / 网站约好后在 WMS 记一笔；设计稿 CarrierSteps「电话 / 网站预约」）。
 * 发货流程「揽收」一步里直接展开，揽收页经 ManualPickupModal 放在弹窗里。逻辑原来在 ManualPickupModal 里，搬到这里两边共用。
 *
 * POST /warehouse/dn/carrier-pickups/manual
 *   body {warehouse_id, carrier_id, shipment_ids, pickup_date: 'YYYY-MM-DD', ready_time: 'HH:MM', close_time: 'HH:MM',
 *         confirmation_code?, remarks?} → 201 {pickup}
 * 记录直接是「已约上」（scheduled），不调承运商；取消只改本地（POST /carrier-pickups/<id>/cancel）。
 * selectable：列出 shipments 让人勾选这次带哪些（initialSelected 默认勾上）；不传时 shipments 全部带上。
 * active 变成 true 时重置表单；submit() 后不论成败都 emit submitted，成功 emit recorded。
 * 揽收日、时间段都是仓库当地的（时区：warehouseId 的仓库 → 上层 provideTimeZone → 页头 / 浏览器），与浏览器不同时标出。
 */
import { warehouseHeaders } from '~/utils/http'
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_READY_TIME,
  MANUAL_PICKUP_URL,
  formatPickupWeight,
  pickupProblemLines,
  pickupTimeProblem,
  type CarrierPickup,
  type ManualPickupShipment,
} from '~/composables/customs/carrierPickup'

const props = withDefaults(defineProps<{
  active: boolean
  carrierId: number | null
  carrierName: string
  /** 揽收仓库（X-WAREHOUSE-ID、body.warehouse_id）；不传用页头的当前仓库 */
  warehouseId?: number | string | null
  shipments: ManualPickupShipment[]
  selectable?: boolean
  initialSelected?: number[] | null
  /** 约揽收的电话 / 网址 / 说明（承运商设置里的 pickup_contact） */
  contact?: string | null
  /** 默认的时间段（如定期集荷的时间） */
  defaultReadyTime?: string | null
  defaultCloseTime?: string | null
  /** 仓库当地的今天（揽收页接口的 today）：揽收日不能早于它；不传按本机的今天 */
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
  (e: 'recorded', pickup: CarrierPickup | null): void
  (e: 'submitted'): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const { differs: zoneDiffers, description: zoneDescription, abbr: zoneAbbr, today: warehouseToday } = useTimeZone(() => props.warehouseId)

const chosen = ref<number[]>([])
const submitting = ref(false)
const failure = ref<string | null>(null)
const form = reactive({
  pickup_date: '' as string | null,
  ready_time: DEFAULT_READY_TIME,
  close_time: DEFAULT_CLOSE_TIME,
  confirmation_code: '',
  remarks: '',
})

/** 今天（YYYY-MM-DD）：揽收日默认仓库当地的今天；接口给了仓库当地的今天（后端按它校验）且更晚时用它 */
const localToday = () => {
  const local = warehouseToday()
  return props.today && props.today > local ? props.today : local
}
const minDate = computed(() => localToday())

const timeProblem = computed(() => pickupTimeProblem(null, form.ready_time, form.close_time))
const timeProblemText = computed(() => (timeProblem.value ? t(`delivery.pickup.validation.${timeProblem.value}`, { cutoff: '—', minutes: '—' }) : ''))
const contactText = computed(() => String(props.contact || '').trim())
const contactIsUrl = computed(() => /^https?:\/\//i.test(contactText.value))

watch(() => props.active, (active: boolean) => {
  if (!active) return
  chosen.value = props.initialSelected ? [...props.initialSelected] : props.shipments.map((r: ManualPickupShipment) => r.shipment_id)
  failure.value = null
  form.pickup_date = localToday()
  form.ready_time = props.defaultReadyTime || DEFAULT_READY_TIME
  form.close_time = props.defaultCloseTime || DEFAULT_CLOSE_TIME
  form.confirmation_code = ''
  form.remarks = ''
}, { immediate: true })

const canSubmit = computed(() => !submitting.value && !timeProblem.value && !!form.pickup_date && chosen.value.length > 0 && !!props.carrierId)

const submit = async () => {
  if (!canSubmit.value) return
  submitting.value = true
  failure.value = null
  await httpRequest<{ pickup: CarrierPickup }>(MANUAL_PICKUP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...warehouseHeaders(props.warehouseId) },
    body: {
      warehouse_id: props.warehouseId === null || props.warehouseId === '' ? null : Number(props.warehouseId),
      carrier_id: props.carrierId,
      shipment_ids: chosen.value,
      pickup_date: form.pickup_date,
      ready_time: form.ready_time,
      close_time: form.close_time,
      confirmation_code: form.confirmation_code.trim() || null,
      remarks: form.remarks.trim() || null,
    },
    onSuccess: (data: { pickup: CarrierPickup }) => {
      showToast(t('shipping.pickup.recorded-toast'), 'success')
      emit('recorded', data?.pickup ?? null)
    },
    onError: (error) => {
      // 不能记的运单（16132）逐张按界面语言说明
      const lines = pickupProblemLines(error, props.carrierName, t, te)
      failure.value = lines.length
        ? t('delivery.pickup.tips.problem-lines', { summary: bizErrorMessage(error), items: lines.join(t('shipping.list-separator')) })
        : bizErrorMessage(error)
    },
    onFinally: () => {
      submitting.value = false
    },
  })
  emit('submitted')
}

defineExpose({ submit, submitting, canSubmit })
</script>

<template>
  <div class="w-manual-pickup">
    <div v-if="contactText" class="w-manual-pickup__contact">
      <span class="w-faint">{{ t('shipping.pickup.contact') }}</span>
      <a v-if="contactIsUrl" :href="contactText" target="_blank" rel="noopener" class="w-manual-pickup__link">
        {{ contactText }}<WIcon name="external" :size="12" />
      </a>
      <span v-else>{{ contactText }}</span>
    </div>

    <div v-if="selectable" class="w-manual-pickup__ships">
      <WCheckbox v-for="row in shipments" :key="row.shipment_id" v-model="chosen" :value="row.shipment_id" :disabled="submitting">
        <span>{{ row.tracking_number || '—' }}</span>
        <span v-if="row.dn_id || row.order_number" class="w-faint">
          · {{ row.order_number || `DN-${row.dn_id}` }}
          <template v-if="row.package_count !== null && row.package_count !== undefined">
            · {{ t('delivery.pickup.fields.packages-value', { count: row.package_count, weight: formatPickupWeight(row.weight_kg) }) }}
          </template>
        </span>
      </WCheckbox>
    </div>
    <div v-else-if="shipments.length" class="w-manual-pickup__ship">
      {{ t('delivery.pickup.fields.tracking-number') }} {{ shipments.map((r) => r.tracking_number || '—').join(', ') }}
    </div>

    <WFormGrid>
      <WField :label="t('delivery.pickup.modal.date')" :span="4">
        <WDatePicker v-model="form.pickup_date" :min="minDate" weekday :disabled="submitting" />
      </WField>
      <WField :label="t('delivery.pickup.form.ready-time')" :span="4" :error="timeProblem === 'ready-time' ? timeProblemText : null">
        <WInput v-model="form.ready_time" type="time" :suffix="zoneDiffers ? zoneAbbr : undefined" :disabled="submitting" />
      </WField>
      <WField :label="t('delivery.pickup.form.close-time')" :span="4" :error="timeProblem && timeProblem !== 'ready-time' ? timeProblemText : null">
        <WInput v-model="form.close_time" type="time" :suffix="zoneDiffers ? zoneAbbr : undefined" :disabled="submitting" />
      </WField>
      <WField :label="t('shipping.pickup.confirmation-code')" optional :span="4" :help="t('shipping.pickup.confirmation-code-hint')">
        <WInput v-model="form.confirmation_code" maxlength="50" :disabled="submitting" />
      </WField>
      <WField :label="t('shipping.pickup.remarks')" optional :span="8">
        <WInput v-model="form.remarks" maxlength="200" :disabled="submitting" />
      </WField>
    </WFormGrid>
    <span v-if="zoneDiffers" class="w-manual-pickup__hint">{{ t('timezone.input-hint', { zone: zoneDescription }) }}</span>
    <WAlert v-if="failure" tone="block" :title="failure" />
  </div>
</template>

<style scoped>
.w-manual-pickup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-manual-pickup__contact { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.w-manual-pickup__link { display: inline-flex; align-items: center; gap: 4px; color: var(--w-link); text-decoration: none; overflow-wrap: anywhere; }
.w-manual-pickup__ships { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; }
.w-manual-pickup__ships :deep(.w-check__label) { font-size: var(--w-fs-13); }
.w-manual-pickup__hint { font-size: var(--w-fs-12); color: var(--w-text-3); }
</style>
