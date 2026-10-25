<script setup lang="ts">
/**
 * 多行文本框：外观同输入框（描边、圆角、焦点环），默认 3 行；autosize 时随内容长高（到 maxRows 为止，之后滚动）。
 * 放在 WField 里时自动接上 id / aria-describedby / aria-invalid；其余属性（placeholder、maxlength……）直接传给 <textarea>，
 * class / style 加在外框上。showCount 配合 maxlength 在右下角显示字数。v-model 支持 .trim。
 */
import type { StyleValue } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  rows?: number
  autosize?: boolean
  maxRows?: number
  showCount?: boolean
  maxlength?: number
  invalid?: boolean
  disabled?: boolean
  readonly?: boolean
  id?: string
}>(), {
  rows: 3,
  autosize: false,
  maxRows: 10,
  showCount: false,
  invalid: false,
  disabled: false,
  readonly: false,
})

const [model, modifiers] = defineModel<string | null | undefined, 'trim'>({
  set(value) {
    return typeof value === 'string' && modifiers.trim ? value.trim() : value
  },
})

const attrs = useAttrs()
const { locale } = useI18n()
const field = useWField()
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')

const inputId = computed(() => props.id || field?.id.value)
const isInvalid = computed(() => props.invalid || !!field?.invalid.value)
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style as StyleValue }))
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const length = computed(() => String(model.value ?? '').length)
const countText = computed(() => (props.maxlength
  ? `${length.value.toLocaleString(locale.value)} / ${props.maxlength.toLocaleString(locale.value)}`
  : length.value.toLocaleString(locale.value)))

/** 按内容调高度：先归零再取 scrollHeight，最多 maxRows 行 */
const resize = () => {
  const el = textarea.value
  if (!props.autosize || !el) return
  const style = getComputedStyle(el)
  const line = parseFloat(style.lineHeight) || 22
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const max = line * props.maxRows + padding
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, max)}px`
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

const onInput = (event: Event) => {
  model.value = (event.target as HTMLTextAreaElement).value
  resize()
}
watch(model, () => nextTick(resize))
onMounted(resize)

defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <div v-bind="wrapperAttrs" class="w-textarea"
    :class="{ 'is-invalid': isInvalid, 'is-disabled': disabled, 'is-readonly': readonly, 'has-count': showCount }">
    <textarea ref="textarea" v-bind="inputAttrs" :id="inputId" class="w-textarea__control" :rows="rows"
      :value="model ?? ''" :maxlength="maxlength" :disabled="disabled" :readonly="readonly"
      :aria-invalid="isInvalid || undefined" :aria-describedby="field?.describedBy.value"
      :aria-required="field?.required.value || undefined" @input="onInput" />
    <span v-if="showCount" class="w-textarea__count" aria-hidden="true">{{ countText }}</span>
  </div>
</template>

<style scoped>
.w-textarea {
  position: relative;
  width: 100%;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-1);
  font-family: var(--w-font);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.w-textarea:focus-within {
  border-color: var(--w-sel);
  box-shadow: var(--w-focus-ring);
}
.w-textarea.is-invalid { border-color: var(--w-bad-dot); }
.w-textarea.is-invalid:focus-within { box-shadow: 0 0 0 3px var(--w-bad-bg); }
.w-textarea.is-disabled,
.w-textarea.is-readonly { background: var(--w-surface-2); color: var(--w-text-2); }
.w-textarea__control {
  display: block;
  width: 100%;
  min-height: calc(var(--w-control-h) - 2px);
  margin: 0;
  padding: 7px 12px;
  border: 0;
  border-radius: var(--w-radius-control);
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  resize: vertical;
}
.w-textarea.has-count .w-textarea__control { padding-bottom: 22px; }
.w-textarea__control::placeholder { color: var(--w-text-3); opacity: 1; }
.w-textarea__control:disabled { cursor: not-allowed; resize: none; }
.w-textarea__count {
  position: absolute;
  right: 10px;
  bottom: 4px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
</style>
