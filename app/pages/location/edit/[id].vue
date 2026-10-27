<script setup lang="ts">const route=useRoute()</script>
<template><LocationForm :key="String(route.params.id)" :location-id="String(route.params.id)" /></template>
