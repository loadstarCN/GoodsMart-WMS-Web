<script setup lang="ts">
import {pdaManifestUrl,readPdaManifest} from '~/utils/pdaManifest'
const {t}=useI18n(),{bizErrorMessage}=useBizError(),{refresh}=usePresentation()
const data=ref<any>(null),loading=ref(true),saving=ref(false),error=ref('')
const assets=['logoOnDark','logoOnLight','logoMark','favicon','loginImage']
const defaults=useRuntimeConfig().public.brand as Record<string,string>
const fallback=(key:string)=>defaults[key]||(key==='favicon'?'/images/brand-logos/favicon-32x32.png':'/images/brand-logos/upload-placeholder.svg')
const uploads=ref<Record<string,boolean>>({})
const readingManifest=ref(false),manifestError=ref('')
let manifestController:AbortController|null=null
const uploading=computed(()=>Object.values(uploads.value).some(Boolean))
const brandKeys=['productName','logoOnDark','logoOnLight','logoMark','favicon','loginTitle','loginSubtitle','loginImage']
const original=ref('')
const dirty=computed(()=>!!data.value&&!!original.value&&JSON.stringify(data.value)!==original.value)
const pending=computed(()=>saving.value||uploading.value||readingManifest.value)
defineExpose({dirty,pending})
let generation=0
onBeforeUnmount(()=>{generation++;manifestController?.abort()})
const readManifest=async()=>{
 if(pending.value||loading.value||!data.value)return
 readingManifest.value=true;manifestError.value=''
 const seq=generation,url=data.value.pda.url
 const controller=new AbortController();manifestController=controller
 const timeout=setTimeout(()=>controller.abort(),10000)
 try{
  const metadata=await readPdaManifest(pdaManifestUrl(url,window.location.origin),controller.signal)
  if(seq!==generation||data.value?.pda.url!==url)return
  Object.assign(data.value.pda,metadata)
  showToast(t('presentation.manifest-done'),'success')
 }catch{if(seq===generation)manifestError.value=t('presentation.manifest-error')}
 finally{clearTimeout(timeout);readingManifest.value=false;manifestController=null}
}
const load=async()=>{
 if(pending.value)return
 if(dirty.value&&!await showConfirm(t('unsaved-form.title'),t('unsaved-form.message'),t('unsaved-form.leave'),t('unsaved-form.stay')))return
 const seq=++generation;loading.value=true;error.value=''
 try{const result=await httpRequest('/api/system/settings/presentation',{onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(result&&seq===generation){data.value=result;original.value=JSON.stringify(result)}}finally{if(seq===generation)loading.value=false}
}
const save=async()=>{if(pending.value||loading.value||!data.value)return;saving.value=true;error.value='';const seq=generation;try{const result=await httpRequest('/api/system/settings/presentation',{method:'PUT',body:data.value,onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(result&&seq===generation){data.value=result;original.value=JSON.stringify(result);await refresh();showToast(t('action-results.success'),'success')}}finally{saving.value=false}}
const addNotice=()=>data.value.notices.push({text:'',kind:'notice',login:true,header:true,enabled:true,start:null,end:null})
const noticeStatus=(row:any)=>!row.enabled?'disabled':row.end&&Date.parse(row.end)<=Date.now()?'ended':row.start&&Date.parse(row.start)>Date.now()?'scheduled':'visible'
// Explicit UTC inputs avoid silently interpreting a browser's local zone as the platform zone.
const dateInput=(value:string|null)=>value?new Date(value).toISOString().slice(0,16):''
const setDate=(row:any,key:string,value:any)=>{const date=value?new Date(String(value)+'Z'):null;if(!date||Number.isFinite(date.getTime()))row[key]=date?date.toISOString():null}
onMounted(load)
</script>
<template><div class="presentation-settings">
 <WAlert v-if="error" tone="block" :title="error"><WButton :disabled="pending" @click="load">{{t('delivery.pickup.operations.refresh')}}</WButton></WAlert>
 <WCard v-if="loading"><WEmptyState :title="t('common.status.loading')"/></WCard>
 <form v-else-if="data" @submit.prevent="save"><fieldset :disabled="saving||readingManifest">
  <WCard id="s-brand" flush><div class="section-title"><h2>{{t('presentation.brand')}}</h2><p>{{t('presentation.brand-hint')}}</p></div>
   <WFormSection v-for="key in brandKeys" :key="key" :title="t('presentation.'+key)"><WField :label="t('presentation.'+key)"><WInput v-model="data.brand[key]" :maxlength="['productName','loginTitle','loginSubtitle'].includes(key)?200:2048"/><div v-if="assets.includes(key)" class="asset-controls" :class="{dark:key==='logoOnDark'||key==='logoMark'}"><ImageUploader :model-value="data.brand[key]||null" upload-url="/api/system/settings/presentation/image" shape="square" :size="100" :fallback-src="fallback(key)" @update:model-value="value=>data.brand[key]=value||''" @uploading="value=>uploads[key]=value"/><WButton :disabled="uploading" @click="data.brand[key]=''">{{t('presentation.restore-default')}}</WButton></div></WField></WFormSection>
  </WCard>
  <WCard id="s-apk" flush><div class="section-title"><h2>{{t('presentation.pda')}}</h2><p>{{t('presentation.pda-hint')}}</p></div><WFormSection :title="t('presentation.download')"><WButton :disabled="pending||!data.pda.url" :loading="readingManifest" @click="readManifest">{{t('presentation.read-manifest')}}</WButton><p>{{t('presentation.manifest-hint')}}</p><WAlert v-if="manifestError" tone="block" :title="manifestError"/><div class="fields"><WField v-for="key in ['url','version','minimumVersion']" :key="key" :label="t('presentation.'+key)"><WInput v-model="data.pda[key]" :pattern="key==='url'?undefined:'[0-9]+([.][0-9]+){1,3}'" :title="key==='url'?undefined:'1.4.2'" :maxlength="key==='url'?2048:50"/></WField><WField :label="t('presentation.versionCode')"><WInput v-model.number="data.pda.versionCode" type="number" min="1" max="2147483647" step="1"/></WField><WField :label="t('presentation.releasedAt')"><WInput v-model="data.pda.releasedAt" placeholder="2026-10-31T13:21:00+09:00"/></WField><WField :label="t('presentation.releaseDate')"><WInput v-model="data.pda.releaseDate" type="date"/></WField><WField :label="t('presentation.sizeBytes')"><WInput :model-value="data.pda.sizeBytes" type="number" min="1" max="10737418240" step="1" @update:model-value="value=>data.pda.sizeBytes=value===''?null:Number(value)"/></WField><WField :label="t('presentation.sha256')"><WInput v-model="data.pda.sha256" pattern="[0-9a-fA-F]{64}" maxlength="64"/></WField><WField group :label="t('presentation.position')"><div class="flags"><WCheckbox v-model="data.pda.login">{{t('presentation.login')}}</WCheckbox><WCheckbox v-model="data.pda.header">{{t('shell.account.menu')}}</WCheckbox></div></WField></div></WFormSection></WCard>
  <WCard id="s-notice" flush><div class="section-title"><h2>{{t('presentation.notices')}}</h2><p>{{t('presentation.notice-hint')}}</p></div><WEmptyState v-if="!data.notices.length" :title="t('w.table.empty')"/><section v-for="(row,index) in data.notices" :key="index" class="notice"><header><WStatus :tone="noticeStatus(row)==='visible'?'ok':'none'">{{t('presentation.'+noticeStatus(row))}}</WStatus><WButton variant="danger" size="sm" @click="data.notices.splice(index,1)">{{t('button.delete')}}</WButton></header><WField :label="t('presentation.text')" required><WTextarea v-model="row.text" :maxlength="1000" required/></WField><div class="fields"><WField :label="t('presentation.kind')"><WSelect v-model="row.kind" :options="['notice','important','maintenance'].map(value=>({value,label:t('presentation.'+value)}))"/></WField><WField group :label="t('presentation.position')"><div class="flags"><WCheckbox v-model="row.login">{{t('presentation.login')}}</WCheckbox><WCheckbox v-model="row.header">{{t('presentation.header')}}</WCheckbox><WCheckbox v-model="row.enabled">{{t('tenant-list.active')}}</WCheckbox></div></WField><WField :label="t('presentation.start')+' (UTC)'"><WInput :model-value="dateInput(row.start)" type="datetime-local" @update:model-value="value=>setDate(row,'start',value)"/></WField><WField :label="t('presentation.end')+' (UTC)'"><WInput :model-value="dateInput(row.end)" type="datetime-local" @update:model-value="value=>setDate(row,'end',value)"/></WField></div></section><footer><WButton :disabled="data.notices.length>=50" @click="addNotice">{{t('presentation.add-notice')}}</WButton></footer></WCard>
 </fieldset><footer><WButton :disabled="pending" @click="load">{{t('button.reset')}}</WButton><WButton type="submit" variant="primary" :disabled="uploading||readingManifest" :loading="saving">{{t('button.save')}}</WButton></footer></form>
</div></template>
<style scoped>.presentation-settings,form,fieldset{display:flex;flex-direction:column;gap:16px;min-width:0}fieldset{border:0;margin:0;padding:0}.section-title{padding:16px 24px;border-bottom:1px solid var(--w-line)}h2{font-size:16px;line-height:24px;margin:0;font-weight:600}p{font-size:13px;line-height:20px;color:var(--w-text-3);margin:4px 0 0}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;max-width:800px}.flags{display:flex;flex-wrap:wrap;gap:12px}.asset-preview{max-width:240px;max-height:100px;object-fit:contain;margin-top:8px;padding:12px;border:1px solid var(--w-border);border-radius:6px}.asset-controls{display:flex;align-items:center;gap:16px;padding:12px;margin-top:8px;border-radius:6px}.asset-controls :deep(img){object-fit:contain}.dark{background:#171729}.dark :deep(.image-uploader__preview){background:#171729}.dark :deep(.image-uploader__hint){color:#b9b5ca!important}.notice{display:flex;flex-direction:column;gap:16px;padding:20px 24px;border-bottom:1px solid var(--w-line)}header,footer{display:flex;gap:12px;justify-content:space-between;align-items:center}footer{justify-content:flex-end;padding:16px 24px}@media(max-width:700px){.fields{grid-template-columns:minmax(0,1fr)}}</style>
