<script setup lang="ts" generic="T extends string | number">
/**
 * 分段控件：同一份数据换视角（按商品 / 按库位、列表 / 平面图），2–4 项。
 * role="radiogroup"，左右方向键切换（选中即生效）；label 说明这组切的是什么。
 */
export interface WSegmentedOption<V = string | number> {
  value: V
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  options: WSegmentedOption<T>[]
  /** 这组控件的无障碍名称（aria-label） */
  label: string
  size?: 'md' | 'sm'
}>(), {
  size: 'md',
})

const model = defineModel<T>()
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

const enabledIndexes = computed(() => props.options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0))
/** 能拿到 Tab 焦点的一项：选中项，没有选中时第一项可用的 */
const focusIndex = computed(() => {
  const selected = props.options.findIndex((o) => o.value === model.value)
  return selected >= 0 ? selected : (enabledIndexes.value[0] ?? 0)
})

const select = (index: number) => {
  const option = props.options[index]
  if (!option || option.disabled) return
  model.value = option.value
}

const onKeydown = (event: KeyboardEvent) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(event.key) || enabledIndexes.value.length === 0) return
  event.preventDefault()
  const list = enabledIndexes.value
  const pos = Math.max(0, list.indexOf(focusIndex.value))
  let next = pos
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = list.length - 1
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (pos - 1 + list.length) % list.length
  else next = (pos + 1) % list.length
  const index = list[next]!
  select(index)
  nextTick(() => buttons.value?.[index]?.focus())
}
</script>

<template>
  <div class="w-seg" :class="`w-seg--${size}`" role="radiogroup" :aria-label="label" @keydown="onKeydown">
    <button v-for="(option, index) in options" :key="String(option.value)" ref="buttons" type="button" role="radio"
      class="w-seg__item" :class="{ 'is-active': option.value === model }" :aria-checked="option.value === model"
      :tabindex="index === focusIndex ? 0 : -1" :disabled="option.disabled" @click="select(index)">
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.w-seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: var(--w-radius-control);
  background: var(--w-surface-2);
  font-family: var(--w-font);
}
.w-seg__item {
  display: inline-flex;
  align-items: center;
  height: calc(var(--w-control-h) - 8px);
  padding: 0 12px;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-2);
  font: inherit;
  font-size: var(--w-fs-13);
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.w-seg--sm .w-seg__item {
  height: calc(var(--w-control-h-inline) - 4px);
  padding: 0 10px;
  font-size: var(--w-fs-12);
}
.w-seg__item:hover:not(:disabled):not(.is-active) { color: var(--w-text-1); }
.w-seg__item.is-active {
  background: var(--w-surface);
  box-shadow: var(--w-shadow-thumb);
  color: var(--w-text-1);
  font-weight: var(--w-fw-semibold);
}
.w-seg__item:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-seg__item:disabled { color: var(--w-text-3); cursor: not-allowed; }
</style>
