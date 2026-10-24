<script lang="ts" setup>
/**
 * 运单服务选项（发货流程「运单」一步里；后端 doc/shipping-flow.md §6.4）。
 * 表单按 summary.options.schema（当前承运商的插件 / 文件预设声明的选项）生成：select（下拉）/ date / money / text。
 * 保存：PUT /dn/<id>/shipping-options {options} → {options, values, schema, defaults, locked, ...}；不合法 400 16139
 * （field = options.<key>，标在该项下面）。已建运单 / 已导出（locked，locked_reason WAYBILL_EXISTS）或 DN 已发货
 * （DN_SHIPPED）时只读并说明原因；别人刚建了运单 / 导出（409 16076 reason SHIPPING_OPTIONS_LOCKED）或刚发货（409 16065）
 * 时提示并重读。空的项不提交（= 不指定，导出 / 建单时用选项的 default）。select 里值为空串的项（如「指定なし」）当作「不指定」。
 * 保存后 emit saved（流程整体重读）。
 */
import type { HttpRequestError } from '~/utils/http'
import {
  CARRIER_FILE_BIZ_CODES,
  localizedText,
  shippingOptionsUrl,
  type ServiceOption,
  type ServiceOptionValue,
  type ShippingOptionsState,
} from '~/composables/shipping/carrierFile'

const props = withDefaults(defineProps<{
  dnId: number | string
  options: ShippingOptionsState
  /** DN 已发货 */
  locked?: boolean
}>(), {
  locked: false,
})

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { t, te, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()
const staffStore = useStaffStore()
const iso = computed(() => String(localeProperties.value?.iso || 'en-US'))
const text = (value: any) => localizedText(value, iso.value)

// 权限以后端为准；出库单 / 打包 / 配送的编辑权限都给改
const readonly = computed(() => props.locked || props.options.locked
  || !staffStore.hasPermission('dn_edit', 'packing_edit', 'delivery_edit'))

const toFormValue = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const form = ref<Record<string, string>>({})
const reset = () => {
  const next: Record<string, string> = {}
  for (const o of props.options.schema) next[o.key] = toFormValue(props.options.values[o.key])
  form.value = next
  errors.value = {}
  failure.value = null
}
const errors = ref<Record<string, string>>({})
const failure = ref<string | null>(null)
watch(() => props.options, reset, { immediate: true, deep: true })

const dirty = computed(() => props.options.schema.some((o: ServiceOption) =>
  toFormValue(form.value[o.key]).trim() !== toFormValue(props.options.values[o.key])))

/** 只读时显示的值（select 显示选项的文字） */
const displayValue = (o: ServiceOption): string => {
  const raw = toFormValue(props.options.values[o.key])
  if (!raw) return '—'
  if (o.kind === 'select') {
    const hit = (o.values || []).find((v: ServiceOptionValue) => v.value === raw)
    return hit ? text(hit.label) || raw : raw
  }
  return raw
}
const filled = computed(() => props.options.schema.filter((o: ServiceOption) => toFormValue(props.options.values[o.key]) !== ''))
/** select 的可选值：空串的项（「指定なし」之类）由「不指定」那一项代表，不重复列 */
const choices = (o: ServiceOption): ServiceOptionValue[] => (o.values || []).filter((v: ServiceOptionValue) => v.value !== '')
/** 锁定原因（按原因码翻译，没有文案时用后端原文） */
const lockedText = computed(() => {
  const code = props.options.locked_reason
  const key = code ? `shipping.options.locked-reasons.${code}` : ''
  return key && te(key) ? t(key) : (props.options.locked_message || '')
})
/** 没设时用的值的文字（select 显示选项的文字） */
const defaultText = (o: ServiceOption): string => {
  if (!o.default) return ''
  if (o.kind === 'select') {
    const hit = (o.values || []).find((v: ServiceOptionValue) => v.value === o.default)
    return hit ? text(hit.label) || o.default : o.default
  }
  return o.default
}
const unsetText = (o: ServiceOption): string => {
  if (defaultText(o)) return t('shipping.options.unset-default', { value: defaultText(o) })
  // 预设自带的「不指定」项（值为空串）用它的文字
  const blank = (o.values || []).find((v: ServiceOptionValue) => v.value === '')
  return (blank ? text(blank.label) : '') || t('shipping.options.unset')
}

const saving = ref(false)
const save = async () => {
  if (readonly.value || saving.value) return
  const out: Record<string, any> = {}
  const errs: Record<string, string> = {}
  for (const o of props.options.schema) {
    const value = String(form.value[o.key] ?? '').trim()
    if (!value) continue
    if (o.kind === 'money') {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) {
        errs[o.key] = t('shipping.options.invalid-money')
        continue
      }
      out[o.key] = n
    } else {
      out[o.key] = value
    }
  }
  errors.value = errs
  if (Object.keys(errs).length) return
  saving.value = true
  failure.value = null
  let saved = false
  let stale = false
  await httpRequest<any>(shippingOptionsUrl(props.dnId), {
    method: 'PUT',
    body: { options: out },
    onSuccess: () => {
      saved = true
      showToast(t('shipping.options.saved'), 'success')
    },
    onError: (error: HttpRequestError) => {
      const field = String(error.field || '')
      if (error.code === CARRIER_FILE_BIZ_CODES.OPTIONS_INVALID && field.startsWith('options.')) {
        // 标在该项下面：不再重复字段名，后端原文（如上限）放在括号里
        errors.value = { [field.slice('options.'.length)]: t('shipping.options.invalid-field', { message: error.message || '—' }) }
        return
      }
      if ((error.code === CARRIER_FILE_BIZ_CODES.OPTIONS_LOCKED && error.details?.reason === 'SHIPPING_OPTIONS_LOCKED')
        || error.code === CARRIER_FILE_BIZ_CODES.DN_SHIPPED) {
        // 别人刚建了运单 / 导出或刚发货：提示后按最新状态重读（变成只读）
        showToast(bizErrorMessage(error), 'error')
        stale = true
        return
      }
      failure.value = bizErrorMessage(error)
    },
    onFinally: () => {
      saving.value = false
    },
  })
  if (saved || stale) emit('saved')
}
</script>

<template>
  <div class="shipping-options mt-3">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <span class="fw-semibold fs-13"><i class="ri-settings-3-line me-1"></i>{{ t('shipping.options.title') }}</span>
      <span class="badge bg-light text-default fw-normal" v-if="options.locked">
        <i class="ri-lock-line me-1"></i>{{ t('shipping.options.locked') }}
      </span>
      <span class="fs-12 text-muted" v-if="options.locked && lockedText">{{ lockedText }}</span>
    </div>

    <!-- 只读：列出填了的项 -->
    <template v-if="readonly">
      <dl class="row fs-13 mb-0" v-if="filled.length">
        <template v-for="o in filled" :key="o.key">
          <dt class="col-sm-4 fw-normal text-muted">{{ text(o.label) || o.key }}</dt>
          <dd class="col-sm-8 mb-1">{{ displayValue(o) }}</dd>
        </template>
      </dl>
      <p class="fs-12 text-muted mb-0" v-else>{{ t('shipping.options.none') }}</p>
    </template>

    <!-- 可编辑 -->
    <form v-else @submit.prevent="save">
      <p class="fs-12 text-muted mb-2">{{ t('shipping.options.hint') }}</p>
      <div class="row g-2">
        <div class="col-md-6 col-xxl-4" v-for="o in options.schema" :key="o.key">
          <label class="form-label fs-12 mb-1" :for="`shipping-option-${dnId}-${o.key}`">{{ text(o.label) || o.key }}</label>
          <select class="form-select form-select-sm" :id="`shipping-option-${dnId}-${o.key}`" v-if="o.kind === 'select'"
            v-model="form[o.key]" :disabled="saving">
            <option value="">{{ unsetText(o) }}</option>
            <option v-for="v in choices(o)" :key="v.value" :value="v.value">{{ text(v.label) || v.value }}</option>
          </select>
          <input type="date" class="form-control form-control-sm" :id="`shipping-option-${dnId}-${o.key}`"
            v-else-if="o.kind === 'date'" v-model="form[o.key]" :disabled="saving">
          <input type="number" class="form-control form-control-sm" :id="`shipping-option-${dnId}-${o.key}`" min="0" step="any"
            v-else-if="o.kind === 'money'" v-model="form[o.key]" :placeholder="o.default || ''" :disabled="saving">
          <input type="text" class="form-control form-control-sm" :id="`shipping-option-${dnId}-${o.key}`"
            :maxlength="o.max_length || 200" v-else v-model="form[o.key]" :placeholder="o.default || ''" :disabled="saving">
          <div class="form-text fs-11" v-if="text(o.help)">{{ text(o.help) }}</div>
          <div class="form-text fs-11" v-else-if="o.kind === 'date' && o.default">{{ unsetText(o) }}</div>
          <div class="invalid-feedback d-block" v-if="errors[o.key]">{{ errors[o.key] }}</div>
        </div>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
        <button type="submit" class="btn btn-sm btn-primary-light" :disabled="saving || !dirty">
          <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>{{ t('button.save') }}
        </button>
        <button type="button" class="btn btn-sm btn-light" v-if="dirty" :disabled="saving" @click="reset">{{ t('button.cancel') }}</button>
        <span class="fs-12 text-muted">{{ t('shipping.options.lock-hint') }}</span>
      </div>
      <div class="alert alert-danger-transparent fs-13 mt-2 mb-0" v-if="failure">{{ failure }}</div>
    </form>
  </div>
</template>

<style scoped>
.shipping-options {
  border-top: 1px dashed var(--default-border);
  padding-top: 0.75rem;
}
</style>
