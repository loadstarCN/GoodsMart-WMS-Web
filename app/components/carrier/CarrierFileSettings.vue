<script lang="ts" setup>
/**
 * 承运商的文件方式设置（对接方式卡里，运单方式选「文件导出 / 导入」时显示；随承运商资料一起保存：PUT /carrier/<id>）。
 * 后端 doc/shipping-flow.md §6.1：
 * - file_preset：预设代码（GET /carrier/file-presets；按国家分组；version 是依据的规格文档说明（一句话，不是版本号）；
 *   verified = false 的预设还没在承运商软件里实测导入过）
 * - file_account：预设 account_fields 声明的账号项（如ヤマト的請求先顧客コード）
 * - file_template：在预设基础上改的部分（JSON，高级；为空 = 完全用预设）
 * - 预设带的公开查询页（tracking_url_template）可以一键填进承运商的查询页模板
 * waybill_method = file 要求有预设或模板。保存不合法时后端 400 16135（field 如 file_preset / file_account.<key> / file_template）。
 */
import { countryName } from '~/data/countries'
import { localizedText, type CarrierFilePreset } from '~/composables/shipping/carrierFile'

const carrier = defineModel<Record<string, any>>({ required: true })

const props = withDefaults(defineProps<{
  presets: CarrierFilePreset[]
  editable?: boolean
  /** 保存时后端给的字段错误：{field: message} */
  serverErrors?: Record<string, string>
}>(), {
  editable: true,
  serverErrors: () => ({}),
})

const { t, locale, localeProperties } = useI18n()
const iso = computed(() => String(localeProperties.value?.iso || 'en-US'))
const text = (value: any) => localizedText(value, iso.value)

// ------------------ 预设 ----------------------
const preset = computed<CarrierFilePreset | null>(() =>
  props.presets.find((p: CarrierFilePreset) => p.code === carrier.value?.file_preset) || null)
/** 保存的预设代码在清单里没有（预设被删了 / 改名了） */
const presetMissing = computed(() => !!carrier.value?.file_preset && !preset.value)

/** 按国家分组（国家名按界面语言），没有国家的放最后 */
const presetGroups = computed(() => {
  const groups: Record<string, CarrierFilePreset[]> = {}
  for (const p of props.presets) (groups[p.country || ''] ||= []).push(p)
  return Object.entries(groups)
    .map(([country, list]) => ({
      country,
      label: country ? `${country} ${countryName(country, locale.value)}` : t('carrier.file.preset-other'),
      list,
    }))
    .sort((a, b) => (a.country ? 0 : 1) - (b.country ? 0 : 1) || a.label.localeCompare(b.label))
})
/** 下拉里只显示名称（version 是依据的规格文档说明，很长，放在下面的说明里） */
const presetLabel = (p: CarrierFilePreset) => text(p.name) || p.code
const setPreset = (code: string) => {
  carrier.value.file_preset = code || null
}

// ------------------ 账号项 ----------------------
const account = computed<Record<string, any>>(() => {
  const a = carrier.value?.file_account
  return a && typeof a === 'object' && !Array.isArray(a) ? a : {}
})
const setAccount = (key: string, value: string) => {
  carrier.value.file_account = { ...account.value, [key]: value }
}

// ------------------ 查询页 ----------------------
const presetTrackingUrl = computed(() => preset.value?.tracking_url_template || '')
const trackingUrlDiffers = computed(() =>
  !!presetTrackingUrl.value && String(carrier.value?.tracking_url_template || '').trim() !== presetTrackingUrl.value)
const usePresetTrackingUrl = () => {
  carrier.value.tracking_url_template = presetTrackingUrl.value
}

// ------------------ 模板（高级，JSON） ----------------------
const templateToText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}
const templateText = ref(templateToText(carrier.value?.file_template))
/** 画面上改过模板：外面重读承运商时不覆盖 */
let templateDirty = false
watch(() => carrier.value?.file_template, (value: unknown) => {
  if (!templateDirty) templateText.value = templateToText(value)
})
const onTemplateInput = (value: string) => {
  templateText.value = value
  templateDirty = true
}
/** 模板文字 → 对象：空 = null；不是 JSON 对象时 undefined */
const parsedTemplate = computed<Record<string, any> | null | undefined>(() => {
  const raw = templateText.value.trim()
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
})
const templateOpen = ref(!!templateText.value.trim())
const formatTemplate = () => {
  if (parsedTemplate.value) onTemplateInput(JSON.stringify(parsedTemplate.value, null, 2))
}

// ------------------ 校验 ----------------------
const localErrors = ref<Record<string, string>>({})
const errorOf = (field: string): string => {
  const own = localErrors.value[field]
  if (own) return own
  const hit = Object.entries(props.serverErrors || {}).find(([key]) => key === field || key.startsWith(`${field}.`))
  return hit ? hit[1] : ''
}
watch(templateText, () => {
  if (localErrors.value.file_template && parsedTemplate.value !== undefined) {
    const rest = { ...localErrors.value }
    delete rest.file_template
    localErrors.value = rest
  }
})

/** 文件方式（active）时检查：要有预设或模板、模板是 JSON 对象、预设要求的账号项都填了 */
const validate = (active: boolean): boolean => {
  const errs: Record<string, string> = {}
  if (parsedTemplate.value === undefined) errs.file_template = t('carrier.file.validation.template-json')
  if (active) {
    if (!carrier.value?.file_preset && !parsedTemplate.value) errs.file_preset = t('carrier.file.validation.preset-required')
    for (const f of preset.value?.account_fields || []) {
      if (f.required && !String(account.value[f.key] ?? '').trim()) {
        errs[`file_account.${f.key}`] = t('carrier.file.validation.account-required', { field: text(f.label) || f.key })
      }
    }
  }
  localErrors.value = errs
  if (errs.file_template) templateOpen.value = true
  return Object.keys(errs).length === 0
}

/** 要提交的文件设置（规范化：空 = null；有预设时账号项只留预设声明的） */
const payload = (): Record<string, any> => {
  const keys = preset.value ? preset.value.account_fields.map((f) => f.key) : Object.keys(account.value)
  const accountOut: Record<string, string> = {}
  for (const key of keys) {
    const value = String(account.value[key] ?? '').trim()
    if (value) accountOut[key] = value
  }
  return {
    file_preset: carrier.value?.file_preset || null,
    file_template: parsedTemplate.value ?? null,
    file_account: Object.keys(accountOut).length ? accountOut : null,
  }
}

defineExpose({ validate, payload })
</script>

<template>
 <div class="w-carrier-file"><h3>{{t('carrier.file.title')}}</h3><p>{{t('carrier.file.intro')}}</p><WFormGrid><WField :span="6" :label="t('carrier.file.preset')" :error="errorOf('file_preset')"><select :aria-label="t('carrier.file.preset')" class="w-file-select" :disabled="!editable" :value="carrier.file_preset||''" @change="setPreset(($event.target as HTMLSelectElement).value)"><option value="">{{t('carrier.file.preset-none')}}</option><option v-if="presetMissing" :value="carrier.file_preset">{{carrier.file_preset}}</option><optgroup v-for="group in presetGroups" :key="group.country" :label="group.label"><option v-for="p in group.list" :key="p.code" :value="p.code">{{presetLabel(p)}}</option></optgroup></select></WField><div v-if="preset" class="w-span-6 w-file-info"><strong>{{text(preset.name)||preset.code}}</strong><span>{{preset.country}} {{preset.country?countryName(preset.country,locale):''}}</span><span v-if="preset.version">{{t('carrier.file.version',{version:preset.version})}}</span><details v-if="text(preset.notes)"><summary>{{t('carrier.file.ui.instructions')}}</summary><p>{{text(preset.notes)}}</p></details><WStatus :tone="preset.verified?'ok':'warn'">{{t(preset.verified?'carrier.file.verified':'carrier.file.unverified')}}</WStatus></div><WField v-for="f in preset?.account_fields||[]" :key="f.key" :span="4" :label="text(f.label)||f.key" :optional="!f.required" :hint="text(f.help)" :error="errorOf('file_account.'+f.key)"><WInput :model-value="account[f.key]??''" :disabled="!editable" @update:model-value="value=>setAccount(f.key,String(value||''))" /></WField></WFormGrid><WAlert v-if="presetMissing" tone="warn" :title="t('carrier.file.preset-missing',{code:carrier.file_preset})" /><WAlert v-if="errorOf('file_account')" tone="block" :title="errorOf('file_account')" /><p v-if="!presets.length">{{t('carrier.file.no-presets')}}</p><div v-if="presetTrackingUrl" class="w-file-tracking"><span>{{t('carrier.file.tracking-url')}}</span><code>{{presetTrackingUrl}}</code><WButton v-if="editable&&trackingUrlDiffers" size="sm" @click="usePresetTrackingUrl">{{t('carrier.file.use-tracking-url')}}</WButton><span v-else-if="!trackingUrlDiffers">{{t('carrier.file.tracking-url-in-use')}}</span></div><details v-if="preset?.columns.length"><summary>{{t('carrier.file.columns',{count:preset.columns.length})}}</summary><div class="w-file-columns"><table><thead><tr><th>#</th><th>{{t('carrier.file.column-header')}}</th><th>{{t('carrier.file.column-required')}}</th><th>{{t('carrier.file.column-max-length')}}</th></tr></thead><tbody><tr v-for="(column,index) in preset.columns" :key="index"><td>{{index+1}}</td><td>{{column.header||'—'}}</td><td>{{column.required?'✓':'—'}}</td><td>{{column.max_length??'—'}}</td></tr></tbody></table></div></details><details :open="templateOpen" @toggle="templateOpen=($event.target as HTMLDetailsElement).open"><summary>{{t('carrier.file.template')}}</summary><p>{{t('carrier.file.template-hint')}}</p><textarea class="w-file-template" :aria-label="t('carrier.file.template')" rows="8" spellcheck="false" :disabled="!editable" :aria-invalid="parsedTemplate===undefined" :value="templateText" :placeholder="t('carrier.file.template-placeholder')" @input="onTemplateInput(($event.target as HTMLTextAreaElement).value)" /><WAlert v-if="parsedTemplate===undefined" tone="block" :title="t('carrier.file.validation.template-json')" /><WAlert v-else-if="errorOf('file_template')" tone="block" :title="errorOf('file_template')" /><WButton v-if="editable&&parsedTemplate" size="sm" @click="formatTemplate">{{t('carrier.file.template-format')}}</WButton></details></div>
</template>
<style scoped>
.w-carrier-file{display:flex;flex-direction:column;gap:12px;padding-top:16px;border-top:1px solid var(--w-line)}.w-carrier-file h3{font-size:13px;line-height:20px;font-weight:600;margin:0}.w-carrier-file p{font-size:12px;line-height:18px;color:var(--w-text-3);margin:0}.w-file-select{height:36px;width:100%;border:1px solid var(--w-border-strong);border-radius:6px;padding:0 12px;font:inherit;background:var(--w-surface);color:var(--w-text-1)}.w-file-info{display:flex;flex-direction:column;gap:4px;border:1px solid var(--w-border);border-radius:8px;padding:12px;font-size:12px;line-height:18px}.w-file-tracking{display:flex;flex-wrap:wrap;gap:8px;font-size:12px}.w-file-tracking code{overflow-wrap:anywhere}.w-carrier-file summary{cursor:pointer;font-size:13px;color:var(--w-link)}.w-file-columns{overflow:auto;max-height:288px;margin-top:12px}.w-file-columns table{width:100%;font-size:12px;border-collapse:collapse}.w-file-columns th,.w-file-columns td{padding:8px;border-bottom:1px solid var(--w-line);text-align:left}.w-file-template{width:100%;margin:8px 0;padding:12px;border:1px solid var(--w-border-strong);border-radius:6px;font-family:monospace;font-size:12px}
</style>
