<script setup lang="ts">
type Lot={id:number;goods_id:number;lot_no:string;production_date:string|null;expiry_date:string|null;status:string}
const props=defineProps<{goodsId:number}>()
const model=defineModel<Lot|null>({default:null})
const {t}=useI18n(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const rows=ref<Lot[]>([]),error=ref(''),open=ref(false),busy=ref(false)
const form=reactive({lot_no:'',production_date:'',expiry_date:''})
const selected=computed({get:()=>model.value?.id??null,set:(value:number|null|undefined)=>model.value=rows.value.find(row=>row.id===value)||null})
const search=async(keyword:string)=>{
 const goodsId=props.goodsId
 const response=await httpRequest<{items:Lot[]}>('/api/warehouse/goods/'+goodsId+'/lots',{params:{keyword,per_page:100},onError:err=>{if(props.goodsId===goodsId)error.value=bizErrorMessage(err)}})
 if(props.goodsId!==goodsId)return []
 if(response){error.value='';const merged=new Map(rows.value.map(row=>[row.id,row]));for(const row of response.items)merged.set(row.id,row);rows.value=[...merged.values()];return response.items.map(row=>({value:row.id,label:row.lot_no,description:row.expiry_date?t('goods-label.expiry')+' '+row.expiry_date:''}))}
 return []
}
const start=()=>{form.lot_no='';form.production_date='';form.expiry_date='';error.value='';open.value=true}
const save=async()=>{
 if(busy.value)return
 if(!form.lot_no.trim()){error.value=t('goods-label.lot-required');return}
 if(form.production_date&&form.expiry_date&&form.expiry_date<form.production_date){error.value=t('goods-label.invalid-dates');return}
 busy.value=true;error.value=''
 try{
  const row=await httpRequest<Lot>('/api/warehouse/goods/'+props.goodsId+'/lots',{method:'POST',body:{...form},onError:err=>error.value=err.status===409?t('goods-label.duplicate-lot'):bizErrorMessage(err)})
  if(row){rows.value.push(row);model.value=row;open.value=false}
 }finally{busy.value=false}
}
watch(()=>props.goodsId,()=>{rows.value=[];model.value=null;error.value=''})
</script>
<template>
 <div class="w-label-lot-picker"><WField :label="t('goods-label.lot')"><WCombobox v-model="selected" :search="search" :selected-label="model?.lot_no" :placeholder="t('goods-label.no-lot')" clearable two-line /></WField><WButton v-if="staff.hasPermission('goods_edit')" @click="start">{{t('goods-label.register-lot')}}</WButton><span v-if="model" class="expiry">{{t('goods-label.expiry')}} {{model.expiry_date||'—'}}</span><WAlert v-if="error&&!open" tone="block" :title="error" /></div>
 <WModal v-model:open="open" :title="t('goods-label.register-lot')" :closable="!busy"><p class="w-label-lot-note">{{t('goods-label.register-note')}}</p><WAlert v-if="error" tone="block" :title="error"/><WFormGrid><WField :label="t('goods-label.lot')"><WInput v-model="form.lot_no" maxlength="40" :disabled="busy" /></WField><WField :label="t('goods.fields.product-date')" optional><WInput v-model="form.production_date" type="date" :disabled="busy" /></WField><WField :label="t('goods-label.expiry')" optional><WInput v-model="form.expiry_date" type="date" :min="form.production_date||undefined" :disabled="busy" /></WField></WFormGrid><template #footer><WButton :disabled="busy" @click="open=false">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="busy" @click="save">{{t('button.save')}}</WButton></template></WModal>
</template>
<style scoped>
.w-label-lot-picker{display:flex;flex-wrap:wrap;gap:12px;align-items:end;border-top:1px solid var(--w-line);margin-top:16px;padding-top:16px}.w-label-lot-picker>.w-field{width:280px}.expiry{font-size:13px;line-height:20px;color:var(--w-text-2);padding-bottom:8px}.w-label-lot-note{font-size:13px;line-height:20px;color:var(--w-text-3);margin:0 0 16px}
</style>
