<script setup lang="ts">
const props = withDefaults(defineProps<{
  goods?: { thumbnail_url?: string | null; image_url?: string | null } | null
  fullSize?: boolean
  alt?: string
  size?: number
}>(), { size: 36, alt: '' })

const sources = computed(() => {
  const thumb = props.goods?.thumbnail_url?.trim()
  const image = props.goods?.image_url?.trim()
  const ordered = props.fullSize ? [image, thumb] : [thumb, image]
  return [...new Set([...ordered.filter((url): url is string => !!url), '/images/goods/default.png'])]
})
const index = ref(0)
watch([() => props.goods?.thumbnail_url, () => props.goods?.image_url, () => props.fullSize], () => { index.value = 0 }, { flush: 'sync' })
function useFallback(event: Event) {
  if ((event.currentTarget as HTMLImageElement).getAttribute('src') === sources.value[index.value] && index.value < sources.value.length - 1) index.value++
}
</script>

<template>
  <img class="goods-thumbnail" :key="sources[index]" :src="sources[index]" :width="size" :height="size"
    :alt="alt" :loading="fullSize ? 'eager' : 'lazy'" decoding="async" @error="useFallback">
</template>

<style scoped>
.goods-thumbnail { display: block; flex: none; object-fit: contain; border-radius: 6px; background: var(--w-surface); }
</style>
