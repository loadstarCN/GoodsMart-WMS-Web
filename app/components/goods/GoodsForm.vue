<script setup lang="ts">
import {QuillEditor} from '@vueup/vue-quill'
import 'quill/dist/quill.snow.css'
import {categoriesOptions,currenciesOptions,unitsOptions} from '~/data/selectOptions'
import {GOODS_EDIT_FIELDS,goodsFieldPayloadValue,buildGoodsUpdatePayload,snapshotGoodsForm} from '~/utils/goodsForm'
const props=defineProps<{goodsId?:string}>()
const {t}=useI18n(),router=useRouter(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const {categoryLabel,unitOptionLabel}=useOptionLabel()
const editing=computed(()=>!!props.goodsId),title=computed(()=>t(editing.value?'goods.operations.edit':'goods.operations.add'))
useHead({title})
const record=ref<Record<string,any>>({name:'',code:'',unit:'pcs',currency:staff.staffInfo?.company?.default_currency||'JPY',tags:[],origin_country:null})
const loading=ref(false),busy=ref(false),error=ref(''),errors=ref<Record<string,string>>({}),tag=ref('')
let original:Record<string,any>|null=null,descriptionTouched=false,generation=0
const image=computed({get:()=>record.value.image_url,set:value=>{record.value.image_url=value;record.value.thumbnail_url=value}})
const options=(values:string[],label=(value:string)=>value)=>values.map(value=>({value,label:label(value)}))
const tags=computed<string[]>(()=>Array.isArray(record.value.tags)?record.value.tags:[])
const addTag=()=>{const next=tag.value.trim();if(next&&!tags.value.includes(next))record.value.tags=[...tags.value,next];tag.value=''}
const touchDescription=()=>{if(!descriptionTouched&&original)original.description=record.value.description;descriptionTouched=true}
const load=async()=>{
 if(!props.goodsId)return
 const seq=++generation;loading.value=true
 const data=await httpRequest<any>('/api/warehouse/goods/'+props.goodsId,{onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
 if(seq!==generation)return
 if(data){record.value={...data,tags:convert_tags_to_array(data.tags)};original=snapshotGoodsForm(record.value)}
 loading.value=false
}
onMounted(load)
onBeforeUnmount(()=>{generation++})
const save=async()=>{
 if(busy.value)return
 errors.value={};error.value=''
 if(!String(record.value.name||'').trim())errors.value.name=t('common.validation.name-required',{entity:t('goods.entity')})
 if(!String(record.value.code||'').trim())errors.value.code=t('goods.validation.code-required')
 if(Object.keys(errors.value).length)return
 const current=original&&!descriptionTouched?{...record.value,description:original.description}:record.value
 const body=editing.value&&original?buildGoodsUpdatePayload(original,current):Object.fromEntries(GOODS_EDIT_FIELDS.map(key=>[key,goodsFieldPayloadValue(key,current[key])]))
 if(editing.value&&!Object.keys(body).length){showToast(t('goods.form.tips.no-changes'),'warning');return}
 if(!editing.value){if(!staff.staffInfo?.company?.id)await staff.getCurrentStaffInfo();body.company_id=staff.staffInfo?.company?.id;if(!body.company_id){error.value=t('goods.tips.company-missing');return}}
 busy.value=true;let saved=false
 try{const result=await httpRequest<any>(editing.value?'/api/warehouse/goods/'+props.goodsId:'/api/warehouse/goods/',{method:editing.value?'PUT':'POST',body,onError:err=>{error.value=bizErrorMessage(err)}});if(result){saved=true;showToast(t('action-results.success'),'success');await router.push('/goods/detail/'+(result.id||props.goodsId))}}finally{if(!saved)busy.value=false}
}
</script>
<template>
 <div class="w-goods-form w-scope">
  <header><nav><NuxtLink class="w-breadcrumb-link" to="/goods">{{t('nav.goods')}}</NuxtLink><span>/</span>{{title}}</nav><h1>{{title}}</h1></header>
  <WAlert v-if="error" tone="block" :title="error" />
  <WCard v-if="loading"><span role="status">{{t('common.status.loading')}}</span></WCard>
  <form v-else class="w-goods-form__card" @submit.prevent="save">
   <WFormSection :title="t('goods.form.basic-info')"><WFormGrid>
    <WField :label="t('goods.fields.name')" :error="errors.name"><WTextarea v-model="record.name" :rows="2" :maxlength="100" :disabled="busy" /></WField>
    <WField :label="t('goods.fields.code')" :span="6" :error="errors.code"><WInput v-model="record.code" maxlength="50" :disabled="busy" /></WField>
    <WField :label="t('goods.fields.category')" :span="6" optional><WSelect v-model="record.category" :options="options(categoriesOptions,categoryLabel)" :disabled="busy" placeholder="—" /></WField>
    <WField v-for="key in ['brand','manufacturer']" :key="key" :label="t('goods.fields.'+key)" :span="6" optional><WInput v-model="record[key]" maxlength="255" :disabled="busy" /></WField>
    <WField :label="t('goods.fields.tags')" optional><div class="w-goods-form__tags"><span v-for="value in tags" :key="value">{{value}}<button type="button" :disabled="busy" :aria-label="t('button.delete')+' '+value" @click="record.tags=tags.filter(item=>item!==value)">×</button></span><input v-model="tag" :disabled="busy" :aria-label="t('goods.form.placeholders.tag-add')" :placeholder="t('goods.form.placeholders.tag-add')" @keydown.enter.prevent="addTag" @blur="addTag"></div></WField>
   </WFormGrid></WFormSection>
   <WFormSection :title="t('goods.fields.price')"><WFormGrid>
    <WField v-for="key in ['price','discount_price']" :key="key" :label="t('goods.fields.'+key.replace('_','-'))" :span="4" optional><WInput v-model="record[key]" type="number" min="0" step="0.01" :disabled="busy" /></WField>
    <WField :label="t('goods.fields.currency')" :span="4"><WSelect v-model="record.currency" :options="options(currenciesOptions)" :disabled="busy" /></WField>
   </WFormGrid></WFormSection>
   <WFormSection :title="t('goods.form.specs')"><WFormGrid>
    <WField :label="t('goods.fields.unit')" :span="4"><WSelect v-model="record.unit" :options="options(unitsOptions,unitOptionLabel)" :disabled="busy" /></WField>
    <WField :label="t('goods.fields.weight')+' kg'" :span="4" optional><WInput v-model="record.weight" type="number" min="0" step="any" :disabled="busy" /></WField>
    <div class="w-span-4" />
    <WField v-for="key in ['length','width','height']" :key="key" :label="t('goods.fields.'+key)+' mm'" :span="4" optional><WInput v-model="record[key]" type="number" min="0" step="1" :disabled="busy" /></WField>
   </WFormGrid></WFormSection>
   <WFormSection :title="t('goods.fields.origin-country')"><WField :label="t('goods.fields.origin-country')" optional :hint="t('goods.form.tips.origin-country')"><CountryCombobox v-model="record.origin_country" :disabled="busy" /></WField></WFormSection>
   <WFormSection :title="t('goods.fields.image')"><div class="w-goods-form__image" :inert="busy"><ImageUploader v-model="image" upload-url="/api/warehouse/goods/image/upload" :size="96" shape="square" /></div></WFormSection>
   <WFormSection :title="t('goods.fields.description')"><div class="w-goods-form__editor" :inert="busy" @keydown.capture="touchDescription" @paste.capture="touchDescription" @drop.capture="touchDescription" @pointerdown.capture="touchDescription"><QuillEditor v-model:content="record.description" content-type="html" theme="snow" :toolbar="[['bold','italic','underline'],[{list:'ordered'},{list:'bullet'}],['link','clean']]" /></div></WFormSection>
   <WFormSection :title="t('goods.form.dates')"><WFormGrid><WField v-for="key in ['production_date','expiration_date']" :key="key" :label="t(key==='production_date'?'goods.fields.product-date':'goods.fields.expiry-date')" :span="6" optional><WDatePicker v-model="record[key]" :disabled="busy" /></WField></WFormGrid></WFormSection>
   <footer><WButton to="/goods" :disabled="busy">{{t('button.cancel')}}</WButton><WButton type="submit" variant="primary" :loading="busy">{{t('button.save')}}</WButton></footer>
  </form>
 </div>
</template>
<style scoped>
.w-goods-form { display:flex; flex-direction:column; gap:24px; }
.w-goods-form header { display:flex; flex-direction:column; gap:8px; }
.w-goods-form nav { display:flex; gap:8px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-breadcrumb-link { color:var(--w-text-3); }
.w-goods-form h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-goods-form__card { border:1px solid var(--w-border); border-radius:10px; background:var(--w-surface); }
.w-goods-form :deep(.w-form-section) { padding:24px 28px; }
.w-goods-form__tags { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-height:36px; border:1px solid var(--w-border-strong); border-radius:6px; padding:4px 8px; }
.w-goods-form__tags>span { display:flex; align-items:center; gap:4px; background:var(--w-line); border-radius:4px; padding:1px 6px; font-size:12px; line-height:20px; }
.w-goods-form__tags button { border:0; padding:0; background:transparent; color:var(--w-text-3); cursor:pointer; }
.w-goods-form__tags input { flex:1; min-width:120px; border:0; background:transparent; color:var(--w-text-1); font:inherit; outline:none; height:26px; }
.w-goods-form__tags:focus-within { border-color:var(--w-pri); box-shadow:var(--w-focus-ring); }
.w-goods-form__editor :deep(.ql-toolbar) { border:1px solid var(--w-border-strong); border-radius:6px 6px 0 0; background:var(--w-bg); }
.w-goods-form__editor :deep(.ql-container) { border:1px solid var(--w-border-strong); border-top:0; border-radius:0 0 6px 6px; font-family:var(--w-font); font-size:14px; line-height:22px; min-height:150px; }
.w-goods-form footer { display:flex; justify-content:flex-end; gap:8px; padding:16px 28px; border-top:1px solid var(--w-border); }
</style>
