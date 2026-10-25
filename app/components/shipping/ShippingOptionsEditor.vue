<script lang="ts" setup>
/**
 * 运单服务选项（发货流程「运单」一步里；后端 doc/shipping-flow.md §6.4）。
 * 表单按 summary.options.schema（当前承运商的插件 / 文件预设声明的选项）生成：select（下拉）/ date / money / text。
 * 保存：PUT /dn/<id>/shipping-options {options} → {options, values, schema, defaults, locked, ...}；不合法 400 16139
 * （field = options.<key>，标在该项下面）。已建运单 / 已导出（locked，locked_reason WAYBILL_EXISTS）或 DN 已发货
 * （DN_SHIPPED）时只读并说明原因；别人刚建了运单 / 导出（409 16076 reason SHIPPING_OPTIONS_LOCKED）或刚发货（409 16065）
 * 时提示并重读。空的项不提交（= 不指定，导出 / 建单时用选项的 default）。select 里值为空串的项（如「指定なし」）当作「不指定」。
 * 保存后 emit saved（流程整体重读）。输入框与 DN 新建 / 编辑页共用 ShippingOptionsFields。
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
const idBase = useId()
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
/** 锁定原因（按原因码翻译，没有文案时用后端原文） */
const lockedText = computed(() => {
  const code = props.options.locked_reason
  const key = code ? `shipping.options.locked-reasons.${code}` : ''
  return key && te(key) ? t(key) : (props.options.locked_message || '')
})
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
  <section class="w-flow-options" :aria-labelledby="`${idBase}-title`">
    <div class="w-flow-options__head">
      <h4 :id="`${idBase}-title`" class="w-flow-options__title">{{ t('shipping.options.title') }}</h4>
      <WHelp v-if="!readonly" :text="t('shipping.options.hint')" />
      <WTag v-if="options.locked">{{ t('shipping.options.locked') }}</WTag>
      <span v-if="options.locked && lockedText" class="w-flow-options__reason">{{ lockedText }}</span>
    </div>

    <!-- 只读：列出填了的项 -->
    <template v-if="readonly">
      <p v-if="filled.length" class="w-flow-options__values">
        <span v-for="o in filled" :key="o.key" class="w-flow-options__value">
          <span class="w-faint">{{ text(o.label) || o.key }}</span> {{ displayValue(o) }}
        </span>
      </p>
      <p v-else class="w-flow-options__values w-faint">{{ t('shipping.options.none') }}</p>
    </template>

    <!-- 可编辑 -->
    <form v-else class="w-flow-options__form" @submit.prevent="save">
      <ShippingOptionsFields v-model="form" :schema="options.schema" :id-prefix="`shipping-option-${dnId}`"
        :disabled="saving" :errors="errors" :span="4" />
      <div class="w-flow-options__actions">
        <WButton type="submit" size="sm" :loading="saving" :disabled="!dirty">{{ t('button.save') }}</WButton>
        <WButton v-if="dirty" size="sm" variant="text" :disabled="saving" @click="reset">{{ t('button.cancel') }}</WButton>
        <span class="w-flow-options__reason">{{ t('shipping.options.lock-hint') }}</span>
      </div>
      <WAlert v-if="failure" tone="block" :title="failure" />
    </form>
  </section>
</template>

<style scoped>
.w-flow-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--w-line);
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-flow-options__head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.w-flow-options__title {
  margin: 0;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-semibold);
}
.w-flow-options__reason { font-size: var(--w-fs-12); color: var(--w-text-3); }
.w-flow-options__values { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; }
.w-flow-options__form { display: flex; flex-direction: column; gap: 10px; }
.w-flow-options__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
</style>
