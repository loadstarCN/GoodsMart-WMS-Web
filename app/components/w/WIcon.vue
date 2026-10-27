<script setup lang="ts">
/**
 * 线性图标（路径见 utils/icons.ts）。默认只做装饰（aria-hidden）；
 * 图标单独表达意思时由外层按钮给 aria-label，不在图标上加文字。
 */
import { W_ICONS, type WIconName } from '~/utils/icons'

const props = withDefaults(defineProps<{
  name: WIconName
  size?: number | string
  strokeWidth?: number | string
}>(), {
  size: 16,
  strokeWidth: 1.8,
})

const path = computed(() => W_ICONS[props.name] ?? '')
</script>

<template>
  <svg class="w-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'more'">
      <circle v-for="x in [5, 12, 19]" :key="x" :cx="x" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </template>
    <path v-else :d="path" />
  </svg>
</template>

<style scoped>
.w-icon {
  display: inline-block;
  flex: none;
  vertical-align: middle;
}
</style>
