<script lang="ts" setup>
/**
 * 预约上门揽收的表单（设计稿 DeliveryPrint「预约揽收」）：发货流程「揽收」一步里直接展开（inline），
 * 揽收页经 CarrierPickupModal 放在弹窗里。逻辑原来在 CarrierPickupModal 里，搬到这里两边共用。
 *
 * active 变成 true 时从头来：默认勾选、表单、向承运商查可约日期与可选时间（下拉），默认用承运商给的默认时间；
 * 没查到就让人自己填，承运商会再核对。揽收日按卡片选（今天 / 明天 / 周几 · 可约至截止时间）。
 * selectable：列出 shipments 让人勾选这次带哪些（发货单：本单默认勾上，同仓库其它等揽收的运单可以一起带）；
 * 不传时 shipments 全部带上（揽收页：表格里已经选好了）。
 * submit()：确认框 → POST carrier-pickups；成功 emit booked、失败在表单里显示原因（承运商原文、交易号）；
 * 不论成败都 emit submitted（预约记录可能落成 failed / unknown，运单可能被别人约了），父组件据此刷新。
 */
import { warehouseHeaders } from '~/utils/http'
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_READY_TIME,
  PICKUPS_URL,
  PICKUP_EMAIL_STORAGE_KEY,
  describePickupFailure,
  formatPickupAddress,
  formatPickupWeight,
  pickupTimeProblem,
  type CarrierPickup,
  type PickupAvailability,
  type PickupFailure,
  type PickupLocation,
  type PickupOption,
  type PickupShipmentRow,
} from '~/composables/customs/carrierPickup'
import type { WSelectOption } from '~/components/w/WSelect.vue'

const props = withDefaults(defineProps<{
  /** 变成 true 时初始化（弹窗打开 / 在流程里展开） */
  active: boolean
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
  /** 表单顶部的补充说明（如「今天已经约过一次」） */
  note?: string | null
  /** 放在弹窗里（运单列表一栏、字段一栏上下排） */
  compact?: boolean
}>(), {
  warehouseId: null,
  selectable: false,
  initialSelected: null,
  location: null,
  maxRemarks: null,
  today: null,
  note: null,
  compact: false,
})

const emit = defineEmits<{
  (e: 'booked', pickup: CarrierPickup): void
  (e: 'submitted'): void
}>()

const { t, te, locale } = useI18n()
const { bizErrorMessage } = useBizError()
/** 揽收日、时间段都是仓库当地的：与浏览器时区不同时在时间旁标出（warehouseId 的仓库 → 上层 provideTimeZone → 页头） */
const { differs: zoneDiffers, description: zoneDescription, abbr: zoneAbbr } = useTimeZone(() => props.warehouseId)
const uid = useId()

const headers = computed(() => ({ 'Content-Type': 'application/json', ...warehouseHeaders(props.warehouseId) }))
const carrierQuery = () => (props.carrierId ? `?carrier_id=${props.carrierId}` : '')

const chosen = ref<number[]>([])
const chosenRows = computed(() => props.shipments.filter((r: PickupShipmentRow) => chosen.value.includes(r.shipment_id)))
const chosenPackages = computed(() => chosenRows.value.reduce((sum: number, r: PickupShipmentRow) => sum + (Number(r.package_count) || 0), 0))
const chosenWeight = computed(() =>
  formatPickupWeight(chosenRows.value.reduce((sum: number, r: PickupShipmentRow) => sum + (Number(r.weight_kg) || 0), 0)))

const availability = ref<PickupAvailability | null>(null)
const availabilityLoading = ref(false)
const availabilityError = ref<string | null>(null)
const submitting = ref(false)
const failure = ref<PickupFailure | null>(null)
const form = reactive({
  pickup_date: '',
  ready_time: DEFAULT_READY_TIME,
  close_time: DEFAULT_CLOSE_TIME,
  remarks: '',
  notification_email: '',
})

const availableOptions = computed(() => (availability.value?.options || []).filter((o: PickupOption) => o.available))
const currentOption = computed(() => availableOptions.value.find((o: PickupOption) => o.pickup_date === form.pickup_date) || null)
const readyChoices = computed<WSelectOption<string>[]>(() => (currentOption.value?.ready_times || []).map((v) => ({ value: v, label: v })))
const closeChoices = computed<WSelectOption<string>[]>(() => (currentOption.value?.latest_times || []).map((v) => ({ value: v, label: v })))
const timeProblem = computed(() => pickupTimeProblem(currentOption.value, form.ready_time, form.close_time))
const timeProblemText = computed(() => {
  if (!timeProblem.value) return ''
  return t(`delivery.pickup.validation.${timeProblem.value}`, {
    cutoff: currentOption.value?.cutoff_time || '—',
    minutes: currentOption.value?.access_minutes ?? '—',
  })
})
const limitsText = computed(() => (currentOption.value?.cutoff_time || currentOption.value?.access_minutes
  ? t('delivery.pickup.modal.limits', { cutoff: currentOption.value?.cutoff_time || '—', minutes: currentOption.value?.access_minutes ?? '—' })
  : ''))
const remarksMax = computed(() => props.maxRemarks || 60)

const pick = (choices: string[], preferred: string | null | undefined, fallback: string): string => {
  if (!choices.length) return preferred || fallback
  if (preferred && choices.includes(preferred)) return preferred
  return choices.includes(fallback) ? fallback : (choices[0] as string)
}

const applyOption = () => {
  const option = currentOption.value
  if (!option) return
  form.ready_time = pick(option.ready_times, option.default_ready_time, DEFAULT_READY_TIME)
  form.close_time = pick(option.latest_times, option.default_latest_time, DEFAULT_CLOSE_TIME)
}
watch(() => form.pickup_date, applyOption)

/** 揽收日卡片的标题：今天 10/25 / 明天 10/26 / 10/27 周二 */
const dayLabel = (value: string): string => {
  const today = availability.value?.today || props.today || ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  const md = `${m[2]}/${m[3]}`
  if (value === today) return t('delivery.pickup.form.today', { date: md })
  const tomorrow = today ? new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1))
    .toISOString().slice(0, 10) : ''
  if (value === tomorrow) return t('delivery.pickup.form.tomorrow', { date: md })
  let weekday = ''
  try {
    weekday = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))))
  } catch {
    weekday = ''
  }
  return `${md} ${weekday}`.trim()
}
const daySub = (option: PickupOption): string => (option.cutoff_time
  ? t('delivery.pickup.form.until', { time: option.cutoff_time })
  : t('delivery.pickup.form.available'))

const loadEmail = (): string => {
  try {
    return localStorage.getItem(PICKUP_EMAIL_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}
const saveEmail = (value: string) => {
  try {
    if (value) localStorage.setItem(PICKUP_EMAIL_STORAGE_KEY, value)
  } catch {
    // 存不了就算了
  }
}

const loadAvailability = async () => {
  availabilityLoading.value = true
  await httpRequest<PickupAvailability>(`${PICKUPS_URL}/availability${carrierQuery()}`, {
    headers: headers.value,
    onSuccess: (data: PickupAvailability) => {
      availability.value = data
      const first = (data.options || []).find((o: PickupOption) => o.available)
      if (first) {
        form.pickup_date = first.pickup_date
        applyOption()
      }
    },
    onError: (error) => {
      availabilityError.value = describePickupFailure(error, props.carrierName, t, bizErrorMessage, te).summary
    },
    onFinally: () => {
      availabilityLoading.value = false
    },
  })
}

// 每次打开都从头来：默认勾选、表单、可约时间
watch(() => props.active, (active: boolean) => {
  if (!active) return
  chosen.value = props.initialSelected ? [...props.initialSelected] : props.shipments.map((r: PickupShipmentRow) => r.shipment_id)
  failure.value = null
  availability.value = null
  availabilityError.value = null
  form.pickup_date = props.today || ''
  form.ready_time = DEFAULT_READY_TIME
  form.close_time = DEFAULT_CLOSE_TIME
  form.remarks = ''
  form.notification_email = loadEmail()
  loadAvailability()
}, { immediate: true })

const canSubmit = computed(() => !submitting.value && !availabilityLoading.value && !timeProblem.value
  && !!form.pickup_date && chosen.value.length > 0)
/** 提交按钮上的说明：2 票 · 今天 13:00–17:00 */
const submitSummary = computed(() => t('delivery.pickup.form.submit-summary', {
  count: chosen.value.length,
  day: form.pickup_date ? dayLabel(form.pickup_date).split(' ')[0] : '—',
  window: `${form.ready_time}–${form.close_time}`,
}))

const submit = async () => {
  if (!canSubmit.value) return
  const confirmed = await wConfirm({
    title: t('delivery.pickup.confirm-title'),
    message: t('delivery.pickup.confirm', {
      date: form.pickup_date,
      window: `${form.ready_time}–${form.close_time}`,
      count: chosen.value.length,
      packages: chosenPackages.value,
      weight: chosenWeight.value,
    }),
    confirmText: t('delivery.pickup.modal.submit'),
    cancelText: t('button.cancel'),
  })
  if (!confirmed) return
  submitting.value = true
  failure.value = null
  const email = form.notification_email.trim()
  await httpRequest<{ pickup: CarrierPickup }>(PICKUPS_URL, {
    method: 'POST',
    headers: headers.value,
    body: {
      carrier_id: props.carrierId,
      shipment_ids: chosen.value,
      pickup_date: form.pickup_date,
      ready_time: form.ready_time,
      close_time: form.close_time,
      remarks: form.remarks.trim() || null,
      notification_email: email || null,
    },
    onSuccess: (data: { pickup: CarrierPickup }) => {
      saveEmail(email)
      showToast(t('delivery.pickup.scheduled-toast', { code: data?.pickup?.confirmation_code || '—' }), 'success')
      emit('booked', data?.pickup)
    },
    onError: (error) => {
      failure.value = describePickupFailure(error, props.carrierName, t, bizErrorMessage, te)
    },
    onFinally: () => {
      submitting.value = false
    },
  })
  emit('submitted')
}

defineExpose({ submit, submitting, canSubmit, submitSummary })
</script>

<template>
  <div class="w-pickup-form" :class="{ 'is-compact': compact || !selectable }">
    <WAlert v-if="note" tone="info">{{ note }}</WAlert>

    <div class="w-pickup-form__grid">
      <div class="w-pickup-form__fields">
        <!-- 揽收日：承运商给了可约日期时用卡片选，没有时自己填 -->
        <div class="w-pickup-form__field" role="radiogroup" :aria-labelledby="`${uid}-date`">
          <span :id="`${uid}-date`" class="w-pickup-form__label">{{ t('delivery.pickup.modal.date') }}</span>
          <div v-if="availableOptions.length" class="w-pickup-form__days">
            <button v-for="o in availableOptions" :key="o.pickup_date" type="button" role="radio" class="w-pickup-form__day"
              :class="{ 'is-active': o.pickup_date === form.pickup_date }" :aria-checked="o.pickup_date === form.pickup_date"
              :disabled="submitting" @click="form.pickup_date = o.pickup_date">
              <span class="w-pickup-form__day-title">{{ dayLabel(o.pickup_date) }}</span>
              <span class="w-pickup-form__day-sub">{{ daySub(o) }}</span>
            </button>
          </div>
          <WDatePicker v-else v-model="form.pickup_date" :min="today || undefined" weekday :disabled="submitting || availabilityLoading"
            class="w-pickup-form__date" :aria-labelledby="`${uid}-date`" />
          <span v-if="availabilityLoading" class="w-pickup-form__hint">{{ t('delivery.pickup.modal.loading-availability', { carrier: carrierName }) }}</span>
          <span v-else-if="availabilityError" class="w-pickup-form__hint is-warn">
            {{ t('delivery.pickup.modal.availability-failed', { message: availabilityError, carrier: carrierName }) }}
          </span>
          <span v-else-if="availability && !availableOptions.length" class="w-pickup-form__hint is-warn">
            {{ t('delivery.pickup.modal.no-options', { carrier: carrierName }) }}
          </span>
        </div>

        <WFormGrid>
          <WField :label="t('delivery.pickup.form.ready-time')" :span="6" :error="timeProblem === 'ready-time' || timeProblem === 'after-cutoff' ? timeProblemText : null">
            <WSelect v-if="readyChoices.length" v-model="form.ready_time" :options="readyChoices" :disabled="submitting" />
            <WInput v-else v-model="form.ready_time" type="time" :suffix="zoneDiffers ? zoneAbbr : undefined" :disabled="submitting" />
          </WField>
          <WField :label="t('delivery.pickup.form.close-time')" :span="6"
            :error="timeProblem && timeProblem !== 'ready-time' && timeProblem !== 'after-cutoff' ? timeProblemText : null">
            <WSelect v-if="closeChoices.length" v-model="form.close_time" :options="closeChoices" :disabled="submitting" />
            <WInput v-else v-model="form.close_time" type="time" :suffix="zoneDiffers ? zoneAbbr : undefined" :disabled="submitting" />
          </WField>
        </WFormGrid>
        <span v-if="limitsText || zoneDiffers" class="w-pickup-form__hint">
          {{ [limitsText, zoneDiffers ? t('timezone.input-hint', { zone: zoneDescription }) : ''].filter(Boolean).join(' · ') }}
        </span>

        <WFormGrid>
          <WField :label="t('delivery.pickup.form.remarks')" optional :span="7" :help="t('delivery.pickup.modal.remarks-hint', { max: remarksMax })">
            <WInput v-model="form.remarks" :maxlength="remarksMax" :placeholder="t('delivery.pickup.modal.remarks-placeholder')" :disabled="submitting" />
          </WField>
          <WField :label="t('delivery.pickup.modal.email')" optional :span="5" :help="t('delivery.pickup.modal.email-hint', { carrier: carrierName })">
            <WInput v-model="form.notification_email" type="email" maxlength="80" autocomplete="email" :disabled="submitting" />
          </WField>
        </WFormGrid>
        <span v-if="formatPickupAddress(location)" class="w-pickup-form__hint">
          {{ t('delivery.pickup.form.address', { address: formatPickupAddress(location) }) }}
        </span>
      </div>

      <!-- 同批预约：同仓库其它等揽收的运单可以一起带 -->
      <div class="w-pickup-form__batch">
        <div class="w-pickup-form__batch-head">
          <span class="w-pickup-form__batch-title">{{ t('delivery.pickup.form.batch') }}</span>
          <span class="w-faint">{{ carrierName }}</span>
        </div>
        <template v-if="selectable">
          <WCheckbox v-for="(row, i) in shipments" :key="row.shipment_id" v-model="chosen" :value="row.shipment_id"
            class="w-pickup-form__ship" :disabled="submitting">
            <span class="w-pickup-form__ship-main">
              {{ row.order_number || `DN-${row.dn_id}` }}
              <span v-if="i === 0 && initialSelected?.includes(row.shipment_id)" class="w-faint">· {{ t('delivery.pickup.modal.this-one') }}</span>
            </span>
            <span class="w-pickup-form__ship-sub">
              {{ row.tracking_number || '' }} · {{ t('delivery.pickup.fields.packages-value', { count: row.package_count, weight: formatPickupWeight(row.weight_kg) }) }}
            </span>
          </WCheckbox>
        </template>
        <ul v-else class="w-pickup-form__list">
          <li v-for="row in shipments" :key="row.shipment_id">{{ row.tracking_number || '—' }} · {{ row.order_number || `DN-${row.dn_id}` }}</li>
        </ul>
        <div class="w-pickup-form__total">
          {{ t('delivery.pickup.modal.summary', { count: chosen.length, packages: chosenPackages, weight: chosenWeight }) }}
        </div>
        <slot name="batch-footer" />
      </div>
    </div>

    <WAlert v-if="failure" tone="block" :title="failure.summary">
      <template v-if="failure.errors.length || failure.transactionId">
        <span v-for="(e, i) in failure.errors" :key="`me-${i}`" class="w-pickup-form__err">{{ e.code ? `${e.code} ` : '' }}{{ e.message }}</span>
        <span v-if="failure.transactionId" class="w-pickup-form__err">
          {{ t('delivery.pickup.tips.transaction-id', { carrier: carrierName }) }}: {{ failure.transactionId }}
        </span>
      </template>
    </WAlert>
  </div>
</template>

<style scoped>
.w-pickup-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: var(--w-font);
  color: var(--w-text-1);
}
.w-pickup-form__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 360px);
  gap: 16px 24px;
  align-items: start;
}
.w-pickup-form.is-compact .w-pickup-form__grid { grid-template-columns: minmax(0, 1fr); }
.w-pickup-form__fields { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.w-pickup-form__field { display: flex; flex-direction: column; gap: 4px; }
.w-pickup-form__label {
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  font-weight: var(--w-fw-medium);
}
.w-pickup-form__days { display: flex; flex-wrap: wrap; gap: 8px; }
.w-pickup-form__day {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 108px;
  padding: 7px 12px;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-1);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.w-pickup-form__day:hover:not(:disabled) { border-color: var(--w-sel); }
.w-pickup-form__day.is-active { border-color: var(--w-sel); box-shadow: inset 0 0 0 1px var(--w-sel); background: var(--w-sel-soft); }
.w-pickup-form__day:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-pickup-form__day-title { font-size: var(--w-fs-14); line-height: var(--w-lh-14); font-weight: var(--w-fw-semibold); }
.w-pickup-form__day-sub { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-pickup-form__date { max-width: 240px; }
.w-pickup-form__hint { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-pickup-form__hint.is-warn { color: var(--w-warn-text); }

.w-pickup-form__batch {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
}
.w-pickup-form__batch-head { display: flex; align-items: baseline; gap: 8px; font-size: var(--w-fs-13); }
.w-pickup-form__batch-title { font-weight: var(--w-fw-semibold); }
.w-pickup-form__ship { align-items: flex-start; }
.w-pickup-form__ship :deep(.w-check__label) { display: flex; flex-direction: column; font-size: var(--w-fs-13); line-height: var(--w-lh-13); }
.w-pickup-form__ship-sub { font-size: var(--w-fs-12); color: var(--w-text-3); }
.w-pickup-form__list { margin: 0; padding: 0; list-style: none; font-size: var(--w-fs-13); }
.w-pickup-form__total {
  padding-top: 8px;
  border-top: 1px solid var(--w-line);
  font-size: var(--w-fs-12);
  color: var(--w-text-2);
}
.w-pickup-form__err { display: block; font-size: var(--w-fs-12); overflow-wrap: anywhere; }
@media (max-width: 767.98px) {
  .w-pickup-form__grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
