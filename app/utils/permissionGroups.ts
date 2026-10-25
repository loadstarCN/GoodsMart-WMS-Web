/**
 * 权限的模块分组（角色权限勾选 PermissionSelector、API 密钥列表的权限列共用）。
 *
 * 权限名按「模块前缀_操作」命名（goods_read、cycle_count_edit、adjustment_approve……，见后端 seed_permissions.py）；
 * 新增权限时把它加进对应模块的 ops（或 perms），否则只能靠「全选」授予、列表里也只能显示原名。
 */

export interface PermissionModuleDef {
  /** 模块名的 i18n key */
  label: string
  /** 权限名前缀：权限名 = `${prefix}_${op}` */
  prefix?: string
  /** 该模块有的操作；不写 = 查看 / 编辑 / 删除 */
  ops?: string[]
  /** 某个操作在本模块的说法（如 webhook_edit 实际是「重推」）：op → i18n key */
  opLabels?: Record<string, string>
  /** 不按前缀命名的权限（全局权限等），直接列权限名 */
  perms?: string[]
}

export interface PermissionCategoryDef {
  label: string
  modules: PermissionModuleDef[]
}

export const DEFAULT_PERMISSION_OPS = ['read', 'edit', 'delete']

export const PERMISSION_CATEGORIES: PermissionCategoryDef[] = [
  {
    label: 'admin.permissions.categories.global',
    modules: [
      { label: 'admin.permissions.modules.global', perms: ['all_access', 'company_all_access'] },
      { label: 'admin.permissions.modules.tasks', perms: ['tasks_execute'] },
    ]
  },
  {
    label: 'admin.permissions.categories.system',
    modules: [
      { label: 'admin.permissions.modules.user', prefix: 'user' },
      { label: 'admin.permissions.modules.role', prefix: 'role' },
      { label: 'admin.permissions.modules.permission', prefix: 'permission' },
      { label: 'admin.permissions.modules.logs', prefix: 'logs', ops: ['read', 'create', 'edit', 'delete'] },
      { label: 'admin.permissions.modules.limiter', prefix: 'limiter' },
      { label: 'admin.permissions.modules.api-keys', prefix: 'api_keys' },
      // webhook_edit = 手动重推推送失败 / 待发送的事件
      { label: 'admin.permissions.modules.webhook', prefix: 'webhook', ops: ['read', 'edit'], opLabels: { edit: 'admin.permissions.ops.retry' } },
    ]
  },
  {
    label: 'admin.permissions.categories.master-data',
    modules: [
      { label: 'admin.permissions.modules.company', prefix: 'company' },
      { label: 'admin.permissions.modules.staff', prefix: 'staff' },
      { label: 'admin.permissions.modules.department', prefix: 'department' },
      { label: 'admin.permissions.modules.warehouse', prefix: 'warehouse' },
      { label: 'admin.permissions.modules.location', prefix: 'location' },
      { label: 'admin.permissions.modules.supplier', prefix: 'supplier' },
      { label: 'admin.permissions.modules.carrier', prefix: 'carrier' },
      { label: 'admin.permissions.modules.recipient', prefix: 'recipient' },
    ]
  },
  {
    label: 'admin.permissions.categories.goods',
    modules: [
      { label: 'admin.permissions.modules.goods', prefix: 'goods', ops: ['read', 'edit', 'delete', 'add'] },
      { label: 'admin.permissions.modules.inventory', prefix: 'inventory' },
    ]
  },
  {
    label: 'admin.permissions.categories.inbound',
    modules: [
      // asn_receive = 收货、刷新到货跟踪（作业员用；不能新建 / 修改 / 关闭 / 取消收货通知）
      { label: 'admin.permissions.modules.asn', prefix: 'asn', ops: ['read', 'edit', 'receive', 'delete'] },
      { label: 'admin.permissions.modules.putaway', prefix: 'putaway', ops: ['read', 'edit'] },
    ]
  },
  {
    label: 'admin.permissions.categories.outbound',
    modules: [
      { label: 'admin.permissions.modules.dn', prefix: 'dn' },
      { label: 'admin.permissions.modules.picking', prefix: 'picking' },
      { label: 'admin.permissions.modules.sorting', prefix: 'sorting' },
      { label: 'admin.permissions.modules.packing', prefix: 'packing' },
      { label: 'admin.permissions.modules.delivery', prefix: 'delivery' },
      { label: 'admin.permissions.modules.payment', prefix: 'payment' },
    ]
  },
  {
    label: 'admin.permissions.categories.inventory-ops',
    modules: [
      { label: 'admin.permissions.modules.adjustment', prefix: 'adjustment', ops: ['read', 'edit', 'approve', 'delete'] },
      // cycle_count_execute = 开始盘点、录入实盘数、完成明细 / 盘点单（作业员用；不能新建 / 修改盘点单）
      { label: 'admin.permissions.modules.cycle-count', prefix: 'cycle_count', ops: ['read', 'edit', 'execute', 'delete'], opLabels: { execute: 'admin.permissions.ops.count' } },
      { label: 'admin.permissions.modules.transfer', prefix: 'transfer', ops: ['read', 'edit'] },
      { label: 'admin.permissions.modules.removal', prefix: 'removal', ops: ['read', 'edit'] },
    ]
  },
]

/** 标准操作的 i18n key */
export const PERMISSION_OP_LABELS: Record<string, string> = {
  read: 'admin.permissions.ops.read',
  edit: 'admin.permissions.ops.edit',
  delete: 'admin.permissions.ops.delete',
  add: 'admin.permissions.ops.add',
  create: 'admin.permissions.ops.create',
  execute: 'admin.permissions.ops.execute',
  approve: 'admin.permissions.ops.approve',
  retry: 'admin.permissions.ops.retry',
  receive: 'admin.permissions.ops.receive',
}

/** 模块里某个操作的 i18n key（模块自己的说法优先） */
export const permissionOpLabelKey = (mod: PermissionModuleDef, op: string): string =>
  mod.opLabels?.[op] || PERMISSION_OP_LABELS[op] || op

export interface PermissionModuleSummary {
  /** 模块名的 i18n key */
  label: string
  /** 已有的操作（按模块定义的顺序）：opLabel 为 i18n key；全局权限等没有操作的，opLabel 为 null、name 为权限名 */
  items: { name: string; opLabel: string | null }[]
}

/**
 * 权限名列表 → 按模块归并（顺序同 PERMISSION_CATEGORIES），认不出的权限名放进 others 原样显示。
 *   ['goods_read', 'goods_edit', 'dn_read', 'foo'] → modules: [商品: 查看 / 编辑, 出库通知: 查看], others: ['foo']
 */
export function summarizePermissions(names: readonly string[] | null | undefined): {
  modules: PermissionModuleSummary[]
  others: string[]
} {
  const remaining = new Set((names || []).filter(Boolean))
  const modules: PermissionModuleSummary[] = []
  for (const cat of PERMISSION_CATEGORIES) {
    for (const mod of cat.modules) {
      const items: PermissionModuleSummary['items'] = []
      if (mod.perms) {
        for (const name of mod.perms) {
          if (remaining.delete(name)) items.push({ name, opLabel: null })
        }
      } else if (mod.prefix) {
        for (const op of mod.ops || DEFAULT_PERMISSION_OPS) {
          const name = `${mod.prefix}_${op}`
          if (remaining.delete(name)) items.push({ name, opLabel: permissionOpLabelKey(mod, op) })
        }
      }
      if (items.length) modules.push({ label: mod.label, items })
    }
  }
  return { modules, others: [...remaining] }
}
