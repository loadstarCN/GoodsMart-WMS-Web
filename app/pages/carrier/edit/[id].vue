<script setup lang="ts">const route=useRoute()</script>
<template><CarrierForm :key="String(route.params.id)" :carrier-id="String(route.params.id)" /></template>
