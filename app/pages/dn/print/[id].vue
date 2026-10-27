<script setup lang="ts">
import DocumentPrint from '~/components/documents/DocumentPrint.vue'
definePageMeta({layout:'custom'})
const route=useRoute()
</script>
<template><DocumentPrint kind="dn" :document-id="String(route.params.id)"/></template>
