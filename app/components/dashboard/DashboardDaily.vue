<script setup lang="ts">
defineProps<{data:any}>()
const {t}=useI18n()
</script>
<template><WCard flush><section class="daily-work">
 <header><h2>{{t(data.dispatch?'dashboard-daily.title':'dashboard-daily.completed')}}</h2><small>{{data.date}} · {{data.timezone}}</small></header>
 <template v-if="data.dispatch">
  <p>{{t('dashboard-daily.progress',{due:data.dispatch.due,sent:data.dispatch.sent})}}</p>
  <progress :value="data.dispatch.sent" :max="Math.max(1,data.dispatch.due)" :aria-label="t('dashboard-daily.title')"/>
  <p class="hint">{{t('dashboard-daily.scope')}}</p>
  <table v-if="data.dispatch.carriers.length"><thead><tr><th>{{t('dashboard-daily.carrier')}}</th><th>{{t('dashboard-daily.due')}}</th><th>{{t('dashboard-daily.sent')}}</th></tr></thead><tbody><tr v-for="row in data.dispatch.carriers" :key="row.carrier_id??'none'"><th>{{row.name||t('dashboard-daily.unassigned')}}</th><td>{{row.due}}</td><td>{{row.sent}}</td></tr></tbody></table>
 </template>
 <p class="completed"><strong>{{t('dashboard-daily.completed')}}</strong><span v-if="data.sent_today!==undefined">{{t('dashboard-daily.sent')}} {{data.sent_today}}</span><span v-if="data.signed_today!==undefined">{{t('dashboard-daily.signed')}} {{data.signed_today}}</span><span v-if="data.putaway_today!==undefined">{{t('dashboard-daily.putaway')}} {{data.putaway_today}}</span></p>
</section></WCard></template>
<style scoped>
.daily-work{padding:20px 24px}header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}h2{margin:0;font-size:16px;line-height:24px;font-weight:600}small,.hint{color:var(--w-text-3);font-size:12px;line-height:18px}p{font-size:13px;line-height:20px;margin:12px 0}progress{display:block;width:100%;height:8px;accent-color:var(--w-pri)}table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px;line-height:20px}th,td{padding:8px;text-align:right;border-bottom:1px solid var(--w-line);overflow-wrap:anywhere}th:first-child{text-align:left;width:55%;font-weight:500}.completed{display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:0}.completed strong{font-weight:500}@media(max-width:600px){.daily-work{padding:16px}}
</style>
