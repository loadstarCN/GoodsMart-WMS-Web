<script setup lang="ts">
import PickingPrint from '~/components/documents/PickingPrint.vue'
definePageMeta({layout:'custom'})
const route=useRoute()
</script>
<template><PickingPrint :task-id="String(route.params.id)"/></template>
