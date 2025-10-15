// plugins/dayjs.client.ts
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export default defineNuxtPlugin((nuxtApp) => {
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