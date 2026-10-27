<script setup lang="ts">
const route=useRoute()
</script>
<template><GoodsForm :key="String(route.params.id)" :goods-id="String(route.params.id)" /></template>
