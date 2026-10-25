<script setup lang="ts">
/**
 * 按钮：主 / 次 / 文字 / 危险（红字次按钮）/ 危险确认（红底，只在确认弹窗里用）。
 * 尺寸：md = 页面按钮 36，sm = 行内按钮 28（紧凑密度下 32 / 24）。
 * 传 to 时渲染成链接（NuxtLink），外观相同；disabled / loading 时不可点击。
 */
import type { RouteLocationRaw } from 'vue-router'
import type { WIconName } from '~/utils/icons'

export type WButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'danger-confirm'

const props = withDefaults(defineProps<{
  variant?: WButtonVariant
  size?: 'md' | 'sm'
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  disabled?: boolean
  /** 撑满一行 */
  block?: boolean
  /** 文字前的图标 */
  icon?: WIconName
  /** 只有图标、没有文字时必须给 aria-label */
  iconOnly?: boolean
  to?: RouteLocationRaw
}>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
  loading: false,
  disabled: false,
  block: false,
  iconOnly: false,
})

const inactive = computed(() => props.disabled || props.loading)
const classes = computed(() => [
  'w-btn',
  `w-btn--${props.variant}`,
  `w-btn--${props.size}`,
  { 'w-btn--block': props.block, 'w-btn--icon-only': props.iconOnly, 'is-loading': props.loading },
])
const iconSize = computed(() => (props.size === 'sm' ? 14 : 16))
</script>

<template>
  <NuxtLink v-if="to && !inactive" :to="to" :class="classes">
    <WIcon v-if="icon" :name="icon" :size="iconSize" />
    <slot />
  </NuxtLink>
  <button v-else :type="type" :class="classes" :disabled="inactive" :aria-busy="loading || undefined">
    <span v-if="loading" class="w-btn__spinner" aria-hidden="true" />
    <WIcon v-else-if="icon" :name="icon" :size="iconSize" />
    <slot />
  </button>
</template>

<style scoped>
.w-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: var(--w-control-h);
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--w-radius-control);
  background: transparent;
  font: inherit;
  font-family: var(--w-font);
  font-size: var(--w-fs-14);
  line-height: 20px;
  font-weight: var(--w-fw-medium);
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s;
}
.w-btn--sm {
  height: var(--w-control-h-inline);
  padding: 0 10px;
  font-size: var(--w-fs-13);
  gap: 4px;
}
.w-btn--block { display: flex; width: 100%; }
.w-btn--icon-only { padding: 0; width: var(--w-control-h); }
.w-btn--icon-only.w-btn--sm { width: var(--w-control-h-inline); }
.w-btn:focus-visible {
  outline: none;
  border-color: var(--w-sel);
  box-shadow: var(--w-focus-ring);
}

.w-btn--primary {
  padding-inline: 16px;
  background: var(--w-pri);
  border-color: var(--w-pri);
  color: var(--w-on-pri);
  font-weight: var(--w-fw-semibold);
}
.w-btn--primary:hover:not(:disabled) { background: var(--w-pri-hover); border-color: var(--w-pri-hover); color: var(--w-on-pri); }
.w-btn--primary:focus-visible { border-color: var(--w-pri); }

.w-btn--secondary {
  background: var(--w-surface);
  border-color: var(--w-border-strong);
  color: var(--w-text-1);
}
.w-btn--secondary:hover:not(:disabled) { background: var(--w-surface-2); color: var(--w-text-1); }

.w-btn--text {
  padding-inline: 8px;
  color: var(--w-link);
}
.w-btn--text:hover:not(:disabled) { background: var(--w-sel-soft); color: var(--w-link-hover); }

.w-btn--danger {
  background: var(--w-surface);
  border-color: var(--w-bad-border);
  color: var(--w-bad-text);
}
.w-btn--danger:hover:not(:disabled) { background: var(--w-bad-bg); color: var(--w-bad-text); }

.w-btn--danger-confirm {
  background: var(--w-danger);
  border-color: var(--w-danger);
  color: var(--w-on-pri);
  font-weight: var(--w-fw-semibold);
}
.w-btn--danger-confirm:hover:not(:disabled) { filter: brightness(0.92); color: var(--w-on-pri); }

/* 禁用：灰底灰字；加载中保持原来的颜色，只是不能再点 */
.w-btn:disabled:not(.is-loading) {
  cursor: not-allowed;
  background: var(--w-disabled-bg);
  border-color: var(--w-disabled-border);
  color: var(--w-disabled-text);
}
.w-btn--text:disabled:not(.is-loading) { background: transparent; border-color: transparent; }
.w-btn.is-loading { cursor: progress; }

.w-btn__spinner {
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: var(--w-radius-pill);
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: w-btn-spin 0.7s linear infinite;
}
@keyframes w-btn-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .w-btn__spinner { animation-duration: 2s; }
}
</style>
