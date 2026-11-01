<script setup lang="ts">
defineProps<{records:any[];document:any}>()
const {t}=useI18n()
</script>
<template><WCard><details><summary>{{t('pick-audit.history')}} · {{records.length}}</summary><p>{{t('pick-audit.hint')}}</p><ul v-if="records.length"><li v-for="(record,index) in [...records].reverse()" :key="index"><time>{{$dayjs(record.requested_at,'YYYY-MM-DD HH:mm:ss',document)}}</time><strong>{{record.operator?.user_name||'—'}}</strong><span>{{({zh:'中文',en:'English',ja:'日本語'} as Record<string,string>)[record.language]||record.language}}</span></li></ul><WEmptyState v-else :title="t('pick-audit.unrequested')"/></details></WCard></template>
<style scoped>summary{cursor:pointer;font-size:14px;font-weight:600}p{font-size:12px;line-height:18px;color:var(--w-text-3)}ul{list-style:none;padding:0;margin:12px 0 0}li{display:flex;flex-wrap:wrap;gap:8px 16px;padding:10px 0;border-top:1px solid var(--w-line);font-size:13px;overflow-wrap:anywhere}time{color:var(--w-text-2)}strong{font-weight:500}</style>
