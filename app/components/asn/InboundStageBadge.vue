<script lang="ts" setup>
/**
 * 入库阶段徽章（ASN 列表、入库单详情的流程）：stage 为空（旧后端没有该字段）时不显示
 */
import { inboundStageColor } from '~/composables/asn/inboundFlow'

const props = defineProps<{
  stage?: string | null
}>()

const { t, te } = useI18n()

const text = computed(() => {
  const key = `asn.flow.stage.${props.stage}`
  return te(key) ? t(key) : String(props.stage || '')
})
const cls = computed(() => {
  const color = inboundStageColor(props.stage)
  return color === 'light' ? 'bg-light text-default' : `bg-${color}-transparent`
})
</script>

<template>
  <span class="badge" :class="cls" v-if="stage">{{ text }}</span>
</template>
