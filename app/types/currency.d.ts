// types/currency.d.ts

declare module '#app' {
  interface NuxtApp {
    $currency: (
      value: number,
      options?: CurrencyOptions
    ) => string
  }
}

declare module '@vue/runtime-core' {
  export interface ComponentCustomProperties {
    $currency: (
      value: number,
      options?: CurrencyOptions
    ) => string
  }
}

export {}