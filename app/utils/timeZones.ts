import { isValidTimeZone } from './date'

/**
 * 仓库时区下拉的候选（IANA 名）：浏览器支持 Intl.supportedValuesOf('timeZone') 时用它的完整列表，
 * 否则用下面常用时区的兜底列表。UTC 总在最前面；当前值不在列表里（如旧别名 Japan）时由下拉自己补上。
 */
const FALLBACK_TIME_ZONES = [
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago', 'America/Denver',
  'America/Halifax', 'America/Lima', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
  'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem',
  'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul',
  'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei', 'Asia/Tehran', 'Asia/Tokyo', 'Asia/Yangon',
  'Atlantic/Reykjavik',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Dublin', 'Europe/Helsinki',
  'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris',
  'Europe/Prague', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Guam', 'Pacific/Honolulu',
]

let cached: string[] | null = null

/** 时区下拉的候选（排好序，UTC 在最前） */
export function supportedTimeZones(): string[] {
  if (cached) return cached
  let zones: string[] = []
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    if (typeof fn === 'function') zones = fn('timeZone')
  } catch {
    zones = []
  }
  if (!zones.length) zones = FALLBACK_TIME_ZONES.filter((tz: string) => isValidTimeZone(tz))
  cached = ['UTC', ...[...new Set(zones)].filter((tz: string) => tz !== 'UTC').sort()]
  return cached
}
