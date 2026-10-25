<script setup lang="ts" generic="T extends string | number">
/**
 * 列表筛选条上的单选筛选（设计稿 DnList：「单据状态 全部 ⌄」）：灰字名称 + 正文色的当前值，点开是单选菜单（WDropdown）。
 * v-model 为 null 时是「全部」（allLabel）。选项多时（> 8）菜单里带一个筛选框。
 */
export interface WFilterOption<V = string | number> {
  value: V
  label: string
}

const props = withDefaults(defineProps<{
  label: string
  options: WFilterOption<T>[]
  /** 不筛选时显示的值（默认「全部」） */
  allLabel?: string
  width?: string
}>(), {
  width: '240px',
})

const model = defineModel<T | null | undefined>()
const emit = defineEmits<{ change: [value: T | null] }>()
const { t } = useI18n()
const query = ref('')

const current = computed(() => props.options.find((o) => o.value === model.value) ?? null)
const allText = computed(() => props.allLabel || t('w.filter.all'))
const searchable = computed(() => props.options.length > 8)
const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.options.filter((o) => o.label.toLowerCase().includes(q)) : props.options
})
const choose = (value: T | null) => {
  if (value === (model.value ?? null)) return
  model.value = value
  emit('change', value)
}
</script>

<template>
  <WDropdown :label="label" :width="width">
    <template #trigger="{ attrs, open }">
      <button v-bind="attrs" type="button" class="w-filter" :class="{ 'is-active': current, 'is-open': open }">
        <span class="w-filter__label">{{ label }}</span>
        <span class="w-filter__value">{{ current?.label ?? allText }}</span>
        <WIcon name="chevron-down" :size="14" :stroke-width="2" class="w-filter__chevron" />
      </button>
    </template>
    <div v-if="searchable" class="w-filter__search" data-keep-open>
      <WInput v-model="query" size="sm" clearable :placeholder="t('w.filter.search')" :aria-label="t('w.filter.search')" />
    </div>
    <button type="button" class="w-menu-item" role="menuitemradio" :aria-checked="current === null" @click="choose(null)">
      <span class="w-menu-item__label">{{ allText }}</span>
    </button>
    <button v-for="option in visible" :key="String(option.value)" type="button" class="w-menu-item" role="menuitemradio"
      :aria-checked="option.value === model" @click="choose(option.value)">
      <span class="w-menu-item__label">{{ option.label }}</span>
    </button>
  </WDropdown>
</template>

<style scoped>
.w-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--w-control-h);
  padding: 0 10px 0 12px;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-2);
  font: inherit;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.w-filter:hover { background: var(--w-surface-2); }
.w-filter:focus-visible { outline: none; border-color: var(--w-sel); box-shadow: var(--w-focus-ring); }
.w-filter.is-active { border-color: var(--w-sel-line); }
.w-filter__value { color: var(--w-text-1); }
.w-filter.is-active .w-filter__value { font-weight: var(--w-fw-medium); }
.w-filter__chevron { color: var(--w-text-3); }
.w-filter__search { padding: 2px 2px 6px; }
</style>
