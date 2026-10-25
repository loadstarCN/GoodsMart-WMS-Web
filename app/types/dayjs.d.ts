// $dayjs 全局格式化（plugins 里注册）的类型。必须是模块（带 import / export）：
// 否则 declare module 会整个替换掉 #app、vue 的类型，ref / computed / useCookie 等都会「不存在」
import type { Dayjs } from 'dayjs'
import type { TimeZoneSource } from '~/composables/useTimeZone'

/** $dayjs(value, format?, zone?)：zone = IANA 名 / 仓库 id / 带仓库信息的记录（不传 = 页头选中的仓库 → 浏览器） */
type DayjsFormatter = (
  date?: string | number | Date | Dayjs | null,
  format?: string,
  zone?: TimeZoneSource
) => string

declare module '#app' {
  interface NuxtApp {
    $dayjs: DayjsFormatter
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $dayjs: DayjsFormatter
  }
}

export {}
