/**
 * 新建 API 密钥时的权限模板：选中后按模板勾好权限，之后仍可增减。
 *
 * 模板只在新建时帮忙勾选，不和密钥绑定：改这里的模板不影响已经发出去的密钥。
 * 权限名见后端 seed_permissions.py（内置权限不能改名）；名称、说明的 i18n key 为 apikeys.templates.<key>.name / .desc。
 */

export interface ApiKeyTemplate {
  key: string
  permissions: string[]
}

export const API_KEY_TEMPLATES: ApiKeyTemplate[] = [
  {
    // 订单对接（批发站 / 电商平台 / ERP）：建收货通知和发货单，同步商品和收货方，查库存和配送进度
    key: 'order-integration',
    permissions: [
      'goods_read', 'goods_add', 'goods_edit',
      'inventory_read',
      'asn_read', 'asn_edit',
      'dn_read', 'dn_edit',
      'delivery_read',
      'carrier_read',
      'recipient_read', 'recipient_edit',
      'warehouse_read',
    ],
  },
  {
    // 库存同步：只查商品和库存
    key: 'inventory-sync',
    permissions: ['goods_read', 'inventory_read', 'warehouse_read'],
  },
  {
    // 只读查询（报表、BI）：各业务模块只能查看
    key: 'read-only',
    permissions: [
      'goods_read', 'inventory_read',
      'asn_read', 'sorting_read', 'putaway_read',
      'dn_read', 'picking_read', 'packing_read', 'delivery_read',
      'adjustment_read', 'cycle_count_read', 'transfer_read', 'removal_read',
      'carrier_read', 'recipient_read', 'supplier_read', 'warehouse_read', 'location_read',
    ],
  },
]

/** 模板的权限名 → 权限 ID（只取当前可分配的权限；后端没有的权限名跳过） */
export const apiKeyTemplatePermissionIds = (template: ApiKeyTemplate, permissions: { id: number, name: string }[]) => {
  const wanted = new Set(template.permissions)
  return permissions.filter(p => wanted.has(p.name)).map(p => p.id)
}
