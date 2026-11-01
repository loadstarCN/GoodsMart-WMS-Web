<script setup lang="ts">
import LabelLotPicker from './LabelLotPicker.vue'
const props=defineProps<{stock:any;goodsId:number}>()
const open=defineModel<boolean>('open',{default:false})
const emit=defineEmits<{saved:[]}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const lot=ref<any>(null),quantity=ref<number|null>(null),reason=ref(''),busy=ref(false),error=ref(''),requestId=ref('')
const dirty=computed(()=>open.value&&(!!lot.value||quantity.value!==null||!!reason.value))
useUnsavedForm(()=>dirty.value||busy.value,()=>busy.value)
let closing=false
const close=async()=>{if(busy.value||closing)return;closing=true;try{if(dirty.value&&!await wConfirm({title:t('unsaved-form.title'),message:t('unsaved-form.message'),confirmText:t('unsaved-form.leave'),cancelText:t('unsaved-form.stay')}))return;open.value=false}finally{closing=false}}
const modalOpen=computed({get:()=>open.value,set:value=>{if(!value)void close()}})
watch(open,value=>{if(value){lot.value=null;quantity.value=null;reason.value='';error.value='';requestId.value=crypto.randomUUID()}},{immediate:true})
const save=async()=>{
 if(busy.value)return
 if(!lot.value||lot.value.id===props.stock.lot_id||!Number.isInteger(quantity.value)||Number(quantity.value)<=0||Number(quantity.value)>props.stock.quantity||!reason.value.trim()){error.value=t('lot-rules.relabel-validation');return}
 busy.value=true;error.value=''
 try{const result=await httpRequest<any>('/api/warehouse/inventory/lot-relabel',{method:'POST',headers:warehouseHeaders(props.stock.location?.warehouse_id||props.stock.warehouse_id),body:{goods_id:props.goodsId,location_id:props.stock.location_id,from_lot_id:props.stock.lot_id,to_lot_id:lot.value.id,quantity:quantity.value,reason:reason.value.trim(),request_id:requestId.value},onError:e=>error.value=bizErrorMessage(e)});if(result){open.value=false;emit('saved');showToast(t('action-results.success'),'success')}}finally{busy.value=false}
}
</script>
<template><WModal v-model:open="modalOpen" :title="t('lot-rules.relabel')" :closable="!busy"><p>{{t('lot-rules.relabel-help')}}</p><p>{{stock?.location?.code||stock?.location_code}} · {{stock?.lot_no||t('lot-rules.unassigned')}} · {{stock?.quantity}}</p><WAlert v-if="error" tone="block" :title="error"/><LabelLotPicker v-model="lot" :goods-id="goodsId" :disabled="busy"/><WFormGrid><WField :label="t('common.fields.quantity')"><WInput v-model.number="quantity" type="number" min="1" step="1" :max="stock?.quantity" :disabled="busy"/></WField><WField :label="t('common.fields.remark')"><WTextarea v-model="reason" :maxlength="255" :disabled="busy"/></WField></WFormGrid><template #footer><WButton :disabled="busy" @click="close">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="busy" @click="save">{{t('button.confirm')}}</WButton></template></WModal></template>
