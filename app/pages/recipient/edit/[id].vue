<script setup lang="ts">
const route=useRoute()
</script>
<template><RecipientForm :key="String(route.params.id)" :recipient-id="String(route.params.id)" /></template>
