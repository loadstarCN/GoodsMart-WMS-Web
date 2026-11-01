<script setup lang="ts">
const route=useRoute(),router=useRouter(),{t}=useI18n(),{categoryLabel}=useOptionLabel()
const chips=computed(()=>['category','brand'].flatMap(key=>{
 const missing=['1','true'].includes(String(route.query[key+'_missing']||'')),value=String(route.query[key]||'')
 if(!missing&&!value)return []
 return [{key,label:t('stock-report.'+key),value:missing?t('stock-report.unassigned'):key==='category'?categoryLabel(value):value}]
}))
const clear=(key:string)=>{const query={...route.query};delete query[key];delete query[key+'_missing'];delete query.page;router.push({query})}
</script>
<template><div v-if="chips.length" class="inventory-scope-chips"><WButton v-for="chip in chips" :key="chip.key" size="sm" @click="clear(chip.key)">{{chip.label}}: {{chip.value}} &times;</WButton></div></template>
<style scoped>.inventory-scope-chips{display:flex;flex-wrap:wrap;gap:8px}.inventory-scope-chips :deep(button){height:auto;min-height:28px;white-space:normal;overflow-wrap:anywhere;max-width:100%;text-align:left}</style>
