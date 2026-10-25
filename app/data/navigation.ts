/**
 * 侧栏菜单与路由的对应表（新外壳 components/shell 用；结构、名称、顺序按设计稿 Sidebar.dc.html / AdminSidebar.dc.html）。
 *
 * 维护方式：
 * - 新页面做好后，把对应项的 ready 改成 true（并核对 to / permission）就会出现在侧栏里；ready: false 的项不显示
 * - permission：显示该项所需的权限，有任一即可（all_access / company_all_access 视为全部拥有）；只控制显示，鉴权以后端为准。
 *   一组里一项都不剩时组名也不显示
 * - 高亮：当前路由落在哪一项由 match 决定；没写 match 时按 to 的路径前缀，最长的那项胜出
 *   （/delivery/pickup 高亮「上门揽收」而不是「配送」）
 * - badge：侧栏上的数字（目前只有 putaway：当前仓库待上架件数）
 */
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import type { WIconName } from '~/utils/icons'

export interface NavItem {
  key: string
  /** i18n 键 */
  label: string
  icon: WIconName
  to: RouteLocationRaw
  permission?: string | string[]
  /** 页面已经存在；false 的项先不显示 */
  ready: boolean
  /** 自定义「当前路由属于这一项」，优先于路径前缀 */
  match?: (route: RouteLocationNormalizedLoaded) => boolean
  badge?: 'putaway'
}

export interface NavGroup {
  key: string
  /** i18n 键；首页那一组没有组名 */
  label: string | null
  items: NavItem[]
}

/** 待上架：库存页的「待上架」页签（独立的上架页 PutawayQueue 做好后改到新路由，权限改为 putaway_read） */
const isPendingPutaway = (route: RouteLocationNormalizedLoaded) =>
  route.path.replace(/\/+$/, '') === '/inventory' && route.query.pending_putaway === '1'

export const WMS_NAV: NavGroup[] = [
  {
    key: 'home',
    label: null,
    items: [
      { key: 'home', label: 'nav.home', icon: 'home', to: '/', ready: true,
        match: (route) => route.path === '/' || route.path.startsWith('/dashboard') },
    ],
  },
  {
    key: 'inventory',
    label: 'shell.nav.groups.inventory',
    items: [
      // 库存页内分「结存｜流水」两个页签，不各占菜单项
      { key: 'inventory', label: 'nav.inventory', icon: 'inventory', to: '/inventory', permission: 'inventory_read', ready: true,
        match: (route) => route.path.startsWith('/inventory') && !isPendingPutaway(route) },
      { key: 'goods', label: 'nav.goods', icon: 'goods', to: '/goods', permission: 'goods_read', ready: true },
      { key: 'cycle', label: 'nav.cyclecount', icon: 'cycle', to: '/cyclecount', permission: 'cycle_count_read', ready: true },
      { key: 'adjust', label: 'nav.adjustment', icon: 'adjust', to: '/adjustment', permission: 'adjustment_read', ready: true },
    ],
  },
  {
    key: 'inbound',
    label: 'shell.nav.groups.inbound',
    items: [
      { key: 'asn', label: 'nav.ASN', icon: 'asn', to: '/asn', permission: 'asn_read', ready: true },
      { key: 'sorting', label: 'nav.sorting', icon: 'sorting', to: '/sorting', permission: 'sorting_read', ready: true },
      { key: 'putaway', label: 'shell.nav.putaway', icon: 'putaway', to: { path: '/inventory', query: { pending_putaway: '1' } },
        permission: 'inventory_read', ready: true, match: isPendingPutaway, badge: 'putaway' },
    ],
  },
  {
    key: 'outbound',
    label: 'shell.nav.groups.outbound',
    items: [
      { key: 'dn', label: 'nav.DN', icon: 'dn', to: '/dn', permission: 'dn_read', ready: true },
      { key: 'picking', label: 'nav.picking', icon: 'picking', to: '/picking', permission: 'picking_read', ready: true },
      { key: 'packing', label: 'nav.packing', icon: 'packing', to: '/packing', permission: 'packing_read', ready: true },
      { key: 'delivery', label: 'nav.delivery', icon: 'delivery', to: '/delivery', permission: 'delivery_read', ready: true },
      { key: 'pickup', label: 'nav.pickup', icon: 'pickup', to: '/delivery/pickup', permission: 'delivery_read', ready: true },
    ],
  },
  {
    // 报表 6 项的页面都还没做（report_read / freight_read 是新权限，后端也还没有）
    key: 'reports',
    label: 'shell.nav.groups.reports',
    items: [
      { key: 'report-inbound', label: 'shell.nav.report-inbound', icon: 'report-inbound', to: '/reports/inbound', permission: 'report_read', ready: false },
      { key: 'report-inventory', label: 'shell.nav.report-inventory', icon: 'report-inventory', to: '/reports/inventory', permission: 'report_read', ready: false },
      { key: 'report-outbound', label: 'shell.nav.report-outbound', icon: 'report-outbound', to: '/reports/outbound', permission: 'report_read', ready: false },
      { key: 'report-operator', label: 'shell.nav.report-operator', icon: 'report-operator', to: '/reports/operator', permission: 'report_read', ready: false },
      { key: 'report-stock-summary', label: 'shell.nav.report-stock-summary', icon: 'report-stock-summary', to: '/reports/stock-summary', permission: 'report_read', ready: false },
      { key: 'freight', label: 'shell.nav.freight', icon: 'freight', to: '/reports/freight', permission: 'freight_read', ready: false },
    ],
  },
  {
    key: 'warehouse',
    label: 'shell.nav.groups.warehouse',
    items: [
      { key: 'warehouse', label: 'nav.warehouse', icon: 'warehouse', to: '/warehouse', permission: 'warehouse_read', ready: true },
      { key: 'location', label: 'nav.location', icon: 'location', to: '/location', permission: 'location_read', ready: true },
      { key: 'staff', label: 'nav.staff', icon: 'staff', to: '/staff', permission: 'staff_read', ready: true },
      { key: 'carrier', label: 'nav.carrier', icon: 'carrier', to: '/carrier', permission: 'carrier_read', ready: true },
      { key: 'supplier', label: 'nav.supplier', icon: 'supplier', to: '/supplier', permission: 'supplier_read', ready: true },
      { key: 'recipient', label: 'nav.recipient', icon: 'recipient', to: '/recipient', permission: 'recipient_read', ready: true },
    ],
  },
  {
    key: 'system',
    label: 'shell.nav.groups.system',
    items: [
      { key: 'company', label: 'nav.company', icon: 'company', to: '/company', permission: 'company_read', ready: true },
      { key: 'department', label: 'nav.department', icon: 'department', to: '/department', permission: 'department_read', ready: true },
      // 公司内的角色与权限页还没有（目前只有平台管理端的角色页）
      { key: 'roles', label: 'shell.nav.roles', icon: 'roles', to: '/roles', permission: 'role_read', ready: false },
      { key: 'apikeys', label: 'nav.apikeys', icon: 'apikeys', to: '/apikeys', permission: 'api_keys_read', ready: true },
      { key: 'webhooks', label: 'nav.webhook-logs', icon: 'webhooks', to: '/webhook-logs', permission: 'webhook_read', ready: true },
    ],
  },
]

/** 平台管理端（平台用户，不按权限过滤） */
export const ADMIN_NAV: NavGroup[] = [
  {
    key: 'home',
    label: null,
    items: [
      { key: 'admin-home', label: 'shell.admin-nav.overview', icon: 'admin-home', to: '/admin', ready: true,
        match: (route) => route.path.replace(/\/+$/, '') === '/admin' },
    ],
  },
  {
    key: 'tenants',
    label: 'shell.admin-nav.tenant-group',
    items: [
      { key: 'tenants', label: 'shell.admin-nav.tenants', icon: 'company', to: '/admin/tenants', ready: true },
    ],
  },
  {
    key: 'system',
    label: 'shell.admin-nav.system-group',
    items: [
      { key: 'users', label: 'shell.admin-nav.users', icon: 'staff', to: '/admin/users', ready: true },
      { key: 'roles', label: 'shell.admin-nav.roles', icon: 'roles', to: '/admin/roles', ready: true },
      { key: 'permissions', label: 'shell.admin-nav.permissions', icon: 'permissions', to: '/admin/permissions', ready: true },
      { key: 'logs', label: 'shell.admin-nav.logs', icon: 'logs', to: '/admin/logs', ready: true },
      { key: 'settings', label: 'shell.admin-nav.settings', icon: 'settings', to: '/admin/settings', ready: true },
    ],
  },
]

/** 外壳上暂不开放的功能（机制已做好） */
export const SHELL_FEATURES = {
  /** 深色模式开关：旧页面还没适配深色，先隐藏 */
  themeToggle: false,
} as const

/** to 的路径部分（用于按前缀匹配） */
const pathOf = (to: RouteLocationRaw): string => {
  if (typeof to === 'string') return to
  return 'path' in to && typeof to.path === 'string' ? to.path : ''
}

/** 当前路由对应哪一项（key）；都不匹配时 null */
export function matchNavItem(groups: NavGroup[], route: RouteLocationNormalizedLoaded): string | null {
  const items = groups.flatMap((group) => group.items)
  const custom = items.find((item) => item.match?.(route))
  if (custom) return custom.key
  const path = route.path.replace(/\/+$/, '') || '/'
  let best: NavItem | null = null
  for (const item of items) {
    if (item.match) continue
    const base = pathOf(item.to).replace(/\/+$/, '') || '/'
    if (base === '/') continue
    if ((path === base || path.startsWith(`${base}/`)) && (!best || base.length > pathOf(best.to).length)) best = item
  }
  return best?.key ?? null
}
