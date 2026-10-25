<script setup lang="ts">
/**
 * 表单字段：标签 13 / 500 +（选填）+「?」说明，下面是控件，再下面是提示或出错文字（出错时替换提示）。
 * - 必填是默认，选填写「选填」，不用满屏星号
 * - span：在 WFormGrid 里占几栏（1–12）
 * - 里面的 WInput / WSelect / WCheckbox / WSwitch 自动接上 id、aria-describedby、aria-invalid；
 *   放别的控件时用插槽参数 { id, describedBy, invalid } 自己绑定
 */
const props = withDefaults(defineProps<{
  label: string
  optional?: boolean
  help?: string
  hint?: string
  error?: string | null
  span?: number
  id?: string
}>(), {
  optional: false,
  span: 12,
})

const { t } = useI18n()
const uid = useId()
const controlId = computed(() => props.id || `${uid}-control`)
const hintId = `${uid}-hint`
const errorId = `${uid}-error`
const invalid = computed(() => !!props.error)
const describedBy = computed(() => {
  if (props.error) return errorId
  if (props.hint) return hintId
  return undefined
})
const spanClass = computed(() => `w-span-${Math.min(12, Math.max(1, Math.round(props.span)))}`)

provide(W_FIELD_KEY, {
  id: controlId,
  describedBy,
  invalid,
  required: computed(() => !props.optional),
})
</script>

<template>
  <div class="w-field" :class="spanClass">
    <div class="w-field__label-row">
      <label class="w-field__label" :for="controlId">{{ label }}</label>
      <span v-if="optional" class="w-field__optional">{{ t('w.field.optional') }}</span>
      <WHelp v-if="help" :text="help" />
    </div>
    <slot :id="controlId" :described-by="describedBy" :invalid="invalid" />
    <p v-if="error" :id="errorId" class="w-field__error" aria-live="polite">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="w-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.w-field {
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-4);
  min-width: 0;
  font-family: var(--w-font);
}
.w-field__label-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
}
.w-field__label {
  margin: 0;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  font-weight: var(--w-fw-medium);
  color: var(--w-text-1);
}
.w-field__optional {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-field__hint,
.w-field__error {
  margin: 0;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
}
.w-field__hint { color: var(--w-text-3); }
.w-field__error { color: var(--w-bad-text); }
</style>
