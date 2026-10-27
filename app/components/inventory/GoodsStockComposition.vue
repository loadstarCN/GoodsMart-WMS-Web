<script setup lang="ts">
const props = defineProps<{ rows: any[]; goodsId: string | number; unit?: string }>()
const { t, locale } = useI18n()
const warehouseStore = useWarehouseStore()
const route = useRoute()
const fields = [
  ['onhand_stock', 'goods.ui.onhand'],
  ['available_stock_for_sale', 'goods.ui.available'],
  ['dn_stock', 'inventory.ui.occupied'],
  ['locked_stock', 'inventory.fields.locked'],
  ['picked_stock', 'inventory.fields.picked'],
  ['packed_stock', 'inventory.fields.packed'],
  ['return_stock', 'inventory.fields.return'],
  ['sorted_stock', 'goods.ui.pending'],
  ['damage_stock', 'inventory.fields.damage'],
  ['asn_stock', 'inventory.fields.asn'],
] as const
const totals = computed(() => Object.fromEntries(fields.map(([key]) => [key, props.rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)])))
const labels = computed(() => Object.fromEntries(fields.map(([key, label]) => [key, t(label)])))
const parts = computed(() => [
  { key: 'available_stock_for_sale', color: '#5F1FE6' },
  { key: 'dn_stock', color: '#B6A1F2' },
  { key: 'locked_stock', color: '#E99A0C' },
].map(part => ({ ...part, value: totals.value[part.key] || 0 })))
const qty = (key: string) => Number(totals.value[key] || 0).toLocaleString(locale.value)
const scope = computed(() => {
  const id = Number(route.query.warehouse_id) || warehouseStore.currentWarehouse?.id
  return id ? warehouseStore.warehouses.find(row => row.id === id)?.name || props.rows.find(row => row.warehouse_id === id)?.warehouse?.name || '—' : t('common.all-warehouse')
})
const formula = computed(() => `${labels.value.onhand_stock} ${qty('onhand_stock')} = ${parts.value.map(part => `${labels.value[part.key]} ${qty(part.key)}`).join(' + ')}`)
</script>

<template>
  <section class="w-goods-composition" :aria-label="t('inventory.ui.composition')">
    <header>
      <div class="w-goods-composition__title"><strong>{{ t('inventory.ui.composition') }}</strong><span>{{ formula }}</span></div>
      <div class="w-goods-composition__scope"><span>{{ [scope, unit].filter(Boolean).join(' · ') }}</span><NuxtLink class="w-goods-composition__link" :to="{path:'/inventory',query:{goods_id:String(goodsId),warehouse_id:route.query.warehouse_id}}">{{ t('goods.operations.view-inventory') }} →</NuxtLink></div>
    </header>
    <div class="w-goods-composition__bar" role="img" :aria-label="formula"><span v-for="part in parts.filter(part=>part.value>0)" :key="part.key" :style="{flex:part.value,background:part.color}" /></div>
    <div class="w-goods-composition__legend"><span v-for="part in parts" :key="part.key"><i :style="{background:part.color}" />{{ labels[part.key] }} <b>{{ qty(part.key) }}</b></span></div>
    <div class="w-goods-composition__outside"><span class="w-goods-composition__caption">{{ t('inventory.ui.outside') }}</span><span v-for="key in ['return_stock','sorted_stock','damage_stock','asn_stock']" :key="key" class="w-goods-composition__pill">{{ labels[key] }} <b>{{ qty(key) }}</b></span></div>
    <dl class="w-goods-composition__metrics"><div v-for="[key] in fields.slice(0,6)" :key="key"><dt>{{ labels[key] }}</dt><dd>{{ qty(key) }}</dd></div></dl>
  </section>
</template>

<style scoped>
.w-goods-composition { display:flex; flex-direction:column; gap:12px; padding:16px 20px; border:1px solid var(--w-border); border-radius:10px; }
.w-goods-composition header { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:8px 16px; }
.w-goods-composition__title { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 10px; }
.w-goods-composition__title strong { font-size:14px; line-height:22px; font-weight:600; }
.w-goods-composition__title>span { font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-goods-composition__scope { display:flex; flex-wrap:wrap; gap:8px 12px; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-goods-composition__link { color:var(--w-link); font-size:13px; font-weight:500; text-decoration:none; }
.w-goods-composition__link:hover { text-decoration:underline; }
.w-goods-composition__bar { display:flex; gap:2px; height:12px; border-radius:4px; overflow:hidden; background:var(--w-line); }
.w-goods-composition__bar span { min-width:2px; }
.w-goods-composition__legend { display:flex; flex-wrap:wrap; gap:4px 16px; font-size:12px; line-height:18px; color:var(--w-text-2); }
.w-goods-composition__legend>span { display:inline-flex; align-items:center; gap:6px; }
.w-goods-composition__legend i { width:8px; height:8px; border-radius:2px; }
.w-goods-composition b { font-weight:600; color:var(--w-text-1); }
.w-goods-composition__outside { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; font-size:12px; line-height:18px; }
.w-goods-composition__caption { color:var(--w-text-3); margin-right:2px; }
.w-goods-composition__pill { display:inline-flex; gap:6px; padding:2px 8px; background:var(--w-bg); border:1px solid var(--w-border); border-radius:6px; color:var(--w-text-2); }
.w-goods-composition__metrics { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px 16px; border-top:1px solid var(--w-line); padding-top:12px; margin:0; }
.w-goods-composition__metrics dt { font-size:12px; line-height:18px; font-weight:400; color:var(--w-text-3); }
.w-goods-composition__metrics dd { margin:2px 0 0; font-size:16px; line-height:24px; font-weight:600; font-variant-numeric:tabular-nums; }
@media(max-width:700px) { .w-goods-composition__metrics { grid-template-columns:repeat(3,minmax(0,1fr)); } }
</style>
