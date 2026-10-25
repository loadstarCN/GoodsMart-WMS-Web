<script setup lang="ts">
/**
 * 下拉菜单（菜单按钮）：顶栏的仓库 / 语言 / 账户菜单、行内「更多」。
 * - #trigger 插槽拿到 { attrs, open }，把 attrs 绑到触发按钮上（aria-haspopup / aria-expanded / 点击与键盘）
 * - 菜单项用带 role 的按钮或链接：<button class="w-menu-item" role="menuitem">；单选项用 role="menuitemradio"
 *   + aria-checked；分组线 <div class="w-menu-divider" role="separator" />
 * - 键盘：上下方向键 / Home / End 移动，Esc 关闭并回到触发按钮，Tab 关闭；点菜单项后自动关闭
 *   （项上加 data-keep-open 时不关）；点菜单外关闭
 * - 现在不能做的项写 aria-disabled="true"（不用 disabled：仍能聚焦、读屏能读到原因），点了不关、不执行；
 *   原因写在第二行：<button class="w-menu-item w-menu-item--stacked" role="menuitem" aria-disabled="true">
 *   <span class="w-menu-item__label">编辑</span><span class="w-menu-item__desc">只有待处理的可以编辑</span></button>
 */
const props = withDefaults(defineProps<{
  /** 菜单的无障碍名称 */
  label: string
  placement?: 'bottom-start' | 'bottom-end'
  width?: string
}>(), {
  placement: 'bottom-start',
  width: '240px',
})

const open = ref(false)
const uid = useId()
const menuId = `${uid}-menu`
const root = useTemplateRef<HTMLElement>('root')
const menu = useTemplateRef<HTMLElement>('menu')

// 只算看得见的项（只在窄屏出现的项在宽屏是 display: none，不能聚焦）
const items = () => Array.from(menu.value?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') || [])
  .filter((el) => el.offsetParent !== null)
const triggerEl = () => root.value?.querySelector<HTMLElement>('[aria-haspopup]') || null

const focusItem = (index: number) => {
  const list = items()
  if (list.length === 0) return
  list[(index + list.length) % list.length]?.focus()
}
const show = async (focus: 'first' | 'last' | 'checked' = 'checked') => {
  open.value = true
  await nextTick()
  const list = items()
  if (focus === 'last') focusItem(list.length - 1)
  else if (focus === 'checked') {
    const checked = list.findIndex((el) => el.getAttribute('aria-checked') === 'true')
    focusItem(checked >= 0 ? checked : 0)
  } else focusItem(0)
}
const hide = (returnFocus = false) => {
  if (!open.value) return
  open.value = false
  if (returnFocus) triggerEl()?.focus()
}

const onTriggerKeydown = (event: KeyboardEvent) => {
  // Enter / 空格由按钮自己的 click 处理（打开并聚焦选中项或第一项）
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    show('first')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    show('last')
  }
}
const onMenuKeydown = (event: KeyboardEvent) => {
  const list = items()
  const current = list.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'ArrowDown') { event.preventDefault(); focusItem(current + 1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); focusItem(current - 1) }
  else if (event.key === 'Home') { event.preventDefault(); focusItem(0) }
  else if (event.key === 'End') { event.preventDefault(); focusItem(list.length - 1) }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(true) }
  else if (event.key === 'Tab') hide()
}
const onMenuClick = (event: MouseEvent) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[role^="menuitem"]')
  if (!item) return
  if (item.getAttribute('aria-disabled') === 'true') {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (!item.hasAttribute('data-keep-open')) hide(true)
}

const onDocumentPointer = (event: PointerEvent) => {
  if (open.value && root.value && !root.value.contains(event.target as Node)) hide()
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer))

const triggerAttrs = computed(() => ({
  'aria-haspopup': 'menu' as const,
  'aria-expanded': open.value,
  'aria-controls': open.value ? menuId : undefined,
  onClick: () => (open.value ? hide() : show()),
  onKeydown: onTriggerKeydown,
}))

defineExpose({ show, hide })
</script>

<template>
  <div ref="root" class="w-dropdown">
    <slot name="trigger" :attrs="triggerAttrs" :open="open" />
    <Transition name="w-dropdown">
      <div v-if="open" :id="menuId" ref="menu" class="w-dropdown__menu w-scope" :class="`is-${placement}`"
        :style="{ width: props.width }" role="menu" :aria-label="label" @keydown="onMenuKeydown" @click.capture="onMenuClick">
        <slot :close="hide" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.w-dropdown {
  position: relative;
  display: inline-flex;
}
.w-dropdown__menu {
  position: absolute;
  top: calc(100% + 6px);
  z-index: var(--w-z-dropdown);
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: calc(100vw - 16px);
  max-height: min(480px, calc(100vh - 80px));
  overflow-y: auto;
  padding: var(--w-sp-8);
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-raised);
  box-shadow: var(--w-shadow-raised);
  color: var(--w-text-1);
}
.w-dropdown__menu.is-bottom-start { left: 0; }
.w-dropdown__menu.is-bottom-end { right: 0; }
.w-dropdown-enter-active,
.w-dropdown-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.w-dropdown-enter-from,
.w-dropdown-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .w-dropdown-enter-active, .w-dropdown-leave-active { transition: none; }
}
</style>

<style>
/* 菜单项（不加 scoped：菜单项写在使用方的模板里） */
.w-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-1);
  font: inherit;
  font-family: var(--w-font);
  font-size: var(--w-fs-14);
  line-height: 20px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.w-menu-item:hover,
.w-menu-item:focus-visible {
  outline: none;
  background: var(--w-surface-2);
  color: var(--w-text-1);
}
.w-menu-item[aria-checked="true"] { background: var(--w-sel-soft); }
.w-menu-item[aria-checked="true"]:focus-visible { box-shadow: inset 0 0 0 2px var(--w-focus); }
.w-menu-item.is-danger,
.w-menu-item.is-danger:hover { color: var(--w-bad-text); }
.w-menu-item[aria-disabled="true"],
.w-menu-item[aria-disabled="true"]:hover { color: var(--w-text-3); background: transparent; cursor: not-allowed; }
.w-menu-item[aria-disabled="true"]:focus-visible { background: var(--w-surface-2); }
/* 两行：名称 + 灰字说明（不能做的原因） */
.w-menu-item--stacked {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  padding-top: 6px;
  padding-bottom: 6px;
}
.w-menu-item__desc {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-menu-item__label { flex: 1; min-width: 0; }
.w-menu-item__sub { font-size: var(--w-fs-12); color: var(--w-text-3); white-space: nowrap; }
.w-menu-divider {
  height: 1px;
  margin: 2px 0;
  background: var(--w-line);
}
</style>
