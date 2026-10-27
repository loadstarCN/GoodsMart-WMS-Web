<script setup lang="ts">
const { t, locale }=useI18n(), route=useRoute(), staff=useStaffStore()
const { bizErrorMessage }=useBizError()
useHead({title:()=>t('goods.files.export-title')})
const filters=ref<Record<string,any>>(Object.fromEntries(Object.entries(route.query).filter(([key])=>!['page','per_page'].includes(key))))
const catalog=ref<any>(null), selected=ref<string[]>([]), preview=ref<any>(null), jobs=ref<any[]>([])
const format=ref('xlsx'),encoding=ref('utf-8'),lang=ref(locale.value),busy=ref(false),error=ref('')
const label=(item:any)=>item?.labels?.[locale.value] || item?.labels?.['en-US'] || item?.key
const available=computed<any[]>(()=>catalog.value?.columns.filter((col:any)=>col.group!=='stock'||staff.hasPermission('inventory_read'))||[])
const selectedColumns=computed(()=>selected.value.map(key=>available.value.find(col=>col.key===key)).filter(Boolean))
const preset=(name:string)=>{selected.value=(catalog.value?.presets[name]||[]).filter((key:string)=>available.value.some(col=>col.key===key))}
const move=(index:number,delta:number)=>{const next=[...selected.value],target=index+delta;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target]!,next[index]!];selected.value=next}
const body=()=>({filters:filters.value,columns:selected.value,file_format:format.value,encoding:encoding.value,lang:lang.value})
let timer:ReturnType<typeof setTimeout>|undefined,alive=true
const loadJobs=async()=>{
 const data=await httpRequest<PaginationData>('/api/warehouse/goods/exports',{params:{per_page:10}})
 if(!alive)return
 jobs.value=data?.items||[]
 if(timer)clearTimeout(timer)
 if(jobs.value.some(job=>['pending','running'].includes(job.status)))timer=setTimeout(loadJobs,3000)
}
const check=async()=>{if(busy.value)return;busy.value=true;error.value='';try{preview.value=await httpRequest('/api/warehouse/goods/exports/preview',{method:'POST',body:body(),onError:err=>{error.value=bizErrorMessage(err)}})}finally{busy.value=false}}
const generate=async()=>{
 if(busy.value||!preview.value||preview.value.too_large)return
 busy.value=true;error.value=''
 try{const result=await httpRequest<any>('/api/warehouse/goods/exports',{method:'POST',body:body(),onError:err=>{error.value=bizErrorMessage(err)}});if(result){await loadJobs();if(result.downloadable)await download(result)}}finally{busy.value=false}
}
const download=async(job:any)=>{try{await downloadFile(`/api/warehouse/goods/exports/${job.id}/download`,{},job.file_name||'goods.xlsx')}catch(err){error.value=bizErrorMessage(err as HttpRequestError)}}
watch([filters,selected,format,encoding,lang],()=>{preview.value=null},{deep:true})
onMounted(async()=>{catalog.value=await httpRequest('/api/warehouse/goods/exports/columns',{onError:err=>{error.value=bizErrorMessage(err)}});preset('import_template');await loadJobs()})
onBeforeUnmount(()=>{alive=false;if(timer)clearTimeout(timer)})
const jobColumns=computed(()=>[{key:'file_name',label:t('goods.files.file'),wrap:true},{key:'status',label:t('common.fields.status')},{key:'row_count',label:t('goods.files.rows'),type:'qty' as const},{key:'created_at',label:t('common.dates.created')},{key:'actions',label:t('common.fields.action')}])
</script>
<template>
 <div class="w-file-page w-scope">
  <header><nav><NuxtLink class="w-breadcrumb-link" to="/goods">{{ t('nav.goods') }}</NuxtLink><span>/</span>{{ t('goods.ui.export') }}</nav><h1>{{ t('goods.files.export-title') }}</h1></header>
  <WAlert v-if="error" tone="block" :title="error" />
  <div class="w-file-page__card">
   <WFormSection :title="t('goods.files.filters')"><WFormGrid>
    <WField :label="t('common.search')"><WInput v-model="filters.keyword" :disabled="busy" /></WField>
    <WField :label="t('goods.fields.brand')" :span="4" optional><WInput v-model="filters.brand" :disabled="busy" /></WField>
    <WField :label="t('goods.fields.manufacturer')" :span="4" optional><WInput v-model="filters.manufacturer" :disabled="busy" /></WField>
    <WField :label="t('common.fields.status')" :span="4"><WSelect v-model="filters.is_active" :options="[{value:'true',label:t('common.status.active')},{value:'false',label:t('common.status.inactive')},{value:'all',label:t('common.status.all')}]" :disabled="busy" :placeholder="t('common.status.active')" /></WField>
   </WFormGrid></WFormSection>
   <WFormSection :title="t('goods.files.columns')">
    <div class="w-file-page__presets"><WButton :disabled="busy" @click="preset('import_template')">{{ t('goods.files.template') }}</WButton><WButton :disabled="busy" @click="preset('all')">{{ t('goods.files.all-columns') }}</WButton></div>
    <div class="w-export-columns">
     <ol class="w-export-columns__selected"><li v-for="(col,index) in selectedColumns" :key="col.key"><span>{{ label(col) }}</span><WButton size="sm" variant="text" :disabled="busy||index===0" :aria-label="t('goods.files.move-up')+' '+label(col)" @click="move(index,-1)">↑</WButton><WButton size="sm" variant="text" :disabled="busy||index===selected.length-1" :aria-label="t('goods.files.move-down')+' '+label(col)" @click="move(index,1)">↓</WButton></li></ol>
     <div class="w-export-columns__available"><fieldset v-for="group in catalog?.groups" :key="group.key" v-show="available.some(col=>col.group===group.key)"><legend>{{ label(group) }}</legend><div><WCheckbox v-for="col in available.filter(col=>col.group===group.key)" :key="col.key" v-model="selected" :value="col.key" :disabled="busy||col.key==='code'">{{ label(col) }}</WCheckbox></div></fieldset></div>
    </div>
   </WFormSection>
   <WFormSection :title="t('goods.files.file')"><WFormGrid>
    <WField :label="t('goods.files.format')" :span="4"><WSelect v-model="format" :options="[{value:'xlsx',label:'Excel (.xlsx)'},{value:'csv',label:'CSV'}]" :disabled="busy" /></WField>
    <WField :label="t('goods.files.encoding')" :span="4"><WSelect v-model="encoding" :options="[{value:'utf-8',label:'UTF-8'},{value:'shift_jis',label:'Shift_JIS'}]" :disabled="busy||format==='xlsx'" /></WField>
    <WField :label="t('goods.files.language')" :span="4"><WSelect v-model="lang" :options="[{value:'zh-CN',label:'中文'},{value:'ja-JP',label:'日本語'},{value:'en-US',label:'English'}]" :disabled="busy" /></WField>
   </WFormGrid></WFormSection>
   <footer class="w-file-page__footer"><span v-if="preview">{{ t('goods.files.matches',{count:preview.total}) }}</span><WButton :loading="busy" :disabled="!selected.length" @click="check">{{ t('goods.files.preview') }}</WButton><WButton variant="primary" :disabled="busy||!preview||preview.too_large" @click="generate">{{ t('goods.files.generate') }}</WButton></footer>
  </div>
  <WAlert v-if="preview?.unencodable?.count" tone="warn" :title="t('goods.files.lossy',{count:preview.unencodable.count})" />
  <WCard :title="t('goods.files.recent')" flush><WTable :columns="jobColumns" :rows="jobs" inset><template #cell-status="{row}"><WStatus :tone="row.status==='failed'?'bad':row.status==='completed'?'ok':'none'">{{ t('goods.files.'+row.status) }}</WStatus><span v-if="row.status==='running'"> {{ row.progress }}%</span></template><template #cell-created_at="{row}">{{ $dayjs(row.created_at) }}</template><template #cell-actions="{row}"><WButton v-if="row.downloadable" size="sm" @click="download(row)">{{ t('goods.files.download') }}</WButton></template></WTable></WCard>
 </div>
</template>
<style scoped>
.w-file-page { display:flex; flex-direction:column; gap:16px; }
.w-file-page header { display:flex; flex-direction:column; gap:8px; }
.w-file-page nav { display:flex; gap:8px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-breadcrumb-link { color:var(--w-text-3); }
.w-file-page h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-file-page__card { background:var(--w-surface); border:1px solid var(--w-border); border-radius:10px; }
.w-file-page__presets { display:flex; gap:8px; margin-bottom:16px; }
.w-file-page__footer { padding:16px 24px; border-top:1px solid var(--w-border); display:flex; justify-content:flex-end; align-items:center; gap:8px; }
.w-file-page__footer>span { margin-right:auto; font-size:13px; line-height:20px; }
.w-export-columns { display:grid; grid-template-columns:240px minmax(0,1fr); border:1px solid var(--w-border); border-radius:10px; }
.w-export-columns__selected { list-style:none; margin:0; padding:8px 12px; border-right:1px solid var(--w-border); max-height:480px; overflow:auto; }
.w-export-columns__selected li { display:flex; align-items:center; font-size:13px; line-height:20px; }
.w-export-columns__selected li>span { flex:1; }
.w-export-columns__available fieldset { display:flex; flex-wrap:wrap; gap:8px 16px; padding:12px 16px; margin:0; border:0; border-bottom:1px solid var(--w-line); }
.w-export-columns__available legend { float:none; width:auto; font-size:13px; font-weight:500; line-height:20px; padding:0; margin:0; }
.w-export-columns__available fieldset>div { display:flex; flex-wrap:wrap; gap:8px 16px; }
@media(max-width:767px){.w-export-columns{grid-template-columns:minmax(0,1fr)}.w-export-columns__selected{border-right:0;border-bottom:1px solid var(--w-border);max-height:220px}}
</style>
