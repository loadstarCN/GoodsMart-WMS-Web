/**
 * 提示消息（toast，设计稿 Patterns「提示条：右上角，几秒后消失；能撤销的带撤销」）：
 * wToast('已保存运单号 3601-2345-6789', 'success', { action: { label: '撤销', onClick } })。
 * 消息排在一个全站共用的队列里，由 components/w/WToastHost（挂在 app.vue）显示；鼠标停在上面时不消失。
 * 旧的 showToast(message, type)（utils/toast.ts）也转到这里，调用方不用改。
 */
import { reactive } from 'vue'

export type WToastTone = 'success' | 'error' | 'warning' | 'info'

export interface WToastAction {
  label: string
  onClick: () => void
}

export interface WToastItem {
  id: number
  message: string
  tone: WToastTone
  action: WToastAction | null
  /** 显示多久（毫秒）；0 = 不自动消失 */
  duration: number
}

export interface WToastOptions {
  action?: WToastAction | null
  duration?: number
}

/** 默认停留：出错的多留一会儿（要看清原因） */
const DURATIONS: Record<WToastTone, number> = { success: 4000, info: 4000, warning: 6000, error: 8000 }
/** 同时最多几条：多了先挤掉最早的 */
const MAX_ITEMS = 4

let seq = 0
const items = reactive<WToastItem[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const wToastItems = (): WToastItem[] => items

export function dismissToast(id: number) {
  const index = items.findIndex((item) => item.id === id)
  if (index >= 0) items.splice(index, 1)
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
}

/** 开始 / 重新开始计时（鼠标移开后从头计） */
export function scheduleToast(id: number) {
  const item = items.find((i) => i.id === id)
  if (!item || !item.duration) return
  const old = timers.get(id)
  if (old) clearTimeout(old)
  timers.set(id, setTimeout(() => dismissToast(id), item.duration))
}

/** 暂停计时（鼠标停在上面、键盘焦点在里面） */
export function pauseToast(id: number) {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
}

export function wToast(message: string, tone: WToastTone = 'success', options: WToastOptions = {}): number {
  const text = String(message ?? '').trim()
  if (!text) return -1
  // 同样的消息正显示着（连点、重复的错误）：不叠第二条，重新计时
  const same = items.find((item) => item.message === text && item.tone === tone)
  if (same) {
    scheduleToast(same.id)
    return same.id
  }
  const id = ++seq
  items.push({ id, message: text, tone, action: options.action ?? null, duration: options.duration ?? DURATIONS[tone] })
  while (items.length > MAX_ITEMS) dismissToast(items[0]!.id)
  scheduleToast(id)
  return id
}
