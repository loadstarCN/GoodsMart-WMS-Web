<script setup lang="ts">
/**
 * 输入框：高 36（行内 28，随密度），可带单位后缀（suffix，如 kg、mm、件）、清除按钮（clearable）。
 * 放在 WField 里时自动接上 id / aria-describedby / aria-invalid；其余属性（placeholder、inputmode、
 * autocomplete、maxlength、@keydown.enter 等）直接传给 <input>，class / style 加在外框上。
 * PC 上扫码枪就是键盘输入：编码输入框用普通 WInput + @keydown.enter 即可，不做专门的扫码框。
 * v-model 支持 .number / .trim 修饰符。
 */
import type { StyleValue } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  type?: string
  size?: 'md' | 'sm'
  suffix?: string
  clearable?: boolean
  invalid?: boolean
  disabled?: boolean
  readonly?: boolean
  /** 数字、金额右对齐 */
  align?: 'left' | 'right'
  id?: string
}>(), {
  type: 'text',
  size: 'md',
  clearable: false,
  invalid: false,
  disabled: false,
  readonly: false,
  align: 'left',
})

const [model, modifiers] = defineModel<string | number | null | undefined, 'number' | 'trim'>({
  set(value) {
    if (typeof value !== 'string') return value
    let next: string | number = modifiers.trim ? value.trim() : value
    if (modifiers.number && next !== '') {
      const num = Number(next)
      if (!Number.isNaN(num)) next = num
    }
    return next
  },
})
const emit = defineEmits<{ clear: [] }>()

const attrs = useAttrs()
const { t } = useI18n()
const field = useWField()
const inputRef = useTemplateRef<HTMLInputElement>('input')

const inputId = computed(() => props.id || field?.id.value)
const isInvalid = computed(() => props.invalid || !!field?.invalid.value)
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style as StyleValue }))
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const showClear = computed(() =>
  props.clearable && !props.disabled && !props.readonly && model.value !== null && model.value !== undefined && model.value !== '')

const onInput = (event: Event) => {
  model.value = (event.target as HTMLInputElement).value
}
const clear = () => {
  model.value = ''
  emit('clear')
  inputRef.value?.focus()
}

defineExpose({ focus: () => inputRef.value?.focus(), select: () => inputRef.value?.select() })
</script>

<template>
  <div v-bind="wrapperAttrs" class="w-input"
    :class="[`w-input--${size}`, { 'is-invalid': isInvalid, 'is-disabled': disabled, 'is-readonly': readonly }]">
    <span v-if="$slots.prefix" class="w-input__affix"><slot name="prefix" /></span>
    <input ref="input" v-bind="inputAttrs" :id="inputId" class="w-input__control" :class="{ 'is-right': align === 'right' }"
      :type="type" :value="model ?? ''" :disabled="disabled" :readonly="readonly"
      :aria-invalid="isInvalid || undefined" :aria-describedby="field?.describedBy.value"
      :aria-required="field?.required.value || undefined" @input="onInput">
    <button v-if="showClear" type="button" class="w-input__clear" :aria-label="t('w.input.clear')" @click="clear">
      <WIcon name="close" :size="12" :stroke-width="2.4" />
    </button>
    <span v-if="suffix || $slots.suffix" class="w-input__affix w-input__suffix"><slot name="suffix">{{ suffix }}</slot></span>
  </div>
</template>

<style scoped>
.w-input {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: var(--w-control-h);
  padding: 0 12px;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-1);
  font-family: var(--w-font);
  font-size: var(--w-fs-14);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.w-input--sm {
  height: var(--w-control-h-inline);
  padding: 0 8px;
  font-size: var(--w-fs-13);
}
.w-input:focus-within {
  border-color: var(--w-sel);
  box-shadow: var(--w-focus-ring);
}
.w-input.is-invalid { border-color: var(--w-bad-dot); }
.w-input.is-invalid:focus-within { box-shadow: 0 0 0 3px var(--w-bad-bg); }
.w-input.is-disabled,
.w-input.is-readonly { background: var(--w-surface-2); color: var(--w-text-2); }
.w-input.is-disabled { cursor: not-allowed; }

.w-input__control {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.w-input__control.is-right { text-align: right; }
.w-input__control::placeholder { color: var(--w-text-3); opacity: 1; }
.w-input__control:disabled { cursor: not-allowed; }
/* 去掉 number 输入框的上下箭头（数字用 inputmode 唤起键盘） */
.w-input__control::-webkit-outer-spin-button,
.w-input__control::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.w-input__control[type="number"] { -moz-appearance: textfield; appearance: textfield; }

.w-input__affix {
  display: inline-flex;
  align-items: center;
  flex: none;
  color: var(--w-text-3);
  font-size: var(--w-fs-13);
  white-space: nowrap;
}
.w-input__clear {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  margin-right: -6px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-3);
  cursor: pointer;
}
.w-input__clear:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-input__clear:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-input__suffix + .w-input__clear,
.w-input__clear + .w-input__suffix { margin-left: 0; }
</style>
