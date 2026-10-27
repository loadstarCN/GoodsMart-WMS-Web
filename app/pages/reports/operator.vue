<script setup lang="ts">
import OperatorOverview from '~/components/reports/OperatorOverview.vue'
import {ledgerDateRange} from '~/utils/ledgerDateRange'
const {t}=useI18n(),warehouses=useWarehouseStore(),staff=useStaffStore()
const warehouseId=computed(()=>warehouses.currentWarehouse?.id||null)
const timezone=computed(()=>warehouses.currentWarehouse?.timezone||'UTC')
const period=ref(ledgerDateRange('month',timezone.value)!)
const kinds=computed(()=>(['picking','packing'] as const).filter(kind=>staff.hasPermission(kind+'_read')))
watch(timezone,()=>{period.value=ledgerDateRange('month',timezone.value)!})
onMounted(()=>warehouses.fetchWarehouses())
useHead({title:()=>t('operator-report.title')})
</script>
<template><div class="operator-report w-scope"><header><p>{{warehouses.currentWarehouse?.name||t('common.all-warehouse')}} · {{timezone}}</p><h1>{{t('operator-report.title')}}</h1></header><WEmptyState v-if="!warehouseId" :title="t('warehouse-scope.select-top')"/><template v-else><StockReportPeriod :start="period.start_time" :end="period.end_time" :timezone="timezone" @change="value=>period=value"/><p class="scope-note">{{t('operator-report.scope')}}</p><OperatorOverview v-if="kinds.length" :warehouse-id="warehouseId" :start="period.start_time" :end="period.end_time"/></template></div></template>
<style scoped>
.operator-report{display:flex;flex-direction:column;gap:16px}.operator-report>:deep(.report-period){align-self:flex-start}h1{margin:4px 0 0;font-size:24px;line-height:32px;font-weight:600}header p,.scope-note{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}
</style>
