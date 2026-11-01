<script setup lang="ts">const route=useRoute()</script>
<template><div class="carrier-detail"><CarrierForm :key="String(route.params.id)" :carrier-id="String(route.params.id)" readonly /><CarrierFreightSettings :carrier-id="String(route.params.id)"/></div></template>
<style scoped>.carrier-detail{display:flex;flex-direction:column;gap:20px}</style>
