<script setup lang="ts">const route=useRoute()</script>
<template><WarehouseForm :key="String(route.params.id)" :warehouse-id="String(route.params.id)" /></template>
