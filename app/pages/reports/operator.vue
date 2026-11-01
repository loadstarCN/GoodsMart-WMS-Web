<script setup lang="ts">
import OperatorOverview from '~/components/reports/OperatorOverview.vue'
import {ledgerDateRange} from '~/utils/ledgerDateRange'
const {t}=useI18n(),warehouses=useWarehouseStore(),staff=useStaffStore()
const ready=ref(false),error=ref('')
let disposed=false
const destinationCountry=ref<string|null>(null)
const warehouseId=computed(()=>warehouses.currentWarehouse?.id||null)
const timezone=computed(()=>warehouses.currentWarehouse?.timezone||'UTC')
const period=ref(ledgerDateRange('month',timezone.value)!)
const kinds=computed(()=>(['picking','packing'] as const).filter(kind=>ready.value&&staff.refreshed&&staff.staffInfo&&staff.hasPermission(kind+'_read')))
watch(timezone,()=>{period.value=ledgerDateRange('month',timezone.value)!})
const initialize=async()=>{ready.value=false;error.value='';const current=await staff.getCurrentStaffInfo();if(disposed)return;if(!current){error.value=t('action-results.failed');return}warehouses.syncWarehouses();ready.value=true}
onMounted(initialize);onBeforeUnmount(()=>{disposed=true})
useHead({title:()=>t('operator-report.title')})
</script>
<template><div class="operator-report w-scope"><header><p>{{warehouses.currentWarehouse?.name||t('common.all-warehouse')}} · {{timezone}}</p><h1>{{t('operator-report.title')}}</h1></header><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="initialize">{{t('dn.list.retry')}}</WButton></template></WAlert><WEmptyState v-if="!warehouseId" :title="t('warehouse-scope.select-top')"/><template v-else><StockReportPeriod :start="period.start_time" :end="period.end_time" :timezone="timezone" @change="value=>period=value"/><label class="destination-filter"><span>{{t('operator-comparison.destination')}}</span><CountryCombobox v-model="destinationCountry" :placeholder="t('operator-comparison.all')"/></label><p class="scope-note">{{t('operator-report.scope')}} {{t('operator-comparison.scope')}}</p><OperatorOverview v-if="kinds.length" :warehouse-id="warehouseId" :start="period.start_time" :end="period.end_time" :destination-country="destinationCountry"/></template></div></template>
<style scoped>
.destination-filter{display:flex;align-items:center;gap:10px;max-width:360px;font-size:13px}.destination-filter>span{flex-shrink:0}.operator-report{display:flex;flex-direction:column;gap:16px}.operator-report>:deep(.report-period){align-self:flex-start}h1{margin:4px 0 0;font-size:24px;line-height:32px;font-weight:600}header p,.scope-note{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}
</style>
