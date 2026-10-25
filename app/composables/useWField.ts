/**
 * 表单字段上下文：WField 提供控件 id、说明 / 出错文字的 id、是否出错，
 * 里面的 WInput / WSelect / WCheckbox 等自动接上 id、aria-describedby、aria-invalid（不在 WField 里时都为空）。
 */
import type { ComputedRef, InjectionKey } from 'vue'

export interface WFieldContext {
  /** 控件 id（label 的 for 指向它） */
  id: ComputedRef<string>
  /** 说明 / 出错文字的 id（空格分隔），没有时 undefined */
  describedBy: ComputedRef<string | undefined>
  invalid: ComputedRef<boolean>
  required: ComputedRef<boolean>
}

export const W_FIELD_KEY: InjectionKey<WFieldContext> = Symbol('w-field')

export function useWField(): WFieldContext | null {
  return inject(W_FIELD_KEY, null)
}
