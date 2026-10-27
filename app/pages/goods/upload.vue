<script setup lang="ts">
const {t,locale}=useI18n(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
useHead({title:()=>t('goods.files.import-title')})
const file=shallowRef<File|null>(null),mode=ref('skip'),encoding=ref('auto'),sheet=ref(''),sheets=ref<string[]>([])
const busy=ref(false),error=ref(''),preview=ref<any>(null),result=ref<any>(null),history=ref<any[]>([]),previewPage=ref(1)
let generation=0
const invalidate=()=>{generation++;preview.value=null;result.value=null;previewPage.value=1}
watch([mode,encoding,sheet],invalidate)
const selectFile=(event:Event)=>{file.value=(event.target as HTMLInputElement).files?.[0]||null;sheets.value=[];sheet.value='';invalidate()}
const form=()=>{const value=new FormData();if(file.value)value.append('file',file.value);value.append('company_id',String(staff.staffInfo?.company?.id||''));value.append('overwrite',mode.value);value.append('encoding',encoding.value);value.append('lang',locale.value);if(sheet.value)value.append('sheet',sheet.value);return value}
const loadHistory=async()=>{const data=await httpRequest<PaginationData>('/api/warehouse/goods/imports',{params:{per_page:10}});history.value=data?.items||[]}
const check=async()=>{
 if(busy.value||!file.value)return
 busy.value=true;error.value='';preview.value=null;result.value=null
 const seq=++generation
 try{
  if(!staff.staffInfo?.company?.id)await staff.getCurrentStaffInfo()
  if(!staff.staffInfo?.company?.id){error.value=t('goods.tips.company-missing');return}
  const body=form();body.append('dry_run','true')
  const data=await httpRequest<any>('/api/warehouse/goods/bulk_upload',{method:'POST',body,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
  if(seq!==generation||!data)return
  preview.value=data;sheets.value=data.file?.sheets||[];previewPage.value=1
 }finally{busy.value=false}
}
const apply=async()=>{
 if(busy.value||!preview.value?.import_token)return
 busy.value=true;error.value=''
 try{const body=form();body.append('import_token',preview.value.import_token)
  const data=await httpRequest<any>('/api/warehouse/goods/bulk_upload',{method:'POST',body,onError:err=>{error.value=bizErrorMessage(err);if(err.status===409)preview.value=null}})
  if(data){result.value=data;preview.value=null;await loadHistory()}
 }finally{busy.value=false}
}
const download=async(url:string,name:string,init:RequestInit={})=>{try{await downloadFile(url,init,name)}catch(err){error.value=bizErrorMessage(err as HttpRequestError)}}
const template=(format:string)=>download(`/api/warehouse/goods/bulk_upload/template?file_format=${format}&lang=${locale.value}`,`goods-template.${format}`)
const rows=computed(()=>preview.value?.rows?.slice((previewPage.value-1)*50,previewPage.value*50)||[])
const columns=computed(()=>[{key:'row',label:t('goods.files.rows'),type:'qty' as const},{key:'code',label:t('goods.fields.code')},{key:'name',label:t('goods.fields.name'),wrap:true},{key:'action',label:t('goods.files.action')},{key:'changes',label:t('goods.files.result'),wrap:true}])
const historyColumns=computed(()=>[{key:'file_name',label:t('goods.files.file'),wrap:true},{key:'created_at',label:t('common.dates.created')},{key:'status',label:t('common.fields.status')},{key:'created',label:t('goods.files.create'),type:'qty' as const},{key:'updated',label:t('goods.files.update'),type:'qty' as const},{key:'errors',label:t('goods.files.errors'),type:'qty' as const},{key:'actions',label:t('common.fields.action')}])
onMounted(loadHistory)
onBeforeUnmount(()=>{generation++})
</script>
<template>
 <div class="w-import w-scope">
  <header><nav><NuxtLink class="w-breadcrumb-link" to="/goods">{{t('nav.goods')}}</NuxtLink><span>/</span>{{t('goods.ui.import')}}</nav><h1>{{t('goods.files.import-title')}}</h1></header>
  <WAlert v-if="error" tone="block" :title="error" />
  <div class="w-import__card">
   <WFormSection :title="'① '+t('goods.files.template')"><div class="w-import__templates"><WButton @click="template('xlsx')">Excel (.xlsx)</WButton><WButton @click="template('csv')">CSV</WButton></div></WFormSection>
   <WFormSection :title="'② '+t('goods.files.upload')"><WFormGrid>
    <label class="w-import__upload"><WIcon name="upload" :size="24" /><span>{{file?.name||t('goods.files.upload')}}</span><small>Excel (.xlsx) / CSV</small><input type="file" accept=".csv,.xlsx" :disabled="busy" :aria-label="t('goods.files.upload')" @change="selectFile"></label>
    <WField :label="t('goods.files.encoding')" :span="6"><WSelect v-model="encoding" :disabled="busy" :options="[{value:'auto',label:'Auto'},{value:'utf-8',label:'UTF-8'},{value:'shift_jis',label:'Shift_JIS'}]" /></WField>
    <WField v-if="sheets.length>1" :label="t('goods.files.sheet')" :span="6"><WSelect v-model="sheet" :disabled="busy" :options="sheets.map(value=>({value,label:value}))" :placeholder="sheets[0]" /></WField>
   </WFormGrid></WFormSection>
   <WFormSection :title="'③ '+t('goods.files.strategy')"><div class="w-import__modes"><label v-for="value in ['skip','append','override','active']" :key="value" :class="{'is-selected':mode===value}"><input v-model="mode" type="radio" name="mode" :value="value" :disabled="busy"><span>{{t('goods.files.'+value)}}</span></label></div></WFormSection>
   <footer class="w-import__footer"><WButton variant="primary" :loading="busy" :disabled="!file" @click="check">{{t('goods.files.preview')}}</WButton></footer>
  </div>
  <WCard v-if="preview" :title="t('goods.files.result')" flush>
   <div class="w-import__summary"><span v-for="(count,key) in preview.summary" :key="key">{{t('goods.files.'+key)}} <b>{{count}}</b></span></div>
   <WTable :rows="rows" :columns="columns" row-key="row" inset><template #cell-action="{row}"><WStatus :tone="row.action==='error'?'bad':row.action==='skip'?'none':'ok'">{{t('goods.files.'+row.action)}}</WStatus></template><template #cell-changes="{row}"><div v-for="item in row.errors||[]" :key="item.field" class="w-import__error">{{item.message||item.reason}}</div><div v-for="change in row.changes||[]" :key="change.field">{{change.field}}: {{change.from}} → {{change.to}}</div></template></WTable>
   <div class="w-import__pager"><WPagination v-model:page="previewPage" :total="preview.rows.length" :page-size="50" show-total /></div>
   <footer class="w-import__footer"><WButton v-if="preview.summary.error" :disabled="busy" @click="download('/api/warehouse/goods/bulk_upload/errors','goods-errors.'+(preview.file.format||'csv'),{method:'POST',body:form()})">{{t('goods.files.error-file')}}</WButton><WButton variant="primary" :loading="busy" :disabled="!(preview.summary.create+preview.summary.update+preview.summary.unchanged+preview.summary.skip)" @click="apply">{{t('goods.files.confirm-import')}}</WButton></footer>
  </WCard>
  <WAlert v-if="result" :tone="result.status==='failed'?'block':result.status==='partial'?'warn':'info'" :title="t('goods.files.'+result.status)"><template #actions><WButton :to="'/goods?import_id='+result.import_id">{{t('nav.goods')}}</WButton></template></WAlert>
  <WCard :title="t('goods.files.history')" flush><WTable :rows="history" :columns="historyColumns" inset><template #cell-created_at="{row}">{{$dayjs(row.created_at)}}</template><template #cell-status="{row}"><WStatus :tone="row.status==='failed'?'bad':row.status==='partial'?'warn':'ok'">{{t('goods.files.'+row.status)}}</WStatus></template><template #cell-actions="{row}"><WButton v-if="row.has_error_file" size="sm" @click="download('/api/warehouse/goods/imports/'+row.id+'/errors',row.error_file_name)">{{t('goods.files.error-file')}}</WButton><WButton v-if="row.has_original_file" size="sm" variant="text" @click="download('/api/warehouse/goods/imports/'+row.id+'/file',row.file_name)">{{t('goods.files.file')}}</WButton></template></WTable></WCard>
 </div>
</template>
<style scoped>
.w-import { display:flex; flex-direction:column; gap:16px; }
.w-import header { display:flex; flex-direction:column; gap:8px; }
.w-import nav { display:flex; gap:8px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-breadcrumb-link { color:var(--w-text-3); }
.w-import h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-import__card { background:var(--w-surface); border:1px solid var(--w-border); border-radius:10px; }
.w-import__templates { display:flex; gap:8px; }
.w-import__upload { display:flex; flex-direction:column; align-items:center; gap:8px; padding:24px; border:1px dashed var(--w-border-strong); border-radius:10px; background:var(--w-bg); cursor:pointer; position:relative; font-size:14px; line-height:22px; }
.w-import__upload small { font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-import__upload input { position:absolute; inset:0; width:100%; opacity:0; cursor:pointer; }
.w-import__upload:focus-within { outline:2px solid var(--w-focus); }
.w-import__modes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.w-import__modes label { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--w-border); border-radius:6px; font-size:13px; line-height:20px; cursor:pointer; }
.w-import__modes input { margin:3px 0 0; accent-color:var(--w-pri); }
.w-import__modes .is-selected { border-color:var(--w-pri); background:var(--w-sel-soft); }
.w-import__footer { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; padding:16px 24px; border-top:1px solid var(--w-border); }
.w-import__summary { display:flex; flex-wrap:wrap; gap:16px; padding:16px 24px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-import__summary b { color:var(--w-text-1); }
.w-import__error { color:var(--w-bad-text); }
.w-import__pager { padding:12px 20px; }
@media(max-width:767px){.w-import__modes{grid-template-columns:1fr}}
</style>
