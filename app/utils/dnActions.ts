/**
 * 发货单的单据操作（列表行的「更多」、详情页右上角的「更多」共用）：能不能做、不能做的原因。
 * 规则与后端一致：编辑 / 开始作业 / 关闭 / 删除只对待处理（pending）；取消对处理中 / 已拣货 / 已打包（已发货、已完成不能取消，
 * 16052）；修改收件地址在发货、关闭之前（建运单 / 导出后由后端锁定，弹窗里说明）。没有权限的操作不列出。
 */
export type DnAction = 'ship-to' | 'edit' | 'start' | 'close' | 'cancel' | 'delete'

export interface DnActionState {
  key: DnAction
  /** 有权限（没有权限的不显示） */
  allowed: boolean
  enabled: boolean
  /** 不能做时的原因（dn.actions.reasons.* 的键） */
  reason: string | null
}

/** 可以取消的状态（已发货 / 已完成不能取消） */
export const DN_CANCELLABLE_STATUSES = ['in_progress', 'picked', 'packed']
/** 已拣 / 已打包：取消后货退回待上架 */
export const DN_PICKED_STATUSES = ['picked', 'packed']

const SHIPPED = ['delivered', 'completed']

export function dnActionStates(status: string | null | undefined, can: (...permissions: string[]) => boolean,
  keys: DnAction[] = ['ship-to', 'edit', 'start', 'close', 'cancel', 'delete']): DnActionState[] {
  const s = String(status || '')
  const pending = s === 'pending'
  const pendingOnly = (key: DnAction, permission: string): DnActionState => ({
    key, allowed: can(permission), enabled: pending, reason: pending ? null : `pending-only-${key}`,
  })
  return keys.map((key): DnActionState => {
    switch (key) {
      case 'ship-to': {
        const allowed = can('dn_edit', 'packing_edit', 'delivery_edit')
        if (SHIPPED.includes(s)) return { key, allowed, enabled: false, reason: 'ship-to-shipped' }
        if (s === 'closed') return { key, allowed, enabled: false, reason: 'closed' }
        return { key, allowed, enabled: true, reason: null }
      }
      case 'cancel': {
        const allowed = can('dn_edit')
        if (DN_CANCELLABLE_STATUSES.includes(s)) return { key, allowed, enabled: true, reason: null }
        if (SHIPPED.includes(s)) return { key, allowed, enabled: false, reason: 'cancel-shipped' }
        if (s === 'closed') return { key, allowed, enabled: false, reason: 'closed' }
        return { key, allowed, enabled: false, reason: 'cancel-pending' }
      }
      case 'delete':
        return pendingOnly(key, 'dn_delete')
      default:
        return pendingOnly(key, 'dn_edit')
    }
  })
}
