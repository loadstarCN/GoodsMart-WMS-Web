<script setup lang="ts">
/**
 * 页签：按状态或阶段分的页签栏，选中 2px 紫线 + 600。
 * - count：数量用灰字，不做彩色徽标；attention：需处理的页签名前加琥珀点；error：异常加红点
 * - 页签多时横向滚动，不出现纵向滚动条（overflow-y: hidden、隐藏滚动条）
 * - 键盘：左右方向键 / Home / End 切换（选中即切换内容）
 * 页签对应的内容区由页面自己放；传 panelId 时，页签的 aria-controls 指向「panelId」（内容区用 role="tabpanel"）。
 */
export interface WTabItem {
  key: string
  label: string
  count?: number | string | null
  attention?: boolean
  error?: boolean
  disabled?: boolean
}

const props = defineProps<{
  items: WTabItem[]
  /** 这组控件的无障碍名称（aria-label） */
  label: string
  panelId?: string
}>()

const model = defineModel<string>()
const emit = defineEmits<{ change: [key: string] }>()
const { t, locale } = useI18n()
const uid = useId()
const tabRefs = useTemplateRef<HTMLButtonElement[]>('tabs')

const tabId = (key: string) => `${uid}-tab-${key}`
const formatCount = (count: number | string | null | undefined) =>
  typeof count === 'number' ? count.toLocaleString(locale.value) : (count ?? '')
const hasCount = (count: number | string | null | undefined) => count !== null && count !== undefined && count !== ''

const activeIndex = computed(() => {
  const index = props.items.findIndex((item) => item.key === model.value)
  return index >= 0 ? index : 0
})

const select = (index: number, focus = false) => {
  const item = props.items[index]
  if (!item || item.disabled) return
  if (item.key !== model.value) {
    model.value = item.key
    emit('change', item.key)
  }
  nextTick(() => {
    const el = tabRefs.value?.[index]
    if (focus) el?.focus()
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

const onKeydown = (event: KeyboardEvent) => {
  const enabled = props.items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0)
  if (enabled.length === 0) return
  const pos = Math.max(0, enabled.indexOf(activeIndex.value))
  let next: number | null = null
  if (event.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length]!
  else if (event.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length]!
  else if (event.key === 'Home') next = enabled[0]!
  else if (event.key === 'End') next = enabled[enabled.length - 1]!
  if (next === null) return
  event.preventDefault()
  select(next, true)
}

defineExpose({ tabId })
</script>

<template>
  <div class="w-tabs" role="tablist" :aria-label="label" @keydown="onKeydown">
    <button v-for="(item, index) in items" :id="tabId(item.key)" :key="item.key" ref="tabs" type="button" role="tab"
      class="w-tabs__tab" :class="{ 'is-active': index === activeIndex }" :aria-selected="index === activeIndex"
      :aria-controls="panelId" :tabindex="index === activeIndex ? 0 : -1" :disabled="item.disabled" @click="select(index)">
      <span v-if="item.error" class="w-tabs__dot is-bad" aria-hidden="true" />
      <span v-else-if="item.attention" class="w-tabs__dot" aria-hidden="true" />
      <span>{{ item.label }}</span>
      <span v-if="hasCount(item.count)" class="w-tabs__count">{{ formatCount(item.count) }}</span>
      <span v-if="item.error" class="w-sr-only">{{ t('w.tabs.error') }}</span>
      <span v-else-if="item.attention" class="w-sr-only">{{ t('w.tabs.attention') }}</span>
    </button>
  </div>
</template>

<style scoped>
.w-tabs {
  display: flex;
  gap: 20px;
  /* 页签多时横向滚动，不出现纵向滚动条 */
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  /* 底线用内阴影画，选中线（2px 下边框）压在它上面，不用负外边距（会被 overflow 裁掉） */
  box-shadow: inset 0 -1px 0 var(--w-border);
  font-family: var(--w-font);
}
.w-tabs::-webkit-scrollbar { display: none; }
.w-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 40px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--w-text-2);
  font: inherit;
  font-size: var(--w-fs-14);
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.w-tabs__tab:hover:not(:disabled) { color: var(--w-text-1); }
.w-tabs__tab.is-active {
  border-bottom-color: var(--w-sel);
  color: var(--w-text-1);
  font-weight: var(--w-fw-semibold);
}
.w-tabs__tab:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--w-focus);
  border-radius: var(--w-radius-control) var(--w-radius-control) 0 0;
}
.w-tabs__tab:disabled { color: var(--w-text-3); cursor: not-allowed; }
.w-tabs__count {
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  color: var(--w-text-3);
}
.w-tabs__tab.is-active .w-tabs__count { color: var(--w-text-2); }
.w-tabs__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: var(--w-radius-pill);
  background: var(--w-warn-dot);
}
.w-tabs__dot.is-bad { background: var(--w-bad-dot); }
</style>
