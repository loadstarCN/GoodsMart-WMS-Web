<script setup lang="ts">
/**
 * 单选卡片：一组二选一 / 多选一的方式选择（如「承运商对接 / 文件导出导入 / 手工」）。
 * 同组的卡片用同一个 v-model、同一个 name；选中时紫描边 + 选中底。标题 14 / 600，说明 12 灰字（一句话，不写段落）。
 */
import type { StyleValue } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  value: string | number | boolean
  name: string
  title?: string
  description?: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const model = defineModel<string | number | boolean | null | undefined>()
const attrs = useAttrs()
const checked = computed(() => model.value === props.value)
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style as StyleValue }))
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
</script>

<template>
  <label v-bind="wrapperAttrs" class="w-radio-card" :class="{ 'is-checked': checked, 'is-disabled': disabled }">
    <input v-bind="inputAttrs" v-model="model" type="radio" class="w-radio-card__input" :name="name" :value="value" :disabled="disabled">
    <span class="w-radio-card__body">
      <span class="w-radio-card__title"><slot name="title">{{ title }}</slot></span>
      <span v-if="description || $slots.default" class="w-radio-card__desc"><slot>{{ description }}</slot></span>
    </span>
  </label>
</template>

<style scoped>
.w-radio-card {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  font-family: var(--w-font);
  cursor: pointer;
  transition: border-color 0.12s, background-color 0.12s;
}
.w-radio-card:hover { border-color: var(--w-sel); }
.w-radio-card.is-checked {
  border-color: var(--w-sel);
  background: var(--w-sel-soft);
}
.w-radio-card:focus-within { box-shadow: var(--w-focus-ring); }
.w-radio-card.is-disabled {
  cursor: not-allowed;
  border-color: var(--w-border);
  background: var(--w-surface-2);
}
.w-radio-card__input {
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  accent-color: var(--w-pri);
  cursor: inherit;
}
.w-radio-card__input:focus-visible { outline: none; }
.w-radio-card__body { display: flex; flex-direction: column; min-width: 0; }
.w-radio-card__title {
  font-size: var(--w-fs-14);
  line-height: 20px;
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-radio-card__desc {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-2);
}
.w-radio-card.is-disabled .w-radio-card__title,
.w-radio-card.is-disabled .w-radio-card__desc { color: var(--w-text-3); }
</style>
