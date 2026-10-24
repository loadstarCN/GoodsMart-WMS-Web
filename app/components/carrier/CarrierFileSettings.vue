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
  <div class="carrier-file-settings">
    <h6 class="fw-semibold mb-1"><i class="ri-file-transfer-line me-1"></i>{{ t('carrier.file.title') }}</h6>
    <p class="fs-12 text-muted mb-3">{{ t('carrier.file.intro') }}</p>

    <div class="row gy-3">
      <!-- 预设 -->
      <div class="col-xl-6">
        <label class="form-label" for="carrier-file-preset">{{ t('carrier.file.preset') }}</label>
        <select class="form-select" id="carrier-file-preset" :disabled="!editable" :value="carrier.file_preset || ''"
          @change="setPreset(($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('carrier.file.preset-none') }}</option>
          <option v-if="presetMissing" :value="carrier.file_preset">{{ carrier.file_preset }}</option>
          <optgroup v-for="group in presetGroups" :key="group.country" :label="group.label">
            <option v-for="p in group.list" :key="p.code" :value="p.code">{{ presetLabel(p) }}</option>
          </optgroup>
        </select>
        <div class="form-text" v-if="!presets.length">{{ t('carrier.file.no-presets') }}</div>
        <div class="form-text text-warning" v-if="presetMissing">{{ t('carrier.file.preset-missing', { code: carrier.file_preset }) }}</div>
        <div class="invalid-feedback d-block" v-if="errorOf('file_preset')">{{ errorOf('file_preset') }}</div>
      </div>

      <!-- 预设的说明 -->
      <div class="col-xl-6" v-if="preset">
        <div class="carrier-file-preset-info fs-12">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
            <span class="fw-semibold fs-13">{{ text(preset.name) || preset.code }}</span>
            <span class="badge bg-light text-default" v-if="preset.country">{{ preset.country }} {{ countryName(preset.country, locale) }}</span>
            <span class="badge bg-success-transparent" v-if="preset.verified"><i class="ri-checkbox-circle-line me-1"></i>{{ t('carrier.file.verified') }}</span>
          </div>
          <div class="font-monospace text-muted mb-1">{{ preset.code }}</div>
          <div class="text-muted mb-1 text-wrap" v-if="preset.version">{{ t('carrier.file.version', { version: preset.version }) }}</div>
          <p class="text-muted mb-1 text-wrap" v-if="text(preset.notes)">{{ text(preset.notes) }}</p>
          <div class="alert alert-warning-transparent py-1 px-2 mb-0" v-if="!preset.verified">
            <i class="ri-error-warning-line me-1"></i>{{ t('carrier.file.unverified') }}
          </div>
        </div>
      </div>

      <!-- 账号项 -->
      <template v-if="preset && preset.account_fields.length">
        <div class="col-xl-12">
          <div class="form-label mb-0 fs-13 fw-semibold">{{ t('carrier.file.account') }}</div>
          <div class="form-text mt-0">{{ t('carrier.file.account-hint') }}</div>
        </div>
        <div class="col-xl-4 col-md-6" v-for="f in preset.account_fields" :key="f.key">
          <label class="form-label" :for="`carrier-file-account-${f.key}`">
            {{ text(f.label) || f.key }} <abbr title="required" aria-hidden="true" class="text-danger" v-if="f.required">*</abbr>
          </label>
          <input type="text" class="form-control" :id="`carrier-file-account-${f.key}`" :disabled="!editable"
            :value="account[f.key] ?? ''" @input="setAccount(f.key, ($event.target as HTMLInputElement).value)">
          <div class="form-text" v-if="text(f.help)">{{ text(f.help) }}</div>
          <div class="invalid-feedback d-block" v-if="errorOf(`file_account.${f.key}`)">{{ errorOf(`file_account.${f.key}`) }}</div>
        </div>
      </template>
      <div class="col-xl-12" v-else-if="errorOf('file_account')">
        <div class="invalid-feedback d-block">{{ errorOf('file_account') }}</div>
      </div>

      <!-- 预设的公开查询页 -->
      <div class="col-xl-12 fs-12" v-if="presetTrackingUrl">
        <span class="text-muted">{{ t('carrier.file.tracking-url') }}</span>
        <span class="font-monospace text-break ms-1">{{ presetTrackingUrl }}</span>
        <button type="button" class="btn btn-link btn-sm p-0 ms-2 align-baseline fs-12" v-if="editable && trackingUrlDiffers"
          @click="usePresetTrackingUrl">{{ t('carrier.file.use-tracking-url') }}</button>
        <span class="text-success ms-2" v-else-if="!trackingUrlDiffers"><i class="ri-check-line"></i>{{ t('carrier.file.tracking-url-in-use') }}</span>
      </div>

      <!-- 导出的列（只读） -->
      <div class="col-xl-12" v-if="preset && preset.columns.length">
        <details class="fs-13">
          <summary class="text-primary">{{ t('carrier.file.columns', { count: preset.columns.length }) }}</summary>
          <div class="table-responsive mt-2 carrier-file-columns">
            <table class="table table-sm table-bordered mb-0 fs-12">
              <thead>
                <tr>
                  <th scope="col" class="text-end">#</th>
                  <th scope="col">{{ t('carrier.file.column-header') }}</th>
                  <th scope="col" class="text-center">{{ t('carrier.file.column-required') }}</th>
                  <th scope="col" class="text-end">{{ t('carrier.file.column-max-length') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in preset.columns" :key="`col-${i}`">
                  <td class="text-end text-muted">{{ i + 1 }}</td>
                  <td>{{ c.header || '—' }}</td>
                  <td class="text-center"><i class="ri-check-line text-success" v-if="c.required"></i></td>
                  <td class="text-end">{{ c.max_length ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <!-- 高级：模板（JSON） -->
      <div class="col-xl-12">
        <details class="fs-13" :open="templateOpen" @toggle="templateOpen = ($event.target as HTMLDetailsElement).open">
          <summary class="text-muted">{{ t('carrier.file.template') }}</summary>
          <p class="fs-12 text-muted mb-1 mt-2">{{ t('carrier.file.template-hint') }}</p>
          <textarea class="form-control font-monospace fs-12" rows="8" spellcheck="false" :disabled="!editable"
            :class="{ 'is-invalid': parsedTemplate === undefined }" :value="templateText"
            :placeholder="t('carrier.file.template-placeholder')"
            @input="onTemplateInput(($event.target as HTMLTextAreaElement).value)"></textarea>
          <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
            <span class="fs-12 text-danger" v-if="parsedTemplate === undefined">{{ t('carrier.file.validation.template-json') }}</span>
            <span class="fs-12 text-success" v-else-if="parsedTemplate"><i class="ri-check-line me-1"></i>{{ t('carrier.file.template-valid') }}</span>
            <button type="button" class="btn btn-link btn-sm p-0 fs-12 ms-auto" v-if="editable && parsedTemplate" @click="formatTemplate">
              {{ t('carrier.file.template-format') }}
            </button>
          </div>
          <div class="invalid-feedback d-block" v-if="errorOf('file_template') && parsedTemplate !== undefined">{{ errorOf('file_template') }}</div>
        </details>
      </div>
    </div>
  </div>
</template>

<style scoped>
.carrier-file-settings {
  border-top: 1px dashed var(--default-border);
  padding-top: 1rem;
}

.carrier-file-preset-info {
  border: 1px solid var(--default-border);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
}

.carrier-file-columns {
  max-height: 18rem;
  overflow-y: auto;
}

.carrier-file-settings details summary {
  cursor: pointer;
}
</style>
