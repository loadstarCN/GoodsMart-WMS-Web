<script lang="ts" setup>
/**
 * 承运商的对接方式（承运商编辑页，随承运商资料一起保存：PUT /carrier/<id>）。
 * 每项能力各自选方式，没有 API 合同也能完整走流程（后端 doc/shipping-flow.md §2）：
 * - 运单 waybill_method：api（在线对接建单）/ manual（手填 / 扫码运单号）；file（文件导出导入）是第二期
 * - 揽收 pickup_method：api（在线预约）/ manual（电话 / 网站约好后记一笔，显示约揽收的联系方式 pickup_contact）/
 *   scheduled（定期集荷：pickup_schedule 星期 + 时间段）/ dropoff（自送网点）/ none（不管揽收）
 * - 跟踪 tracking_method：api（定时查，揽收后自动交承运商、送达后自动签收）/ link（只给公开查询页）/ none
 * - 公开查询页 tracking_url_template（{tracking_number} 占位；空 = 用插件内置的）
 * - 自动视为签收 auto_sign_days（1–90，空 = 关）：交承运商 N 天后还没签收、且运单没有 API 跟踪时按规则签收
 * 可选的方式按后端的 available_methods（api 要在线对接已启用、插件支持）。不合法时后端 400 16135（field 指明哪一项）。
 */
import { ISO_WEEKDAYS, isTimeText, type PickupSchedule } from '~/composables/shipping/shippingFlow'

const carrier = defineModel<Record<string, any>>({ required: true })

const props = withDefaults(defineProps<{
  editable?: boolean
  /** 保存时后端给的字段错误：{field: message}（field 如 pickup_schedule.weekdays） */
  serverErrors?: Record<string, string>
}>(), {
  editable: true,
  serverErrors: () => ({}),
})

const { t, te } = useI18n()

const TRACKING_PLACEHOLDER = '{tracking_number}'
const DEFAULTS = { waybill: 'manual', pickup: 'none', tracking: 'link' } as const
const KINDS = ['waybill', 'pickup', 'tracking'] as const
type Kind = typeof KINDS[number]
const FIELD: Record<Kind, string> = { waybill: 'waybill_method', pickup: 'pickup_method', tracking: 'tracking_method' }

// 插件内置的公开查询页（对接插件声明的 tracking_url_template）
interface PluginInfo { code: string; tracking_url_template?: string | null }
const plugins = ref<PluginInfo[]>([])
onMounted(async () => {
  await httpRequest<PluginInfo[]>('/api/warehouse/carrier/integrations', {
    method: 'GET',
    onSuccess: (data) => {
      plugins.value = Array.isArray(data) ? data : []
    },
  })
})
const pluginTemplate = computed(() => {
  const adapter = carrier.value?.integration?.adapter
  return (adapter && plugins.value.find((p: PluginInfo) => p.code === adapter)?.tracking_url_template) || ''
})

/** 现在能选的方式；当前值不在里面（如对接停用后还是 api）时也列出来，免得画面上看不到 */
const optionsOf = (kind: Kind): string[] => {
  const available = carrier.value?.available_methods?.[kind]
  const list: string[] = Array.isArray(available) && available.length ? [...available] : [DEFAULTS[kind]]
  const current = carrier.value?.[FIELD[kind]]
  if (current && !list.includes(current)) list.unshift(current)
  return list
}
const unavailable = (kind: Kind, value: string): boolean => {
  const available = carrier.value?.available_methods?.[kind]
  return Array.isArray(available) && !available.includes(value)
}
const apiUnavailable = (kind: Kind): boolean => !optionsOf(kind).includes('api')
/** 三项都不能选 api（没有启用的在线对接）：说明只写一次 */
const noApiAtAll = computed(() => KINDS.every((kind) => apiUnavailable(kind)))
const optionText = (kind: Kind, value: string) => {
  const key = `carrier.methods.options.${kind}.${value}`
  return te(key) ? t(key) : value
}
const helpText = (kind: Kind, value: string | null | undefined) => {
  const key = `carrier.methods.help.${kind}.${value}`
  return value && te(key) ? t(key) : ''
}
const methodOf = (kind: Kind): string => String(carrier.value?.[FIELD[kind]] || DEFAULTS[kind])
const setMethod = (kind: Kind, value: string) => {
  carrier.value[FIELD[kind]] = value
  if (kind === 'pickup' && value === 'scheduled' && !carrier.value.pickup_schedule) {
    carrier.value.pickup_schedule = { weekdays: [1, 2, 3, 4, 5], ready_time: '14:00', close_time: '17:00' }
  }
}

// ------------------ 定期集荷 ----------------------
const schedule = computed<PickupSchedule>(() => {
  const s = carrier.value?.pickup_schedule
  return s && typeof s === 'object' ? s : { weekdays: [], ready_time: '', close_time: '' }
})
const toggleWeekday = (day: number) => {
  const current = schedule.value.weekdays || []
  const weekdays = current.includes(day) ? current.filter((d: number) => d !== day) : [...current, day].sort((a, b) => a - b)
  carrier.value.pickup_schedule = { ...schedule.value, weekdays }
}
const setScheduleTime = (key: 'ready_time' | 'close_time', value: string) => {
  carrier.value.pickup_schedule = { ...schedule.value, [key]: value }
}

// ------------------ 校验 ----------------------
const localErrors = ref<Record<string, string>>({})
const errorOf = (field: string): string => {
  const own = localErrors.value[field]
  if (own) return own
  const hit = Object.entries(props.serverErrors || {}).find(([key]) => key === field || key.startsWith(`${field}.`))
  return hit ? hit[1] : ''
}

const validate = (): boolean => {
  const errs: Record<string, string> = {}
  if (methodOf('pickup') === 'scheduled') {
    const s = schedule.value
    if (!s.weekdays?.length) errs.pickup_schedule = t('carrier.methods.validation.weekdays')
    else if (!isTimeText(s.ready_time) || !isTimeText(s.close_time)) errs.pickup_schedule = t('carrier.methods.validation.times')
    else if (String(s.close_time) <= String(s.ready_time)) errs.pickup_schedule = t('carrier.methods.validation.close-before-ready')
  }
  const template = String(carrier.value?.tracking_url_template || '').trim()
  if (template && (!/^https?:\/\/\S+$/i.test(template) || !template.includes(TRACKING_PLACEHOLDER))) {
    errs.tracking_url_template = t('carrier.methods.validation.tracking-url', { placeholder: TRACKING_PLACEHOLDER })
  }
  const days = carrier.value?.auto_sign_days
  if (days !== null && days !== undefined && String(days).trim() !== '') {
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > 90) errs.auto_sign_days = t('carrier.methods.validation.auto-sign-days')
  }
  if (String(carrier.value?.pickup_contact || '').length > 255) errs.pickup_contact = t('carrier.methods.validation.contact')
  localErrors.value = errs
  return Object.keys(errs).length === 0
}

/** 要提交的对接方式字段（规范化：空 = null；不是定期集荷时不带时间表） */
const payload = (): Record<string, any> => {
  const days = carrier.value?.auto_sign_days
  const template = String(carrier.value?.tracking_url_template || '').trim()
  const contact = String(carrier.value?.pickup_contact || '').trim()
  return {
    waybill_method: methodOf('waybill'),
    pickup_method: methodOf('pickup'),
    pickup_schedule: methodOf('pickup') === 'scheduled' ? {
      weekdays: [...(schedule.value.weekdays || [])].sort((a, b) => a - b),
      ready_time: schedule.value.ready_time,
      close_time: schedule.value.close_time,
    } : null,
    pickup_contact: contact || null,
    tracking_method: methodOf('tracking'),
    tracking_url_template: template || null,
    auto_sign_days: days === null || days === undefined || String(days).trim() === '' ? null : Number(days),
  }
}

defineExpose({ validate, payload })
</script>

<template>
  <div class="card custom-card">
    <div class="card-header">
      <div class="card-title">{{ t('carrier.methods.title') }}</div>
    </div>
    <div class="card-body">
      <p class="fs-13 text-muted mb-1">{{ t('carrier.methods.intro') }}</p>
      <p class="fs-12 text-muted mb-3" v-if="noApiAtAll"><i class="ri-information-line me-1"></i>{{ t('carrier.methods.api-unavailable') }}</p>
      <div class="mb-3" v-else></div>

      <div class="row gy-4">
        <!-- 运单 / 揽收 / 跟踪 -->
        <div class="col-xl-4" v-for="kind in KINDS" :key="kind">
          <label class="form-label" :for="`carrier-method-${kind}`">{{ t(`carrier.methods.${kind}`) }}</label>
          <select class="form-select" :id="`carrier-method-${kind}`" :value="methodOf(kind)" :disabled="!editable"
            @change="setMethod(kind, ($event.target as HTMLSelectElement).value)">
            <option v-for="value in optionsOf(kind)" :key="value" :value="value" :disabled="unavailable(kind, value)">
              {{ optionText(kind, value) }}
            </option>
          </select>
          <div class="form-text">{{ helpText(kind, methodOf(kind)) }}</div>
          <div class="form-text text-muted" v-if="apiUnavailable(kind) && !noApiAtAll">{{ t('carrier.methods.api-unavailable') }}</div>
          <div class="invalid-feedback d-block" v-if="errorOf(FIELD[kind])">{{ errorOf(FIELD[kind]) }}</div>

          <!-- 定期集荷：星期 + 时间段 -->
          <div class="mt-3" v-if="kind === 'pickup' && methodOf('pickup') === 'scheduled'">
            <div class="form-label fs-13 mb-1">{{ t('carrier.methods.schedule-days') }}</div>
            <div class="d-flex flex-wrap gap-1">
              <button type="button" class="btn btn-sm" v-for="day in ISO_WEEKDAYS" :key="day" :disabled="!editable"
                :class="schedule.weekdays?.includes(day) ? 'btn-primary' : 'btn-outline-light text-default'"
                :aria-pressed="schedule.weekdays?.includes(day)" @click="toggleWeekday(day)">
                {{ t(`shipping.weekdays.${day}`) }}
              </button>
            </div>
            <div class="row g-2 mt-1">
              <div class="col-6">
                <label class="form-label fs-12 mb-1" for="carrier-schedule-ready">{{ t('delivery.pickup.modal.ready-time') }}</label>
                <input type="time" class="form-control form-control-sm" id="carrier-schedule-ready" :disabled="!editable"
                  :value="schedule.ready_time || ''" @input="setScheduleTime('ready_time', ($event.target as HTMLInputElement).value)">
              </div>
              <div class="col-6">
                <label class="form-label fs-12 mb-1" for="carrier-schedule-close">{{ t('delivery.pickup.modal.close-time') }}</label>
                <input type="time" class="form-control form-control-sm" id="carrier-schedule-close" :disabled="!editable"
                  :value="schedule.close_time || ''" @input="setScheduleTime('close_time', ($event.target as HTMLInputElement).value)">
              </div>
            </div>
            <div class="invalid-feedback d-block" v-if="errorOf('pickup_schedule')">{{ errorOf('pickup_schedule') }}</div>
          </div>

          <!-- 手工约揽收：联系方式 -->
          <div class="mt-3" v-if="kind === 'pickup' && methodOf('pickup') === 'manual'">
            <label class="form-label fs-13 mb-1" for="carrier-pickup-contact">{{ t('carrier.methods.pickup-contact') }}</label>
            <input type="text" class="form-control form-control-sm" id="carrier-pickup-contact" maxlength="255"
              :placeholder="t('carrier.methods.pickup-contact-placeholder')" :disabled="!editable"
              v-model="carrier.pickup_contact">
            <div class="invalid-feedback d-block" v-if="errorOf('pickup_contact')">{{ errorOf('pickup_contact') }}</div>
          </div>
        </div>

        <!-- 公开查询页 -->
        <div class="col-xl-8">
          <label class="form-label" for="carrier-tracking-url">{{ t('carrier.methods.tracking-url') }}</label>
          <input type="url" class="form-control font-monospace" id="carrier-tracking-url" maxlength="500" :disabled="!editable"
            :placeholder="pluginTemplate || 'https://example.com/track?number={tracking_number}'" v-model="carrier.tracking_url_template">
          <div class="form-text">{{ t('carrier.methods.tracking-url-hint', { placeholder: TRACKING_PLACEHOLDER }) }}</div>
          <div class="form-text" v-if="pluginTemplate">
            {{ t('carrier.methods.tracking-url-plugin') }} <span class="font-monospace text-break">{{ pluginTemplate }}</span>
          </div>
          <div class="invalid-feedback d-block" v-if="errorOf('tracking_url_template')">{{ errorOf('tracking_url_template') }}</div>
        </div>

        <!-- 自动视为签收 -->
        <div class="col-xl-4">
          <label class="form-label" for="carrier-auto-sign">{{ t('carrier.methods.auto-sign') }}</label>
          <div class="input-group">
            <input type="number" class="form-control" id="carrier-auto-sign" min="1" max="90" step="1" :disabled="!editable"
              :placeholder="t('carrier.methods.auto-sign-off')" v-model="carrier.auto_sign_days">
            <span class="input-group-text">{{ t('carrier.methods.days') }}</span>
          </div>
          <div class="form-text">{{ t('carrier.methods.auto-sign-help') }}</div>
          <div class="invalid-feedback d-block" v-if="errorOf('auto_sign_days')">{{ errorOf('auto_sign_days') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
