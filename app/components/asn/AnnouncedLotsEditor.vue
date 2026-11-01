<script setup lang="ts">
type Announcement={lot_code:string;expiry_date:string|null;quantity:number}
const model=defineModel<Announcement[]|null>()
defineProps<{disabled?:boolean}>()
const {t}=useI18n()
const add=()=>{model.value=[...(model.value||[]),{lot_code:'',expiry_date:null,quantity:1}]}
const remove=(index:number)=>{model.value=(model.value||[]).filter((_,i)=>i!==index)}
</script>
<template><div class="announced-lots">
 <div v-for="(lot,index) in model||[]" :key="index" class="announced-lots__row">
  <WInput v-model="lot.lot_code" :disabled="disabled" :aria-label="t('announced-lots.code')" :placeholder="t('announced-lots.code')" maxlength="40"/>
  <WDatePicker v-model="lot.expiry_date" :disabled="disabled" :aria-label="t('announced-lots.expiry')" :placeholder="t('announced-lots.expiry')"/>
  <div class="announced-lots__quantity"><WInput v-model.number="lot.quantity" type="number" min="1" step="1" :disabled="disabled" :aria-label="t('common.fields.quantity')"/><WButton variant="text" size="sm" :disabled="disabled" @click="remove(index)">{{t('button.delete')}}</WButton></div>
 </div>
 <WButton variant="text" size="sm" :disabled="disabled||(model?.length||0)>=100" @click="add">{{t('announced-lots.add')}}</WButton>
</div></template>
<style scoped>.announced-lots{display:flex;flex-direction:column;gap:8px;min-width:210px}.announced-lots__row{display:flex;flex-direction:column;gap:5px;padding:8px;border:1px solid var(--w-line,#dfe2e8);border-radius:6px}.announced-lots__quantity{display:flex;gap:6px;align-items:center}.announced-lots__quantity>:first-child{min-width:0;flex:1}</style>
