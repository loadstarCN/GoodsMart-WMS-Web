<script setup lang="ts">
import { categoriesOptions } from '~/data/selectOptions'
const { t, locale } = useI18n()
const { categoryLabel } = useOptionLabel()
const { bizErrorMessage } = useBizError()
const route = useRoute(), router = useRouter(), staff = useStaffStore()
useHead({ title: () => t('nav.goods') })
const data = ref<PaginationData | null>(null), loading = ref(true), error = ref(''), busy = ref(false)
const keyword = ref(String(route.query.keyword || '')), brand = ref(String(route.query.brand || ''))
const stocks = ref<Record<number, Record<string, number>> | null>(null)
const active = computed(() => String(route.query.is_active || 'true'))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const tabs = computed(() => ['true','false','all'].map((key, index) => ({ key, label: t(['common.status.active','common.status.inactive','common.status.all'][index]!), count: active.value === key ? data.value?.total : undefined })))
const categories = computed(() => categoriesOptions.map(value => ({ value, label: categoryLabel(value) })))
const specOptions = computed(() => [{value:'weight',label:t('goods.fields.weight')},{value:'dimensions',label:t('goods.ui.dimensions')},{value:'origin_country',label:t('goods.fields.origin-country')}])
const specMissing = computed(() => String(route.query.spec_missing || '').split(',').filter(Boolean))
const stockKeys = ['onhand_stock','available_stock_for_sale','sorted_stock','sorted_damage_stock']
const columns = computed(() => [
  {key:'goods',label:t('nav.goods'),wrap:true,width:'30%'}, {key:'brand',label:t('goods.ui.brand-maker'),wrap:true},
  {key:'price',label:t('goods.fields.price'),align:'right' as const},
  ...(staff.hasPermission('inventory_read') ? stockKeys.slice(0,3).map((key,index)=>({key,label:t(['goods.ui.onhand','goods.ui.available','goods.ui.pending'][index]!),type:'qty' as const,strong:index===1,keepZero:index===1,value:(row:any)=>stocks.value?.[row.id]?.[key]})) : []),
  {key:'info',label:t('goods.ui.info'),wrap:true}, {key:'actions',label:t('common.fields.action'),align:'right' as const},
])
const go = (patch:Record<string,any>, keepPage=false) => {
  const query:Record<string,any> = {...route.query,...patch}
  for(const key of Object.keys(query)) if(query[key] == null || query[key] === '') delete query[key]
  if(!keepPage) delete query.page
  router.push({query})
}
const toggle = (key:string) => go({[key]:route.query[key] === 'true' ? undefined : 'true'})
const toggleSpec = (value:string) => go({spec_missing:(specMissing.value.includes(value) ? specMissing.value.filter(v=>v!==value) : [...specMissing.value,value]).join(',')})
let generation=0
const load = async () => {
  const seq=++generation
  loading.value=true;error.value='';stocks.value=null
  const result=await httpRequest<PaginationData>('/api/warehouse/goods/',{params:{...route.query,per_page:50},onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
  if(seq!==generation)return
  data.value=result;loading.value=false
  if(!result?.items?.length || !staff.hasPermission('inventory_read'))return
  const summary:Record<number,Record<string,number>>={}
  for(const goods of result.items) summary[goods.id]=Object.fromEntries(stockKeys.map(k=>[k,0]))
  let stockPage=1
  while(seq===generation){
    const stock=await httpRequest<PaginationData>('/api/warehouse/inventory/',{params:{goods_codes:result.items.map((g:any)=>g.code).join(','),page:stockPage,per_page:100},onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
    if(!stock || seq!==generation)return
    for(const row of stock.items) for(const key of stockKeys) if(summary[row.goods_id]) summary[row.goods_id]![key]!+=Number(row[key] || 0)
    if(stockPage >= stock.pages)break
    stockPage++
  }
  if(seq===generation)stocks.value=summary
}
const act = async(row:any, action:'delete'|'toggle')=>{
  if(busy.value)return
  busy.value=true
  try{
    if(action==='delete' && !await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:row.name}),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return
    let success=false
    await httpRequest('/api/warehouse/goods/'+row.id,{method:action==='delete'?'DELETE':'PUT',...(action==='toggle'?{body:{is_active:!row.is_active}}:{}),onSuccess:()=>{success=true},onError:err=>showToast(bizErrorMessage(err),'error')})
    if(success){showToast(t('action-results.success'),'success');await load()}
  }finally{busy.value=false}
}
const missing=(row:any)=>specOptions.value.filter(o=>o.value==='dimensions' ? !row.length||!row.width||!row.height : !row[o.value]).map(o=>o.label)
const money=(value:any,currency:string)=>value==null?'':new Intl.NumberFormat(locale.value,{style:'currency',currency:currency||'JPY'}).format(value)
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');brand.value=String(route.query.brand||'');load()})
onMounted(load)
onBeforeUnmount(()=>{generation++})
</script>
<template>
  <div class="w-goods w-scope">
    <header class="w-goods__header"><h1>{{ t('nav.goods') }}<small>{{ data?.total?.toLocaleString(locale) }}</small></h1><div class="w-goods__actions">
      <WButton :to="{path:'/goods/export',query:route.query}">{{ t('goods.ui.export') }}</WButton>
      <WButton v-if="staff.hasPermission('goods_add','goods_edit')" to="/goods/upload">{{ t('goods.ui.import') }}</WButton>
      <WButton v-if="staff.hasPermission('goods_edit')" to="/goods/add" variant="primary">{{ t('goods.operations.add') }}</WButton>
    </div></header>
    <WCard flush>
      <WTabs inset :model-value="active" :items="tabs" :label="t('goods.title')" @update:model-value="value=>go({is_active:value})" />
      <form class="w-goods__filters" @submit.prevent="go({keyword:keyword.trim(),brand:brand.trim()})">
        <WInput v-model="keyword" class="w-goods__search" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')"><template #prefix><WIcon name="search" :size="16" /></template></WInput>
        <WInput v-model="brand" class="w-goods__brand" :placeholder="t('goods.fields.brand')" :aria-label="t('goods.ui.brand-filter')" @blur="go({brand:brand.trim()})" />
        <WFilterSelect :model-value="String(route.query.category||'')||null" :options="categories" :label="t('goods.fields.category')" @change="value=>go({category:value})" />
        <button class="w-goods__pill" :class="{'is-selected':route.query.image_missing==='true'}" type="button" :aria-pressed="route.query.image_missing==='true'" @click="toggle('image_missing')"><span class="w-goods__dot" />{{ t('goods.ui.image-missing') }}</button>
        <WDropdown :label="t('goods.ui.spec-missing')" width="220px"><template #trigger="{attrs}"><button v-bind="attrs" class="w-goods__pill" :class="{'is-selected':specMissing.length}"><span class="w-goods__dot" />{{ t('goods.ui.spec-missing') }}<WIcon name="chevron-down" :size="14" /></button></template>
          <button v-for="option in specOptions" :key="option.value" class="w-menu-item" role="menuitemcheckbox" :aria-checked="specMissing.includes(option.value)" @click="toggleSpec(option.value)">{{ specMissing.includes(option.value)?'✓':'' }} {{ option.label }}</button>
        </WDropdown>
        <button class="w-goods__pill" :class="{'is-selected':route.query.has_stock==='true'}" type="button" :aria-pressed="route.query.has_stock==='true'" @click="toggle('has_stock')">{{ t('goods.ui.has-stock') }}</button>
      </form>
      <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{ t('dn.list.retry') }}</WButton></template></WAlert>
      <WTable :columns="columns" :rows="data?.items||[]" :loading="loading" inset>
        <template #cell-goods="{row}"><div class="w-goods__product"><img v-if="row.thumbnail_url" :src="row.thumbnail_url" alt="" loading="lazy"><span v-else class="w-goods__image"><WIcon name="box" :size="18" /></span><div><NuxtLink class="w-goods__name" :to="'/goods/detail/'+row.id">{{ row.name }}</NuxtLink><span class="w-goods__sub">{{ row.code }}</span></div></div></template>
        <template #cell-brand="{row}"><span>{{ row.brand }}</span><span class="w-goods__sub">{{ row.manufacturer }}</span></template>
        <template #cell-price="{row}"><span>{{ money(row.price,row.currency) }}</span><span v-if="row.discount_price!=null" class="w-goods__sub">{{ money(row.discount_price,row.currency) }}</span></template>
        <template #cell-info="{row}"><WStatus v-if="!missing(row).length" tone="ok">{{ t('goods.ui.complete') }}</WStatus><WStatus v-else tone="warn" variant="pill">{{ t('goods.ui.missing',{fields:missing(row).join(' · ')}) }}</WStatus></template>
        <template #cell-actions="{row}"><WDropdown :label="t('common.fields.action')" width="180px" placement="bottom-end"><template #trigger="{attrs}"><WButton v-bind="attrs" size="sm" :aria-label="t('common.fields.action')">•••</WButton></template>
          <NuxtLink v-if="staff.hasPermission('goods_edit')" class="w-menu-item" role="menuitem" :to="'/goods/edit/'+row.id">{{ t('button.edit') }}</NuxtLink>
          <NuxtLink v-if="staff.hasPermission('inventory_read')" class="w-menu-item" role="menuitem" :to="'/inventory?goods_id='+row.id">{{ t('goods.operations.view-inventory') }}</NuxtLink>
          <button v-if="staff.hasPermission('goods_edit')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'toggle')">{{ t(row.is_active?'goods.ui.deactivate':'goods.ui.activate') }}</button>
          <button v-if="staff.hasPermission('goods_delete')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'delete')">{{ t('button.delete') }}</button>
        </WDropdown></template>
      </WTable>
      <footer class="w-goods__footer"><WPagination :page="page" :page-size="50" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer>
    </WCard>
  </div>
</template>
<style scoped>
.w-goods { display:flex; flex-direction:column; gap:16px; }
.w-goods__header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.w-goods h1 { display:flex; align-items:baseline; gap:10px; margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-goods h1 small { font-size:13px; line-height:20px; font-weight:400; color:var(--w-text-3); }
.w-goods__actions,.w-goods__filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.w-goods__filters { padding:12px 20px; border-bottom:1px solid var(--w-line); }
.w-goods__search { flex:1 1 260px; max-width:360px; }
.w-goods__brand { width:140px; }
.w-goods__pill { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 12px; border:1px solid var(--w-border-strong); border-radius:999px; background:var(--w-surface); color:var(--w-text-2); font:inherit; font-size:13px; line-height:20px; cursor:pointer; }
.w-goods__pill.is-selected { border-color:var(--w-pri); background:var(--w-sel-soft); color:var(--w-sel-text); }
.w-goods__dot { width:6px; height:6px; border-radius:50%; background:var(--w-warn-dot); }
.w-goods__product { display:flex; align-items:center; gap:12px; min-width:220px; }
.w-goods__product img,.w-goods__image { width:40px; height:40px; object-fit:contain; border-radius:6px; flex:none; }
.w-goods__image { display:grid; place-items:center; background:var(--w-line); color:var(--w-nontext); }
.w-goods__name { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:14px; line-height:20px; font-weight:500; color:var(--w-text-1); }
.w-goods__name:hover { color:var(--w-link); }
.w-goods__sub { display:block; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-goods :deep(table) { min-width:1000px; }
.w-goods__footer { padding:12px 20px; border-top:1px solid var(--w-border); }
.w-goods :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.w-goods :deep(.w-table) { border-collapse:collapse; }
.w-goods :deep(.w-table thead th) { height:auto; padding-top:12px; padding-bottom:8px; line-height:16px; }
.w-goods :deep(.w-table__head) { vertical-align:top; }
.w-goods :deep(.w-table tbody td) { padding-top:12px; padding-bottom:12px; }
</style>
