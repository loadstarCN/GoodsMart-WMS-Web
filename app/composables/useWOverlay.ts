/**
 * 弹窗 / 抽屉共用的浮层行为：打开时记住原焦点并把焦点移进面板、Tab 只在面板内循环、Esc 关闭、
 * 锁住页面滚动；关闭后焦点回到打开前的元素。多个浮层叠开时只有最上面那个响应 Esc 和 Tab。
 */
import type { Ref } from 'vue'

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

// 打开中的浮层（后开的在后面）
const stack: symbol[] = []
let lockedScroll = 0
let savedOverflow = ''

const lockScroll = () => {
  if (lockedScroll++ === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}
const unlockScroll = () => {
  if (lockedScroll > 0 && --lockedScroll === 0) document.body.style.overflow = savedOverflow
}

export function useWOverlay(open: Ref<boolean>, panel: Ref<HTMLElement | null | undefined>, onClose: () => void) {
  const token = Symbol('w-overlay')
  let previous: HTMLElement | null = null

  const focusables = () =>
    Array.from(panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) || [])
      .filter((el) => el.offsetParent !== null || el === document.activeElement)

  const onKeydown = (event: KeyboardEvent) => {
    if (stack[stack.length - 1] !== token) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panel.value) return
    const items = focusables()
    if (items.length === 0) {
      event.preventDefault()
      panel.value.focus()
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const activate = async () => {
    previous = document.activeElement as HTMLElement | null
    stack.push(token)
    lockScroll()
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    // 优先聚焦带 autofocus 的元素，其次面板本身（读屏先读标题），不直接跳到第一个按钮
    const auto = panel.value?.querySelector<HTMLElement>('[autofocus]')
    ;(auto || panel.value)?.focus()
  }

  const deactivate = () => {
    const index = stack.indexOf(token)
    if (index < 0) return
    stack.splice(index, 1)
    unlockScroll()
    document.removeEventListener('keydown', onKeydown)
    if (previous && document.contains(previous)) previous.focus()
    previous = null
  }

  watch(open, (value) => (value ? activate() : deactivate()))
  onMounted(() => { if (open.value) activate() })
  onBeforeUnmount(deactivate)
}
