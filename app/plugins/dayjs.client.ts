// plugins/dayjs.client.ts
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ja'
import type { TimeZoneSource } from '~/composables/useTimeZone'

dayjs.extend(relativeTime)

// i18n locale code -> dayjs locale
const DAYJS_LOCALES: Record<string, string> = {
  en: 'en',
  zh: 'zh-cn',
  ja: 'ja',
}

export default defineNuxtPlugin((nuxtApp) => {
  // 跟随 i18n 当前语言切换 dayjs locale
  const i18n = nuxtApp.$i18n as any
  const applyLocale = (code: unknown) => {
    dayjs.locale(DAYJS_LOCALES[String(code)] || 'en')
  }
  if (i18n?.locale) {
    applyLocale(unref(i18n.locale))
    watch(() => unref(i18n.locale), applyLocale)
  }

  /**
   * 模板里的时刻格式化：$dayjs(value, format?, zone?)
   * - 带 format（YYYY-MM-DD HH:mm:ss 等）：按时区显示（zone = IANA 名 / 仓库 id / 记录，见 composables/useTimeZone；
   *   不传 = 页头选中的仓库 → 浏览器），与浏览器时区不同时后面标出时区缩写；只有日期的值（YYYY-MM-DD）原样
   * - 不带 format：相对时间（3 小时前）。不带时区的旧值按该时区的墙上时间解释
   */
  nuxtApp.provide('dayjs', (date?: dayjs.ConfigType, format?: string, zone?: TimeZoneSource): string => {
    if (date === null || date === undefined || date === '') {
      return ''
    }
    const value = dayjs.isDayjs(date) ? date.toDate() : date
    const timeZone = resolveTimeZone(zone)
    if (format) return formatInTimeZone(value, format, timeZone)
    const parsed = parseDateTime(value, timeZone)
    return parsed ? dayjs(parsed).fromNow() : String(value)
  })
})
