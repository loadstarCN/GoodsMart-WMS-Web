<script setup lang="ts" generic="T extends string | number | boolean | null">
/**
 * 下拉选择：原生 <select>（键盘、读屏、手机上都可靠），外观同输入框，右侧灰色箭头。
 * options 的 label 必须是翻译后的文字，不露原值；placeholder 是「请选择」一类的空选项（值为 null）。
 * 放在 WField 里时自动接上 id / aria-describedby / aria-invalid；其余属性传给 <select>。
 */
import type { StyleValue } from 'vue'

export interface WSelectOption<V = string | number | boolean | null> {
  value: V
  label: string
  disabled?: boolean
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  options: WSelectOption<T>[]
  placeholder?: string
  /** 空选项也能选（可以清空）；默认空选项只作提示、不能选回去 */
  allowEmpty?: boolean
  size?: 'md' | 'sm'
  invalid?: boolean
  disabled?: boolean
  id?: string
}>(), {
  allowEmpty: false,
  size: 'md',
  invalid: false,
  disabled: false,
})

const model = defineModel<T | null | undefined>()
const attrs = useAttrs()
const field = useWField()

const selectId = computed(() => props.id || field?.id.value)
const isInvalid = computed(() => props.invalid || !!field?.invalid.value)
const isEmpty = computed(() => model.value === null || model.value === undefined || (model.value as unknown) === '')
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style as StyleValue }))
const selectAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
</script>

<template>
  <div v-bind="wrapperAttrs" class="w-select" :class="[`w-select--${size}`, { 'is-invalid': isInvalid, 'is-disabled': disabled }]">
    <select v-bind="selectAttrs" :id="selectId" v-model="model" class="w-select__control" :class="{ 'is-placeholder': isEmpty && placeholder }"
      :disabled="disabled" :aria-invalid="isInvalid || undefined" :aria-describedby="field?.describedBy.value"
      :aria-required="field?.required.value || undefined">
      <option v-if="placeholder" :value="null" :disabled="!allowEmpty">{{ placeholder }}</option>
      <option v-for="option in options" :key="String(option.value)" :value="option.value" :disabled="option.disabled">
        {{ option.label }}
      </option>
    </select>
    <WIcon class="w-select__chevron" name="chevron-down" :size="14" :stroke-width="2" />
  </div>
</template>

<style scoped>
.w-select {
  position: relative;
  width: 100%;
  font-family: var(--w-font);
}
.w-select__control {
  width: 100%;
  height: var(--w-control-h);
  padding: 0 32px 0 12px;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-1);
  font: inherit;
  font-size: var(--w-fs-14);
  line-height: 20px;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  text-overflow: ellipsis;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.w-select--sm .w-select__control {
  height: var(--w-control-h-inline);
  padding: 0 28px 0 8px;
  font-size: var(--w-fs-13);
}
.w-select__control.is-placeholder { color: var(--w-text-3); }
.w-select__control option { color: var(--w-text-1); background: var(--w-raised); }
.w-select__control:focus-visible,
.w-select__control:focus {
  outline: none;
  border-color: var(--w-sel);
  box-shadow: var(--w-focus-ring);
}
.w-select.is-invalid .w-select__control { border-color: var(--w-bad-dot); }
.w-select__control:disabled {
  cursor: not-allowed;
  background: var(--w-surface-2);
  color: var(--w-text-2);
}
.w-select__chevron {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  color: var(--w-text-3);
  pointer-events: none;
}
.w-select--sm .w-select__chevron { right: 8px; }
</style>
