<script lang="ts" setup>
/**
 * 承运商的对接方式（承运商编辑页，随承运商资料一起保存：PUT /carrier/<id>）。
 * 每项能力各自选方式，没有 API 合同也能完整走流程（后端 doc/shipping-flow.md §2）：
 * - 运单 waybill_method：api（在线对接建单）/ file（按承运商软件的格式导出 CSV、导回运单号：选预设、填账号项，
 *   见 CarrierFileSettings）/ manual（手填 / 扫码运单号）
 * - 揽收 pickup_method：api（在线预约）/ manual（电话 / 网站约好后记一笔，显示约揽收的联系方式 pickup_contact）/
 *   scheduled（定期集荷：pickup_schedule 星期 + 时间段）/ dropoff（自送网点）/ none（不管揽收）
 * - 跟踪 tracking_method：api（定时查，揽收后自动交承运商、送达后自动签收）/ link（只给公开查询页）/ none
 * - 公开查询页 tracking_url_template（{tracking_number} 占位；空 = 用插件内置的）
 * - 自动视为签收 auto_sign_days（1–90，空 = 关）：交承运商 N 天后还没签收、且运单没有 API 跟踪时按规则签收
 * 可选的方式按后端的 available_methods（api 要在线对接已启用、插件支持）；file 要有预设或模板，所以后端支持文件方式
 * （有预设接口）时总是列出，和预设一起保存。不合法时后端 400 16135（field 指明哪一项）。
 */
import { ISO_WEEKDAYS, isTimeText, type PickupSchedule } from '~/composables/shipping/shippingFlow'
import { loadFilePresets, type CarrierFilePreset } from '~/composables/shipping/carrierFile'

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
// 文件方式的预设（GET /carrier/file-presets；旧后端没有 → null，不列文件方式）
const filePresets = ref<CarrierFilePreset[] | null>(null)
onMounted(async () => {
  filePresets.value = await loadFilePresets()
})
const fileRef = ref<{ validate: (active: boolean) => boolean; payload: () => Record<string, any> } | null>(null)
const pluginTemplate = computed(() => {
  const adapter = carrier.value?.integration?.adapter
  return (adapter && plugins.value.find((p: PluginInfo) => p.code === adapter)?.tracking_url_template) || ''
})

const WAYBILL_ORDER = ['api', 'file', 'manual']
/** 文件方式能选：后端有预设接口（file 和预设一起保存，不看 available_methods） */
const fileSupported = computed(() => filePresets.value !== null)
/** 现在能选的方式；当前值不在里面（如对接停用后还是 api）时也列出来，免得画面上看不到 */
const optionsOf = (kind: Kind): string[] => {
  const available = carrier.value?.available_methods?.[kind]
  const list: string[] = Array.isArray(available) && available.length ? [...available] : [DEFAULTS[kind]]
  if (kind === 'waybill' && fileSupported.value && !list.includes('file')) {
    list.push('file')
    list.sort((a, b) => WAYBILL_ORDER.indexOf(a) - WAYBILL_ORDER.indexOf(b))
  }
  if(!list.includes('api'))list.unshift('api')
  const current = carrier.value?.[FIELD[kind]]
  if (current && !list.includes(current)) list.unshift(current)
  return list
}
const unavailable = (kind: Kind, value: string): boolean => {
  if (kind === 'waybill' && value === 'file' && fileSupported.value) return false
  const available = carrier.value?.available_methods?.[kind]
  return Array.isArray(available) && !available.includes(value)
}
const apiUnavailable = (kind: Kind): boolean => unavailable(kind,'api')
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
  const fileValid = fileRef.value ? fileRef.value.validate(methodOf('waybill') === 'file') : true
  return Object.keys(errs).length === 0 && fileValid
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
    // 文件设置：不是文件方式时也照原样带上（切回来不用重填）；旧后端没有预设接口时不带
    ...(fileRef.value ? fileRef.value.payload() : {}),
  }
}

defineExpose({ validate, payload })
</script>

<template>
 <div class="w-carrier-methods">
  <WFormSection v-for="kind in KINDS" :key="kind" :title="t(`carrier.methods.${kind}`)"><div class="w-method-body"><div class="w-method-options"><label v-for="value in optionsOf(kind)" :key="value" class="w-method-option" :class="{'is-selected':methodOf(kind)===value,'is-disabled':unavailable(kind,value)||!editable}"><input type="radio" :name="'carrier-method-'+kind" :value="value" :checked="methodOf(kind)===value" :disabled="!editable||unavailable(kind,value)" @change="setMethod(kind,value)" /><span><strong>{{optionText(kind,value)}}</strong><small>{{helpText(kind,value)}}</small></span></label></div><WAlert v-if="errorOf(FIELD[kind])" tone="block" :title="errorOf(FIELD[kind])" />
   <p v-if="apiUnavailable(kind)" class="w-method-hint">{{t('carrier.methods.api-unavailable')}}</p>
   <template v-if="kind==='waybill'&&methodOf(kind)==='file'&&filePresets"><CarrierFileSettings :ref="(el:any)=>{fileRef=el}" v-model="carrier" :presets="filePresets" :editable="editable" :server-errors="serverErrors" /></template>
   <div v-if="kind==='pickup'&&methodOf(kind)==='scheduled'" class="w-method-schedule"><div class="w-method-days"><WButton v-for="day in ISO_WEEKDAYS" :key="day" type="button" :disabled="!editable" :variant="schedule.weekdays?.includes(day)?'primary':'secondary'" :aria-pressed="schedule.weekdays?.includes(day)" @click="toggleWeekday(day)">{{t(`shipping.weekdays.${day}`)}}</WButton></div><WFormGrid><WField :span="6" :label="t('delivery.pickup.modal.ready-time')"><WInput type="time" :disabled="!editable" :model-value="schedule.ready_time||''" @update:model-value="value=>setScheduleTime('ready_time',String(value||''))" /></WField><WField :span="6" :label="t('delivery.pickup.modal.close-time')"><WInput type="time" :disabled="!editable" :model-value="schedule.close_time||''" @update:model-value="value=>setScheduleTime('close_time',String(value||''))" /></WField></WFormGrid><p class="w-method-hint">{{t('timezone.warehouse-local-hint')}}</p><WAlert v-if="errorOf('pickup_schedule')" tone="block" :title="errorOf('pickup_schedule')" /></div>
   <WField v-if="kind==='pickup'&&methodOf(kind)==='manual'" :label="t('carrier.methods.pickup-contact')" :error="errorOf('pickup_contact')"><WInput v-model="carrier.pickup_contact" maxlength="255" :placeholder="t('carrier.methods.pickup-contact-placeholder')" :disabled="!editable" /></WField>
   <WField v-if="kind==='tracking'" :label="t('carrier.methods.tracking-url')" :error="errorOf('tracking_url_template')" :hint="t('carrier.methods.tracking-url-hint',{placeholder:TRACKING_PLACEHOLDER})" optional><WInput v-model="carrier.tracking_url_template" type="url" maxlength="500" :disabled="!editable" :placeholder="pluginTemplate||'https://example.com/track?number={tracking_number}'" /></WField>
  </div></WFormSection>
  <WFormSection :title="t('carrier.methods.auto-sign')"><WFormGrid><WField :span="6" :label="t('carrier.methods.auto-sign')" :hint="t('carrier.methods.auto-sign-help')" :error="errorOf('auto_sign_days')" optional><WInput v-model="carrier.auto_sign_days" type="number" min="1" max="90" step="1" :disabled="!editable" :placeholder="t('carrier.methods.auto-sign-off')" :suffix="t('carrier.methods.days')" /></WField></WFormGrid></WFormSection>
 </div>
</template>
<style scoped>
.w-carrier-methods{border-top:1px solid var(--w-line)}.w-method-body{display:flex;flex-direction:column;gap:16px}.w-method-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.w-method-option{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--w-border);border-radius:8px;padding:14px 12px;cursor:pointer}.w-method-option input{margin:3px 0 0;width:16px;height:16px;flex:none;accent-color:var(--w-pri)}.w-method-option strong{display:block;font-size:14px;line-height:20px;font-weight:500}.w-method-option small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.w-method-option.is-selected{border-color:#5F1FE6;background:#F5F4FF}.w-method-option.is-disabled{opacity:.6;cursor:default}.w-method-hint{font-size:12px;line-height:18px;color:var(--w-text-3);margin:0}.w-method-days{display:flex;flex-wrap:wrap;gap:8px}.w-method-schedule{display:flex;flex-direction:column;gap:12px}
</style>
