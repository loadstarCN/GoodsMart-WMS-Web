<script setup lang="ts">
const route=useRoute()
</script>
<template><SupplierForm :key="String(route.params.id)" :supplier-id="String(route.params.id)" /></template>
