<script setup lang="ts">
/**
 * 「?」说明：放在标签、标题、表头旁，悬停 / 聚焦 / 点击显示一句定义。页面上不写说明段落，必要的定义收到这里。
 * 按钮的 aria-label 是「说明：…」（读屏直接读出内容）；浮层挂到 body 上，不会被表格、卡片的 overflow 裁掉。
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  text: string
  placement?: 'top' | 'bottom'
}>(), {
  placement: 'top',
})

const { t } = useI18n()
const button = useTemplateRef<HTMLButtonElement>('button')
const bubble = useTemplateRef<HTMLElement>('bubble')
const visible = ref(false)
/** 点击打开的（触屏）：移开鼠标不收起，再点一次或 Esc 收起 */
const pinned = ref(false)
const style = ref<Record<string, string>>({})
const side = ref<'top' | 'bottom'>(props.placement)

const GAP = 8
const MARGIN = 8

const place = async () => {
  await nextTick()
  const anchor = button.value?.getBoundingClientRect()
  const tip = bubble.value
  if (!anchor || !tip) return
  const { width, height } = tip.getBoundingClientRect()
  let top = props.placement === 'top' ? anchor.top - height - GAP : anchor.bottom + GAP
  side.value = props.placement
  if (props.placement === 'top' && top < MARGIN) { top = anchor.bottom + GAP; side.value = 'bottom' }
  if (props.placement === 'bottom' && top + height > window.innerHeight - MARGIN) { top = anchor.top - height - GAP; side.value = 'top' }
  const left = Math.min(Math.max(MARGIN, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - MARGIN)
  style.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
}

const show = () => {
  visible.value = true
  place()
}
const hide = () => {
  if (pinned.value) return
  visible.value = false
}
const toggle = () => {
  pinned.value = !pinned.value
  if (pinned.value) show()
  else visible.value = false
}
const close = () => {
  pinned.value = false
  visible.value = false
}
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && visible.value) {
    event.stopPropagation()
    close()
  }
}

const onScroll = () => { if (visible.value) close() }
onMounted(() => window.addEventListener('scroll', onScroll, true))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll, true))
</script>

<template>
  <button ref="button" v-bind="$attrs" type="button" class="w-help" :aria-label="t('w.help.label', { text })"
    @mouseenter="show" @mouseleave="hide" @focus="show" @blur="close" @click="toggle" @keydown="onKeydown">
    <WIcon name="help" :size="16" />
  </button>
  <Teleport to="body">
    <span v-if="visible" ref="bubble" class="w-help__bubble w-scope" :class="`is-${side}`" :style="style" aria-hidden="true">
      {{ text }}
    </span>
  </Teleport>
</template>

<style scoped>
.w-help {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-pill);
  background: transparent;
  color: var(--w-text-3);
  cursor: help;
  vertical-align: middle;
}
.w-help:hover { color: var(--w-text-1); }
.w-help:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-help__bubble {
  position: fixed;
  z-index: var(--w-z-tooltip);
  max-width: 280px;
  padding: 6px 10px;
  border-radius: var(--w-radius-control);
  background: var(--w-neutral-900);
  color: #FFFFFF;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-regular);
  white-space: normal;
  box-shadow: var(--w-shadow-raised);
  pointer-events: none;
}
</style>
