<script setup lang="ts">
const props=defineProps<{active:string}>()
const {t}=useI18n(),router=useRouter()
const options=computed(()=>[{value:'/inventory',label:t('inventory.views.goods')},{value:'/inventory/by-location',label:t('inventory.views.location')},{value:'/inventory/history',label:t('inventory.views.history')}])
</script>
<template><div class="w-inventory-view"><WSegmented :model-value="active" :options="options" :label="t('inventory.views.view')" @update:model-value="value=>value&&router.push(value)" /><WButton variant="text" size="sm" to="/inventory/ledger">{{t('ledger.title')}} →</WButton></div></template>
<style scoped>.w-inventory-view{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}</style>
