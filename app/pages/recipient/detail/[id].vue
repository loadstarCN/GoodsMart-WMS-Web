<script setup lang="ts">
import {addressLabelKeys} from '~/composables/address/structuredAddress'
import {countryName} from '~/data/countries'
const {t,te,locale}=useI18n(),route=useRoute(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const record=ref<any>(null),dns=ref<PaginationData|null>(null),error=ref(''),loading=ref(true)
let generation=0
const load=async()=>{const seq=++generation;loading.value=true;error.value='';const value=await httpRequest<any>('/api/warehouse/recipient/'+route.params.id,{onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}});if(seq!==generation)return;record.value=value;loading.value=false;if(value&&staff.hasPermission('dn_read')){const data=await httpRequest<PaginationData>('/api/warehouse/dn/',{params:{recipient_id:value.id,per_page:6}});if(seq===generation)dns.value=data}}
onMounted(load);watch(()=>route.params.id,load);onBeforeUnmount(()=>generation++)
useHead({title:()=>record.value?.name||t('nav.recipient')})
const addressLabel=(field:string)=>t(addressLabelKeys(field,record.value?.country).find(key=>te(key))||'common.fields.address')
const facts=computed(()=>[
 [t('common.fields.country'),countryName(record.value?.country,locale.value)],
 [t('address.fields.organization'),record.value?.organization],
 [t('common.fields.zip'),record.value?.zip_code],
 [addressLabel('admin_area'),record.value?.admin_area],
 [addressLabel('locality'),record.value?.locality],
 [addressLabel('dependent_locality'),record.value?.dependent_locality],
 [addressLabel('address_line1'),record.value?.address_line1],
 [addressLabel('address_line2'),record.value?.address_line2],
].filter(([,value])=>value))
const columns=computed(()=>[{key:'id',label:t('dn.entity')},{key:'stage',label:t('dn.list.columns.progress')},{key:'carrier',label:t('asn.list.tracking')},{key:'expected_shipping_date',label:t('dn.list.columns.date')},{key:'total_quantity',label:t('common.fields.quantity'),type:'qty' as const,keepZero:true,strong:true}])
</script>
<template>
 <div class="w-recipient-detail w-scope"><nav><NuxtLink class="w-recipient-back" to="/recipient">{{t('nav.recipient')}}</NuxtLink><span>/</span><span>{{record?.name}}</span></nav><WAlert v-if="error" tone="block" :title="error" /><WEmptyState v-if="loading" :title="t('common.status.loading')" />
 <template v-if="record"><header><div><h1>{{record.name}}</h1><WStatus variant="pill" :tone="record.is_active?'ok':'none'">{{t(record.is_active?'recipient.ui.enabled':'recipient.ui.disabled')}}</WStatus></div><WButton v-if="staff.hasPermission('recipient_edit')" :to="'/recipient/edit/'+record.id">{{t('button.edit')}}</WButton></header>
 <div class="w-recipient-detail__layout"><div class="w-recipient-detail__main">
  <WCard flush><div class="w-recipient-detail__section-head"><h2>{{t('common.fields.address')}}</h2></div><div class="w-recipient-detail__address"><address><StructuredAddressView :address="{...record,name:record.contact||record.name}" :legacy="record.address" with-names /></address><dl><template v-for="[label,value] in facts" :key="String(label)"><dt>{{label}}</dt><dd>{{value}}</dd></template></dl></div></WCard>
  <WCard v-if="dns" flush><div class="w-recipient-detail__section-head"><h2>{{t('dn.entity')}} <small>{{dns.total}}</small></h2><WButton variant="text" size="sm" :to="{path:'/dn',query:{recipient_id:record.id}}">{{t('common.status.all')}} →</WButton></div><WTable :rows="dns.items" :columns="columns" inset><template #cell-id="{row}"><NuxtLink class="w-recipient-record" :to="'/dn/detail/'+row.id">DN-{{row.id}}</NuxtLink><span class="w-recipient-detail__sub">{{row.order_number}}</span></template><template #cell-stage="{row}"><WStatus muted :tone="row.shipping_stage==='delivered'?'ok':row.shipping_stage==='exception'?'bad':row.shipping_stage==='closed'?'none':'info'">{{t('shipping.stage.'+row.shipping_stage)}}</WStatus></template><template #cell-carrier="{row}">{{row.shipping?.carrier_name}}<span class="w-recipient-detail__sub">{{row.shipping?.tracking_number}}</span></template></WTable></WCard>
 </div><aside>
  <WCard><h3>{{t('recipient.ui.contact')}}</h3><dl><dt>{{t('common.fields.contact')}}</dt><dd>{{record.contact||'—'}}</dd><dt>{{t('common.fields.phone')}}</dt><dd>{{record.phone||'—'}}</dd><dt>{{t('common.fields.email')}}</dt><dd>{{record.email||'—'}}</dd></dl></WCard>
  <WCard><h3>{{t('recipient.ui.customs')}}</h3><dl><dt>{{t('customs.fields.tax-id-type')}}</dt><dd>{{record.tax_id_type||'—'}}</dd><dt>{{t('customs.fields.recipient-tax-id')}}</dt><dd>{{record.tax_id||'—'}}</dd></dl></WCard>
  <WCard><h3>{{t('recipient.ui.source')}}</h3><dl><dt>{{t('recipient.ui.source')}}</dt><dd>{{t(record.external_reference?'recipient.ui.external':'recipient.ui.manual')}}</dd><dt>{{t('recipient.ui.external-id')}}</dt><dd>{{record.external_reference||'—'}}</dd></dl></WCard>
  <WCard><h3>{{t('recipient.ui.records')}}</h3><dl><dt>{{t('common.users.creator')}}</dt><dd>{{record.creator?.user_name}}</dd><dt>{{t('common.dates.created')}}</dt><dd>{{$dayjs(record.created_at,'YYYY/MM/DD HH:mm')}}</dd><dt>{{t('common.dates.updated')}}</dt><dd>{{$dayjs(record.updated_at,'YYYY/MM/DD HH:mm')}}</dd></dl></WCard>
 </aside></div></template></div>
</template>
<style scoped>
.w-recipient-detail { display:flex; flex-direction:column; gap:16px; }
.w-recipient-detail nav { display:flex; gap:8px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-recipient-back { color:var(--w-text-3); }
.w-recipient-detail header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:-8px; }
.w-recipient-detail header>div { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.w-recipient-detail h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; overflow-wrap:anywhere; }
.w-recipient-detail__layout { display:flex; flex-wrap:wrap; gap:16px; }
.w-recipient-detail__main { flex:999 1 600px; min-width:0; display:flex; flex-direction:column; gap:16px; }
.w-recipient-detail aside { flex:1 1 320px; min-width:0; display:flex; flex-direction:column; gap:16px; }
.w-recipient-detail aside :deep(.w-card__body) { padding:16px 20px 20px; display:flex; flex-direction:column; gap:10px; }
.w-recipient-detail h2 { margin:0; font-size:16px; line-height:24px; font-weight:600; }
.w-recipient-detail h2 small { font-size:13px; line-height:20px; color:var(--w-text-3); font-weight:400; }
.w-recipient-detail h3 { margin:0; font-size:14px; line-height:22px; font-weight:600; }
.w-recipient-detail__section-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 24px; border-bottom:1px solid var(--w-line); }
.w-recipient-detail__address { display:flex; flex-wrap:wrap; gap:24px; padding:20px 24px 24px; }
.w-recipient-detail__address address { flex:1 1 240px; margin:0; padding:12px 16px; border:1px solid var(--w-border); border-radius:6px; font-style:normal; font-size:14px; line-height:22px; overflow-wrap:anywhere; }
.w-recipient-detail dl { margin:0; display:grid; grid-template-columns:72px minmax(0,1fr); gap:6px 12px; font-size:13px; line-height:20px; }
.w-recipient-detail__address dl { flex:999 1 320px; grid-template-columns:112px minmax(0,1fr); align-content:start; }
.w-recipient-detail dt { color:var(--w-text-3); font-weight:400; }.w-recipient-detail dd { margin:0; overflow-wrap:anywhere; }
.w-recipient-detail :deep(.w-table) { min-width:620px; border-collapse:collapse; }.w-recipient-detail :deep(.w-table thead th) { height:auto; padding-top:10px; padding-bottom:8px; line-height:16px; }.w-recipient-detail :deep(.w-table__head) { vertical-align:top; }.w-recipient-detail :deep(.w-table tbody td) { padding-top:12px; padding-bottom:12px; }
.w-recipient-record { color:var(--w-text-1); font-size:14px; font-weight:500; }.w-recipient-detail__sub { display:block; color:var(--w-text-3); font-size:12px; line-height:18px; }
</style>
