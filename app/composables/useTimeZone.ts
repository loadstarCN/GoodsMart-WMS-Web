/**
 * 时刻按哪个时区显示 / 输入（后端 doc/timezone-utc.md §4）：
 *   显式给的（记录上仓库的时区 / 接口顶层的 timezone）→ 上层组件提供的（流程组件 provideTimeZone）
 *   → 页头选中的仓库 → 浏览器时区。
 *
 * 「记录」可以是 IANA 名、仓库 id（数字），或带仓库信息的对象：
 *   record.timezone → 嵌入的 warehouse.timezone → 嵌入的 dn / asn / task / location 的（递归两层）
 *   → 按 warehouse_id（或嵌入 warehouse 的 id）在页头仓库下拉的列表里查。
 * 列表逐行传行对象（$dayjs(row.updated_at, 'YYYY-MM-DD HH:mm', row)），详情页传详情对象。
 */
import type { ComputedRef, InjectionKey, MaybeRefOrGetter } from 'vue'

/** 能解析出时区的东西：IANA 名、仓库 id（数字或数字字符串），或带仓库信息的记录 */
export type TimeZoneSource = string | number | Record<string, any> | null | undefined

const NESTED_KEYS = ['warehouse', 'dn', 'asn', 'task', 'delivery_task', 'location'] as const

/** 页头仓库下拉里该仓库的时区（员工信息 /staff/current 的 warehouses；旧缓存 / 旧后端没有时 null） */
export function warehouseTimeZone(id: unknown): string | null {
  if (id === null || id === undefined || id === '') return null
  const store = useWarehouseStore()
  const all = [store.currentWarehouse, ...store.warehouses]
  const found = all.find((w: WarehouseSimple | null) => !!w && String(w.id) === String(id))
  return found && isValidTimeZone(found.timezone) ? found.timezone : null
}

/** 页头选中的仓库的时区；选「全部仓库」或没有时 null */
export function selectedWarehouseTimeZone(): string | null {
  const current = useWarehouseStore().currentWarehouse
  return current && isValidTimeZone(current.timezone) ? current.timezone : null
}

/** 记录（及嵌入的对象）上直接给的时区 */
const explicitTimeZone = (record: Record<string, any>, depth: number): string | null => {
  if (isValidTimeZone(record.timezone)) return record.timezone
  if (depth >= 2) return null
  for (const key of NESTED_KEYS) {
    const nested = record[key]
    if (nested && typeof nested === 'object') {
      const tz = explicitTimeZone(nested, depth + 1)
      if (tz) return tz
    }
  }
  return null
}

/** 按记录（及嵌入的对象）的仓库 id 查 */
const lookupTimeZone = (record: Record<string, any>, depth: number): string | null => {
  const byId = warehouseTimeZone(record.warehouse_id) || (record.warehouse && typeof record.warehouse === 'object'
    ? warehouseTimeZone(record.warehouse.id) : null)
  if (byId || depth >= 2) return byId
  for (const key of NESTED_KEYS) {
    const nested = record[key]
    if (key !== 'warehouse' && nested && typeof nested === 'object') {
      const tz = lookupTimeZone(nested, depth + 1)
      if (tz) return tz
    }
  }
  return null
}

/** 一个来源的时区；看不出时 null */
export function recordTimeZone(source: TimeZoneSource): string | null {
  if (source === null || source === undefined || source === '') return null
  if (typeof source === 'string') {
    if (/^\d+$/.test(source)) return warehouseTimeZone(source)
    return isValidTimeZone(source) ? source : null
  }
  if (typeof source === 'number') return warehouseTimeZone(source)
  if (typeof source !== 'object') return null
  return explicitTimeZone(source, 0) || lookupTimeZone(source, 0)
}

/** 依次看各来源 → 页头选中的仓库 → 浏览器（模板里的 $dayjs、非组件代码用；组件里用 useTimeZone） */
export function resolveTimeZone(...sources: TimeZoneSource[]): string {
  for (const source of sources) {
    const tz = recordTimeZone(source)
    if (tz) return tz
  }
  return selectedWarehouseTimeZone() || browserTimeZone()
}

const TIME_ZONE_KEY: InjectionKey<ComputedRef<string | null>> = Symbol('wms-time-zone')

/**
 * 给子组件提供时区（发货 / 入库流程：接口顶层的 timezone，没有时 DN / ASN 的仓库）；
 * 子组件 useTimeZone() 不传来源时用它。返回解析后的时区（含页头 / 浏览器兜底）
 */
export function provideTimeZone(...sources: MaybeRefOrGetter<TimeZoneSource>[]): ComputedRef<string> {
  const provided = computed<string | null>(() => {
    for (const source of sources) {
      const tz = recordTimeZone(toValue(source))
      if (tz) return tz
    }
    return null
  })
  provide(TIME_ZONE_KEY, provided)
  return computed(() => provided.value || selectedWarehouseTimeZone() || browserTimeZone())
}

/**
 * 组件里的时区与格式化：source（记录 / IANA 名 / 仓库 id）→ 上层 provideTimeZone → 页头仓库 → 浏览器。
 * - format：dayjs 风格的格式（同模板里的 $dayjs 带格式），时区与浏览器不同时带缩写
 * - formatLocale：按界面语言的「日期 + 时分」（流程各步的时刻）
 * - toInputValue / fromInputValue：<input type="datetime-local"> 的值按这个时区的墙上时间
 * - toOffsetIso：提交给后端的时刻（带这个时区的偏移）
 */
export function useTimeZone(source?: MaybeRefOrGetter<TimeZoneSource>) {
  const injected = inject(TIME_ZONE_KEY, null)
  const { localeProperties } = useI18n()
  const timeZone = computed<string>(() =>
    recordTimeZone(toValue(source)) || injected?.value || selectedWarehouseTimeZone() || browserTimeZone())
  /** 与浏览器时区的墙上时间不同（此刻的偏移不同）：界面要标出时区 */
  const differs = computed(() => !sameWallTime(timeZone.value, browserTimeZone()))
  const abbr = computed(() => timeZoneAbbr(timeZone.value))
  const description = computed(() => timeZoneDescription(timeZone.value))
  const locale = computed(() => String(localeProperties.value?.iso || '') || undefined)
  return {
    timeZone,
    differs,
    abbr,
    description,
    format: (value: unknown, pattern = 'YYYY-MM-DD HH:mm:ss', options: { withZone?: boolean } = {}) =>
      formatInTimeZone(value, pattern, timeZone.value, options),
    formatLocale: (value: string | Date | null | undefined) => formatLocaleDateTime(value, locale.value, timeZone.value),
    toInputValue: (date: Date = new Date()) => toDateTimeLocalValue(date, timeZone.value),
    fromInputValue: (value: string | null | undefined) => fromDateTimeLocalValue(value, timeZone.value),
    toOffsetIso: (date: Date) => toOffsetIsoString(date, timeZone.value),
    today: () => zonedToday(timeZone.value),
  }
}
