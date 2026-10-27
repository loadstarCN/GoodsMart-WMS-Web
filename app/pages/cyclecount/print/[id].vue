<script setup lang="ts">
import CycleCountPrint from '~/components/documents/CycleCountPrint.vue'
definePageMeta({layout:'custom'})
const route=useRoute()
</script>
<template><CycleCountPrint :task-id="String(route.params.id)"/></template>
