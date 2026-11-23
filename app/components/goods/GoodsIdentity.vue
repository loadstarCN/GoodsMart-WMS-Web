<script setup lang="ts">
defineProps<{ goods?: { thumbnail_url?: string | null; image_url?: string | null } | null }>()
</script>

<template>
  <div class="goods-identity">
    <GoodsThumbnail :goods="goods" />
    <div class="goods-identity__text"><slot /></div>
  </div>
</template>

<style scoped>
.goods-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.goods-identity__text { min-width: 0; overflow-wrap: anywhere; }
</style>
