<script setup lang="ts">
definePageMeta({})
const route = useRoute()
</script>

<template><DnForm :key="String(route.params.id)" :dn-id="String(route.params.id)" /></template>
