// plugins/dayjs.client.ts
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ja'

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

  // 注入全局方法（网页7方案）
  nuxtApp.provide('dayjs', (date?: dayjs.ConfigType, format?: string):string => {
    if (date === null || date === undefined || date === '') {
      return ''
    }
    const instance = dayjs.isDayjs(date)
      ? date
      : dayjs(date || new Date())

    return format ? instance.format(format) : instance.fromNow()
  })
})
