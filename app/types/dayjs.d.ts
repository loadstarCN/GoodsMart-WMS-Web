// $dayjs 全局格式化（plugins 里注册）的类型。必须是模块（带 import / export）：
// 否则 declare module 会整个替换掉 #app、vue 的类型，ref / computed / useCookie 等都会「不存在」
import type { Dayjs } from 'dayjs'

declare module '#app' {
  interface NuxtApp {
    $dayjs: (
      date?: string | number | Date | Dayjs | null,
      format?: string
    ) => string
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $dayjs: (
      date?: string | number | Date | Dayjs | null,
      format?: string
    ) => string
  }
}

export {}
