<script setup lang="ts">
import { packagePrintSummary } from '~/utils/packagePrint'
const props=defineProps<{data:any;translate:(key:string)=>string}>()
const boxes=computed(()=>props.data?.packages||[])
const summary=computed(()=>packagePrintSummary(boxes.value))
const t=(key:string)=>props.translate(key)
const format=(n:number|null,digits=3)=>n==null?'—':n.toFixed(digits)
</script>
<template>
 <section class="shipment-contents">
  <h2>PACKED LOTS · {{t('carton-label.packed')}}</h2>
  <table><thead><tr><th>Item / {{t('common.entities.goods')}}</th><th>Lot / {{t('packing-lots.lot')}}</th><th>Expiry</th><th class="qty">Packed</th></tr></thead><tbody><tr v-for="row in data?.items||[]" :key="row.goods_id+':'+row.lot_id"><td><b>{{row.goods_code}}</b><span>{{row.goods_name}}</span></td><td>{{row.lot_no||'—'}}</td><td>{{row.expiry_date||'—'}}</td><td class="qty">{{row.quantity}}</td></tr><tr v-if="!data?.items?.length"><td colspan="4">—</td></tr></tbody></table>
  <template v-if="boxes.length">
   <h2>CARTON CONTENTS · {{t('carton-label.contents')}}</h2>
   <div class="totals"><b>{{summary.count}} CTN</b><span>G.W. {{format(summary.grossWeight)}} kg</span><span>{{format(summary.volume,6)}} m³</span><b>{{summary.quantity??'—'}} PCS</b></div>
   <section v-for="box in boxes" :key="box.package_no" class="carton">
    <h3><b>CTN {{box.package_no}} / {{boxes.length}}</b><span>{{box.length_mm??'—'}} × {{box.width_mm??'—'}} × {{box.height_mm??'—'}} mm</span><span>G.W. {{box.gross_weight_kg??'—'}} kg</span></h3>
    <p v-if="!Array.isArray(box.contents)">{{t('carton-label.unknown-contents')}}</p>
    <table v-else><thead><tr><th>Item</th><th>Lot</th><th>Expiry</th><th class="qty">Qty · PCS</th></tr></thead><tbody><tr v-for="(row,index) in box.contents" :key="index"><td><b>{{row.goods_code}}</b><span>{{row.goods_name}}</span></td><td>{{row.lot_no||'—'}}</td><td>{{row.expiry_date||'—'}}</td><td class="qty">{{row.quantity}}</td></tr></tbody></table>
    <p v-if="box.remark">{{box.remark}}</p>
   </section>
  </template>
 </section>
</template>
<style scoped>
.shipment-contents{margin-top:18px}h2{font-size:10px;line-height:16px;margin:12px 0 5px;break-after:avoid}table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:9px;line-height:1.4}th,td{padding:6px 4px;text-align:left;border-bottom:1px solid #CDD1DA;overflow-wrap:anywhere;vertical-align:top}th{border-top:1px solid #151923}th:first-child{width:42%}.qty{text-align:right;width:12%}td span{display:block;color:#4C5261}.totals,h3{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.totals{border-block:1px solid #151923;padding:8px 4px;font-size:10px}h3{font-size:10px;line-height:16px;margin:12px 0 4px;break-after:avoid}h3 span{font-weight:400}p{font-size:9px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}
</style>
