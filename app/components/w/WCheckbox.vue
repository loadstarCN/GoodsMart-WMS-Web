<script setup lang="ts">
/**
 * 勾选框：原生 checkbox（16px，主色），文字放默认插槽或 label。
 * v-model 是布尔值；绑数组时配合 value（同原生 v-model 的数组用法）。indeterminate = 部分选中（表头全选）。
 */
import type { StyleValue } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  value?: unknown
  label?: string
  indeterminate?: boolean
  disabled?: boolean
  id?: string
}>(), {
  indeterminate: false,
  disabled: false,
})

const model = defineModel<boolean | unknown[] | undefined>()
const attrs = useAttrs()
const field = useWField()
const inputRef = useTemplateRef<HTMLInputElement>('input')

const inputId = computed(() => props.id || field?.id.value)
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style as StyleValue }))
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

watchEffect(() => {
  if (inputRef.value) inputRef.value.indeterminate = props.indeterminate
})
</script>

<template>
  <label v-bind="wrapperAttrs" class="w-check" :class="{ 'is-disabled': disabled }">
    <input ref="input" v-bind="inputAttrs" :id="inputId" v-model="model" type="checkbox" class="w-check__input"
      :value="value" :disabled="disabled" :aria-describedby="field?.describedBy.value"
      :aria-invalid="field?.invalid.value || undefined">
    <span v-if="label || $slots.default" class="w-check__label"><slot>{{ label }}</slot></span>
  </label>
</template>

<style scoped>
.w-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--w-font);
  font-size: var(--w-fs-14);
  line-height: 20px;
  color: var(--w-text-1);
  cursor: pointer;
}
.w-check.is-disabled { color: var(--w-text-3); cursor: not-allowed; }
.w-check__input {
  width: 16px;
  height: 16px;
  margin: 0;
  flex: none;
  accent-color: var(--w-pri);
  cursor: inherit;
}
.w-check__input:focus-visible {
  outline: none;
  box-shadow: var(--w-focus-ring);
  border-radius: 3px;
}
</style>
