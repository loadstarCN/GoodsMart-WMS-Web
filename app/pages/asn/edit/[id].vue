<script setup lang="ts">
definePageMeta({})
const route = useRoute()
</script>
<template><AsnForm :key="String(route.params.id)" :asn-id="String(route.params.id)" /></template>
