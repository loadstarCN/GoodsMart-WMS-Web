<script setup lang="ts">
import LabelLotPicker from '~/components/goods/LabelLotPicker.vue'
import ProductLabel from '~/components/goods/ProductLabel.vue'
import QRCode from 'qrcode'
import { goodsBarcodeFormat } from '~/utils/goodsBarcode'
definePageMeta({ layout: 'custom' })
const { t, locale } = useI18n(), route = useRoute(), { bizErrorMessage } = useBizError()
const staff = useStaffStore()
const record = ref<any>(null), loading = ref(true), error = ref(''), copies = ref(1), qr = ref(''), saving = ref(false), saved = ref(false), revision = ref(0), baseline = ref('')
const settings = reactive({width_mm:60,height_mm:40,margin_mm:2,name_font_pt:8,show_name:true,barcode_format:'auto'})
// Kana provides an explicit script cue; Han-only names follow the selected language.
const japaneseName = computed(()=>/[\u3040-\u30ff]/.test(record.value?.name||'') || String(locale.value).startsWith('ja'))
const nameFont = computed(()=>japaneseName.value?'"Noto Sans JP", Inter, sans-serif':'Inter, "Noto Sans SC", sans-serif')
const selectedLot = ref<any>(null)
const contentFits = ref(false)
const customMode = ref(false)
const preset = computed({get:()=>customMode.value?'custom':['50x30','60x40','70x50','100x60'].find(value=>value===settings.width_mm+'x'+settings.height_mm)||'custom',set:(value:string)=>{customMode.value=value==='custom';if(value!=='custom'){const [width,height]=value.split('x').map(Number);settings.width_mm=width!;settings.height_mm=height!}}})
const dimensionsValid = computed(()=>Number.isFinite(settings.width_mm)&&settings.width_mm>=40&&settings.width_mm<=150&&Number.isFinite(settings.height_mm)&&settings.height_mm>=25&&settings.height_mm<=150&&Number.isFinite(settings.margin_mm)&&settings.margin_mm>=1&&settings.margin_mm<=8&&Number.isFinite(settings.name_font_pt)&&settings.name_font_pt>=6&&settings.name_font_pt<=14)
const nameHeight = computed(()=>settings.show_name?settings.name_font_pt*25.4/72*2.5+1:0)
const usableHeight = computed(()=>settings.height_mm-2*settings.margin_mm-nameHeight.value)
const templateValid = computed(()=>dimensionsValid.value&&usableHeight.value>=12)
const dirty = computed(()=>JSON.stringify(settings)!==baseline.value)
const labelStyle = computed(()=>({'--label-width':settings.width_mm+'mm','--label-height':settings.height_mm+'mm','--label-margin':settings.margin_mm+'mm','--name-font':settings.name_font_pt+'pt','--name-height':Math.max(0,nameHeight.value-1)+'mm','--qr-size':Math.min(settings.width_mm-2*settings.margin_mm,usableHeight.value-4)+'mm'}))
const loadTemplate = async()=>{
  if(!record.value?.company_id)return
  const result=await httpRequest<any>('/api/warehouse/company/'+record.value.company_id+'/product-label',{onError:err=>error.value=bizErrorMessage(err)})
  if(result){Object.assign(settings,result.template);revision.value=result.revision;baseline.value=JSON.stringify(settings)}
}
const restoreDesign = ()=>{Object.assign(settings,{width_mm:50,height_mm:30,margin_mm:2.116667,name_font_pt:6,show_name:true,barcode_format:'auto'});customMode.value=false}
const restore = ()=>{if(baseline.value){Object.assign(settings,JSON.parse(baseline.value));saved.value=false}}
const saveDefault = async()=>{
  if(saving.value||!templateValid.value||!baseline.value||!staff.hasPermission('company_edit'))return
  saving.value=true;error.value='';saved.value=false
  const result=await httpRequest<any>('/api/warehouse/company/'+record.value.company_id+'/product-label',{method:'PUT',body:{revision:revision.value,template:{...settings}},onError:err=>error.value=err.status===409?t('goods-label.conflict'):bizErrorMessage(err)})
  if(result){revision.value=result.revision;baseline.value=JSON.stringify(result.template);saved.value=!dirty.value}
  saving.value=false
}
watch(settings,()=>{saved.value=false})
const valid = computed(() => Number.isInteger(copies.value) && copies.value >= 1 && copies.value <= 100 && templateValid.value)
const format = computed(() => settings.barcode_format==='qr'?'QR':goodsBarcodeFormat(String(record.value?.code || '')))

onMounted(async () => {
  record.value = await httpRequest<any>('/api/warehouse/goods/' + Number(route.params.id), { onError: err => error.value = bizErrorMessage(err) })
  await loadTemplate()
  if(record.value&&route.query.lot_id){selectedLot.value=await httpRequest<any>('/api/warehouse/goods/'+record.value.id+'/lots/'+Number(route.query.lot_id),{onError:err=>error.value=bizErrorMessage(err)})}
  if (record.value) {
    try { qr.value = await QRCode.toDataURL(String(record.value.code), { errorCorrectionLevel: 'M', margin: 4, width: 320 }) }
    catch { error.value = t('location-label.code-error') }
  }
  loading.value = false
})
const print = async () => { await document.fonts.ready; await nextTick(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); if(valid.value&&contentFits.value&&!error.value)window.print() }
useHead(()=>({title:t('goods-label.title')+' · '+(record.value?.code||''),style:[{key:'goods-label-page-size',innerHTML:templateValid.value?'@page{size:'+settings.width_mm+'mm '+settings.height_mm+'mm;margin:0;@bottom-right{content:none}}':''}]}))
</script>

<template>
  <div class="w-goods-label-print w-scope">
    <div class="toolbar"><NuxtLink class="w-goods-label-back" :to="'/goods/detail/'+route.params.id">{{ record?.name || t('nav.goods') }}</NuxtLink><span>{{settings.width_mm}} × {{settings.height_mm}} mm</span><WField :label="t('location-label.copies')"><WInput v-model.number="copies" type="number" min="1" max="100" /></WField><WButton icon="printer" :disabled="loading||!record||!valid||!contentFits||!!error||(format==='QR'&&!qr)" @click="print">{{ t('button.print-to-pdf') }}</WButton></div>
    <section v-if="record&&!loading" class="settings"><header><div><h2>{{t('goods-label.company-template')}}</h2><p>{{t('goods-label.company-hint')}}</p></div><div class="settings-actions"><WButton :disabled="saving" @click="restoreDesign">{{t('goods-label.reference-layout')}}</WButton><WButton :disabled="!dirty||saving" @click="restore">{{t('goods-label.restore')}}</WButton><WButton v-if="staff.hasPermission('company_edit')" :disabled="!dirty||!templateValid||!baseline" :loading="saving" @click="saveDefault">{{t('goods-label.save-default')}}</WButton></div></header><fieldset class="settings-fields" :disabled="saving"><WField :label="t('goods-label.paper-size')"><WSelect v-model="preset" :options="[{value:'50x30',label:'50 × 30 mm'},{value:'60x40',label:'60 × 40 mm'},{value:'70x50',label:'70 × 50 mm'},{value:'100x60',label:'100 × 60 mm'},{value:'custom',label:t('goods-label.custom')}]" /></WField><WField v-for="field in ['width_mm','height_mm','margin_mm','name_font_pt'] as const" :key="field" :label="t('goods-label.'+field)"><WInput v-model.number="settings[field]" type="number" :min="field==='width_mm'?40:field==='height_mm'?25:field==='margin_mm'?1:6" :max="field==='margin_mm'?8:field==='name_font_pt'?14:150" step="0.5" :suffix="field==='name_font_pt'?'pt':'mm'" /></WField><WField :label="t('goods-label.barcode-format')"><WSelect v-model="settings.barcode_format" :options="[{value:'auto',label:t('goods-label.auto')},{value:'qr',label:'QR'}]" /></WField><WCheckbox v-model="settings.show_name" :label="t('goods-label.show-name')" /></fieldset><LabelLotPicker v-model="selectedLot" :goods-id="record.id" /><p v-if="saved" role="status" class="saved">{{t('goods-label.saved')}}</p><p v-else-if="dirty" class="temporary">{{t('goods-label.temporary')}}</p></section>
    <WAlert v-if="error" tone="block" :title="error" />
    <WAlert v-if="!valid" tone="block" :title="t('goods-label.invalid')" />
    <WEmptyState v-if="loading" :title="t('common.status.loading')" />
    <WAlert v-if="!loading&&record&&valid&&!error&&!contentFits" tone="block" :title="t('goods-label.content-overflow')" />
    <p class="hint">{{ t('goods-label.hint',{width:settings.width_mm,height:settings.height_mm}) }}</p>
    <div v-if="record&&!loading&&valid&&!error&&(format!=='QR'||qr)" class="roll" :style="labelStyle">
      <ProductLabel v-for="index in copies" :key="index" class="label" @fit="contentFits=$event" :name="record.name" :lot="selectedLot?.lot_no" :expiry="selectedLot?.expiry_date" :code="String(record.code)" :width="settings.width_mm" :height="settings.height_mm" :name-font-pt="settings.name_font_pt" :name-family="nameFont" :show-name="settings.show_name" :margin="Math.abs(settings.margin_mm-2.116667)<.001?undefined:settings.margin_mm" :qr="format==='QR'?qr:undefined" />
    </div>
  </div>
</template>

<style scoped>
.w-goods-label-print { min-height:100vh; padding:24px; background:#F6F7FA; color:#151923; }
.toolbar { display:flex; flex-wrap:wrap; align-items:end; gap:16px; max-width:1000px; margin:0 auto 16px; }
.w-goods-label-back { align-self:center; color:#5F1FE6; text-decoration:none; font-size:14px; font-weight:500; }
.toolbar>span { margin-right:auto; align-self:center; font-size:12px; color:#656C7A; }
.toolbar>.w-field { width:110px; }
.settings { max-width:1000px; margin:0 auto 16px; padding:16px 20px; background:white; border:1px solid var(--w-border); border-radius:10px; }
.settings header { display:flex; flex-wrap:wrap; justify-content:space-between; gap:16px; margin-bottom:16px; }
.settings h2 { font-size:14px; line-height:22px; font-weight:600; margin:0; }
.settings p { margin:4px 0 0; font-size:12px; line-height:18px; color:var(--w-text-3); }
.settings-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.settings-fields { border:0; padding:0; margin:0; min-width:0; display:flex; flex-wrap:wrap; align-items:end; gap:12px 16px; }
.settings-fields>.w-field { width:120px; }
.settings-fields>.w-field:first-child { width:160px; }
.settings .saved { color:#206B38; margin-top:12px; }
.settings .temporary { margin-top:12px; }
.hint { max-width:1000px; margin:0 auto 20px; color:#656C7A; font-size:12px; line-height:18px; }
.roll { display:flex; flex-direction:column; align-items:flex-start; gap:3mm; overflow-x:auto; }
.label { margin-inline:auto; zoom:2; }
@media(max-width:460px) { .w-goods-label-print { padding:16px; } .label { zoom:1.7; } }
@media print { .w-goods-label-print { padding:0; min-height:0; background:white; } .toolbar,.settings,.hint,.w-alert { display:none; } .roll { display:block; } .label { zoom:1; border-radius:0; break-inside:avoid; break-after:page; } .label:last-child { break-after:auto; } }
</style>
<style>@media print{html,body{margin:0!important;padding:0!important;background:white!important}.nuxt-devtools-panel,.nuxt-devtools-toggle{display:none!important}}</style>
