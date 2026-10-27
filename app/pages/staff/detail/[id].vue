<script setup lang="ts">const route=useRoute()</script>
<template><StaffForm :key="String(route.params.id)" :staff-id="String(route.params.id)" readonly /></template>
