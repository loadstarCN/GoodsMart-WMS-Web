<script lang="ts" setup>
/**
 * 发货阶段徽章（DN 列表、配送列表、出库单详情的页头）：stage 为空（旧后端没有该字段）时不显示
 */
import { shippingStageColor } from '~/composables/shipping/shippingFlow'

const props = defineProps<{
  stage?: string | null
}>()

const { t, te } = useI18n()

const text = computed(() => {
  const key = `shipping.stage.${props.stage}`
  return te(key) ? t(key) : String(props.stage || '')
})
const cls = computed(() => {
  const color = shippingStageColor(props.stage)
  return color === 'light' ? 'bg-light text-default' : `bg-${color}-transparent`
})
</script>

<template>
  <span class="badge" :class="cls" v-if="stage">{{ text }}</span>
</template>
