/**
 * 确认框 / 提示框（设计稿 Patterns 的「取消 FedEx 运单？」弹窗）：Promise 写法，替代 sweetalert 的 showConfirm / showAlert。
 *   if (!(await wConfirm({ title, message, confirmText, cancelText: '先不取消', danger: true }))) return
 *   await wAlert({ title, message, tone: 'error' })
 * 由 components/w/WDialogHost（挂在 app.vue）显示，一次一个，后来的排队。危险操作的确认按钮是红底（danger），
 * 取消按钮写明「先不……」一类的话；提示框只有一个「知道了」。
 */
import { reactive } from 'vue'

export interface WConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（取消、删除、作废）：确认按钮红底 */
  danger?: boolean
}

export interface WAlertOptions {
  title: string
  message?: string
  tone?: 'info' | 'warning' | 'error'
  okText?: string
}

export interface WDialogRequest {
  id: number
  kind: 'confirm' | 'alert'
  title: string
  message: string
  confirmText: string | null
  cancelText: string | null
  danger: boolean
  tone: 'info' | 'warning' | 'error'
  resolve: (value: boolean) => void
}

let seq = 0
const queue = reactive<WDialogRequest[]>([])

export const wDialogQueue = (): WDialogRequest[] => queue

/** 关掉当前的（队首），把结果交给调用方 */
export function settleDialog(id: number, value: boolean) {
  const index = queue.findIndex((item) => item.id === id)
  if (index < 0) return
  const [item] = queue.splice(index, 1)
  item?.resolve(value)
}

export function wConfirm(options: WConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({
      id: ++seq, kind: 'confirm', title: options.title, message: options.message ?? '',
      confirmText: options.confirmText ?? null, cancelText: options.cancelText ?? null,
      danger: !!options.danger, tone: 'info', resolve,
    })
  })
}

export function wAlert(options: WAlertOptions): Promise<void> {
  return new Promise((resolve) => {
    queue.push({
      id: ++seq, kind: 'alert', title: options.title, message: options.message ?? '',
      confirmText: options.okText ?? null, cancelText: null, danger: false, tone: options.tone ?? 'info',
      resolve: () => resolve(),
    })
  })
}
