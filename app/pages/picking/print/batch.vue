<script setup lang="ts">
import PickingPrint from '~/components/documents/PickingPrint.vue'
definePageMeta({layout:'custom'})
const route=useRoute(),{t,locale}=useI18n()
const ids=computed(()=>[...new Set(String(route.query.ids||'').split(',').map(Number))])
const valid=computed(()=>ids.value.length>0&&ids.value.length<=50&&ids.value.every(id=>Number.isInteger(id)&&id>0))
const ready=ref<Record<number,boolean>>({})
const language=ref<'zh'|'en'|'ja'>(locale.value==='zh'||locale.value==='ja'?locale.value:'en')
const printable=computed(()=>valid.value&&ids.value.every(id=>ready.value[id]))
watch(()=>route.query.ids,()=>ready.value={})
const {printing,printError,requestPrint}=usePickingPrintRequest()
const print=()=>{if(printable.value)return requestPrint(ids.value,language.value)}
useHead({title:()=>t('pick-batch.title')})
</script>
<template><div class="pick-batch w-scope"><header class="batch-toolbar"><NuxtLink to="/picking">{{t('nav.picking')}}</NuxtLink><h1>{{t('pick-batch.title')}}</h1><label>{{t('print-design.language')}}<select v-model="language"><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select></label><WButton icon="printer" :disabled="printing||!printable" @click="print">{{t('button.print-to-pdf')}}</WButton><p>{{t('pick-audit.hint')}}</p></header><WAlert v-if="printError" tone="block" :title="printError"/><WAlert v-if="!valid" tone="block" :title="t('pick-batch.invalid')"/><template v-else><PickingPrint v-for="id in ids" :key="id" :task-id="String(id)" embedded :print-locale="language" @ready="ready[id]=$event"/></template></div></template>
<style scoped>.pick-batch{background:#E1E4EA;min-height:100vh}.batch-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:20px;max-width:850px;margin:auto}.batch-toolbar h1{font-size:18px;line-height:26px;margin:0 auto 0 0}.batch-toolbar label{display:flex;gap:8px;align-items:center;font-size:13px}.batch-toolbar select{padding:6px;border:1px solid var(--w-border);border-radius:6px;background:white}@media print{.pick-batch{background:white;min-height:0}.batch-toolbar{display:none}.pick-batch>:deep(.pick-print){break-after:page}.pick-batch>:deep(.pick-print:last-child){break-after:auto}}</style>
