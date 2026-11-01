<script setup lang="ts">
const props=defineProps<{place:'login'|'header'}>()
const {data}=usePresentation(),{t}=useI18n()
const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined
onMounted(()=>{timer=setInterval(()=>now.value=Date.now(),30000)})
onUnmounted(()=>clearInterval(timer))
const notices=computed(()=>(data.value.notices||[]).filter((row:any)=>row[props.place]&&row.enabled&&(!row.start||Date.parse(row.start)<=now.value)&&(!row.end||now.value<Date.parse(row.end))))
</script>
<template><div v-if="notices.length||place==='login'&&data.pda?.login&&data.pda?.url" class="platform-notices"><WAlert v-for="(row,index) in notices" :key="index" :tone="row.kind==='important'?'block':row.kind==='maintenance'?'info':'info'" :title="row.text"/><a v-if="place==='login'&&data.pda?.login&&data.pda?.url" :href="data.pda.url" target="_blank" rel="noopener noreferrer">{{t('presentation.download')}} <span v-if="data.pda.version">{{data.pda.version}}</span><small v-if="data.pda.minimumVersion"> · {{t('presentation.minimumVersion')}} {{data.pda.minimumVersion}}</small></a></div></template>
<style scoped>.platform-notices{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;min-width:0}.platform-notices a{font-size:13px;overflow-wrap:anywhere}.platform-notices small{color:var(--w-text-3)}</style>
