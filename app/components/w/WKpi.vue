<script setup lang="ts">
/**
 * 关键数字卡：标签 12 · 数字 20（size="s"）或 28（size="l"，每块区域只一个）· 说明 12。
 * 不铺底色，需要提示状态时在标签前加圆点（tone）；数字一律正文色。传 to 时整卡可点（进对应列表 / 筛选）。
 */
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  label: string
  value: number | string | null | undefined
  unit?: string
  caption?: string
  tone?: 'ok' | 'warn' | 'bad' | 'info' | null
  size?: 's' | 'l'
  to?: RouteLocationRaw
}>(), {
  tone: null,
  size: 's',
})

const { locale } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')
const display = computed(() =>
  typeof props.value === 'number' ? props.value.toLocaleString(locale.value) : (props.value ?? ''))
</script>

<template>
  <component :is="to ? NuxtLink : 'div'" :to="to" class="w-kpi" :class="[`w-kpi--${size}`, { 'is-link': !!to }]">
    <span class="w-kpi__label">
      <span v-if="tone" class="w-kpi__dot" :class="`is-${tone}`" aria-hidden="true" />
      {{ label }}
    </span>
    <span class="w-kpi__value-row">
      <span class="w-kpi__value">{{ display }}</span>
      <span v-if="unit" class="w-kpi__unit">{{ unit }}</span>
    </span>
    <span v-if="caption || $slots.caption" class="w-kpi__caption"><slot name="caption">{{ caption }}</slot></span>
  </component>
</template>

<style scoped>
.w-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--w-sp-16);
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
  color: var(--w-text-1);
  font-family: var(--w-font);
  text-decoration: none;
}
.w-kpi.is-link { transition: border-color 0.12s; }
.w-kpi.is-link:hover { border-color: var(--w-sel-line); color: var(--w-text-1); }
.w-kpi.is-link:focus-visible { outline: none; border-color: var(--w-sel); box-shadow: var(--w-focus-ring); }
.w-kpi__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  color: var(--w-text-2);
}
.w-kpi__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--w-radius-pill);
  background: var(--w-none-dot);
}
.w-kpi__dot.is-ok { background: var(--w-ok-dot); }
.w-kpi__dot.is-warn { background: var(--w-warn-dot); }
.w-kpi__dot.is-bad { background: var(--w-bad-dot); }
.w-kpi__dot.is-info { background: var(--w-info-dot); }
.w-kpi__value-row {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.w-kpi__value {
  font-size: var(--w-fs-20);
  line-height: var(--w-lh-20);
  font-weight: var(--w-fw-semibold);
  font-variant-numeric: tabular-nums;
}
.w-kpi--l .w-kpi__value {
  font-size: var(--w-fs-28);
  line-height: var(--w-lh-28);
}
.w-kpi__unit {
  font-size: var(--w-fs-13);
  color: var(--w-text-2);
}
.w-kpi__caption {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
</style>
