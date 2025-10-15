declare module '#app' {
    interface NuxtApp {
      $dayjs: (
        date?: string | number | Date | dayjs.Dayjs,
        format?: string
      ) => string
    }
  }

declare module '@vue/runtime-core' {
    interface ComponentCustomProperties {
      $dayjs: (
        date?: string | number | Date | dayjs.Dayjs,
        format?: string
      ) => string
    }
  }