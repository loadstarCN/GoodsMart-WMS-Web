<script setup lang="ts">
definePageMeta({ middleware: to => navigateTo('/department?editor='+encodeURIComponent(String(to.params.id)), { replace: true }) })
</script>
<template><div /></template>
