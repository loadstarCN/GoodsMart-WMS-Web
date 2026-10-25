<script setup lang="ts">
/**
 * 搜索结果里的一段文字：按后端给的 highlights（utils/searchHighlight）给命中部分加底色，不自己再匹配关键字。
 * insertAt + insertText：在原文的某个位置前插入一段不高亮的文字（副标题里命中商品那一部分前的「含」）。
 */
import type { GlobalSearchHighlight } from '~/utils/globalSearch'

const props = withDefaults(defineProps<{
  text: string | null | undefined
  highlights?: GlobalSearchHighlight[]
  /** code / title / subtitle / columns.<列> */
  field: string
  insertAt?: number | null
  insertText?: string
}>(), {
  highlights: () => [],
  insertAt: null,
  insertText: '',
})

const parts = computed(() => {
  const text = props.text ?? ''
  const ranges = highlightRanges(props.highlights, props.field, text.length)
  return highlightParts(text, ranges, props.insertAt !== null ? [props.insertAt] : [])
})
</script>

<template>
  <template v-for="part in parts" :key="part.start"><span v-if="insertText && part.start === insertAt" class="w-hl-insert">{{ insertText }}</span><mark v-if="part.hit" class="w-hl">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
</template>

<style scoped>
.w-hl {
  padding: 0;
  border-radius: 2px;
  background: var(--w-mark);
  color: var(--w-text-1);
}
.w-hl-insert { color: var(--w-text-2); }
</style>
