<script lang="ts" setup>
/**
 * 发货单详情：发货流程的工作台（设计稿 Main.dc.html；各步的界面参照 DeliveryCustoms / DeliveryPrint / Delivery / CarrierSteps）。
 * - 标题行：单号、当前发货阶段（全页唯一的浅底胶囊）、国内 / 跨境 · 发货国 → 目的国 · 需报关 · 承运商；
 *   订单号、单据状态、来源、仓库 · 时区；右边「打印发货单」和「更多」（修改收件地址、编辑、开始作业、关闭、取消、删除）
 * - 进度卡（DnFlowProgress）：三段九步 + 「要处理」条；点节点换下面的步骤卡
 * - 主列：当前步骤卡（DnFlowStepCard，在这里做事）、处理记录（DnFlowHistory）、商品（DnGoodsCard）
 * - 右栏（DnDetailAside）：收件地址、运单与包裹、运费、报关单证、单据信息
 * 发货单读 GET /dn/<id>；流程与报关视图由 composables/shipping/useShippingFlowView 读，提供给各卡片。
 * 做了操作（流程里的、更多菜单里的、改收件地址、补录报关数据）后单据与流程一起重读。条码在打印页。
 */
import { SHIPPING_FLOW_VIEW, useShippingFlowView } from '~/composables/shipping/useShippingFlowView'
import { activeStepKey } from '~/composables/shipping/shippingFlow'
import { countryName } from '~/data/countries'
import { dnStageTone } from '~/utils/dnList'

definePageMeta({})

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { bizErrorMessage } = useBizError()
const dnId = computed(() => String(route.params.id))

useHead({ title: () => `DN-${dnId.value}` })

// ------------------ 发货单 ----------------------
const dn = ref<Record<string, any> | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)
let dnRequest = 0
const fetchDn = async () => {
  const request = ++dnRequest
  const id = dnId.value
  const current = () => request === dnRequest && id === dnId.value
  loadError.value = null
  await httpRequest<any>(`/api/warehouse/dn/${id}`, {
    method: 'GET',
    onSuccess: (data) => {
      if (!current()) return
      dn.value = data
      notFound.value = false
    },
    onError: (error) => {
      if (!current()) return
      notFound.value = error.status === 404
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      if (current()) loading.value = false
    },
  })
}

// ------------------ 流程（各卡片共用） ----------------------
const view = useShippingFlowView({ dnId, warehouseId: () => dn.value?.warehouse_id ?? null })
provide(SHIPPING_FLOW_VIEW, view)
/** 发货单所属仓库的时区（页面自己在 provide 的一侧，用 view 的，不用 useTimeZone） */
const zoneAbbr = computed(() => timeZoneAbbr(view.flowTimeZone.value))
const zoneDescription = computed(() => timeZoneDescription(view.flowTimeZone.value))

const load = () => Promise.all([fetchDn(), view.load()])
onMounted(load)
watch(dnId, () => {
  dn.value = null
  loading.value = true
  selected.value = null
  view.reset()
  load()
})
/** 做了操作：单据与流程一起重读（流程里的详细内容按 version 各自重读） */
const refreshAll = async () => {
  await Promise.all([fetchDn(), view.reload()])
}

// ------------------ 步骤卡看哪一步 ----------------------
const selected = ref<string | null>(null)
const stepCard = ref<{ openStep: (key: string, action?: string) => Promise<void> } | null>(null)
const shownKey = computed(() => selected.value || activeStepKey(view.flow.value?.steps || []))
const onSelect = (key: string | null) => {
  selected.value = key && key !== activeStepKey(view.flow.value?.steps || []) ? key : null
  nextTick(() => document.getElementById('dn-step-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
}
const cancelWaybill = () => stepCard.value?.openStep('waybill', 'cancel_waybill')

// ------------------ 标题行 ----------------------
const stage = computed(() => view.flow.value?.stage || null)
const STAGE_PILL: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'none'> = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info', none: 'none' }
const stageTone = computed(() => STAGE_PILL[dnStageTone(stage.value, dn.value?.status)] || 'none')
const routeText = computed(() => {
  const r = view.flow.value?.route
  const carrier = view.flow.value?.carrier?.name || dn.value?.carrier?.name || ''
  if (!r) return carrier
  const parts = [r.international ? t('dn.detail.cross-border') : t('shipping.route.domestic')]
  if (r.international && (r.origin_country || r.destination_country)) {
    parts.push(`${r.origin_country || '—'} → ${r.destination_country || '—'}`)
  }
  if (r.requires_customs) parts.push(t('shipping.route.customs'))
  if (carrier) parts.push(carrier)
  return parts.join(' · ')
})
const destinationTitle = computed(() => {
  const code = view.flow.value?.route.destination_country
  return code ? countryName(code, locale.value) : undefined
})
/** 来源：来源系统（API 建的单）/ 手工创建 */
const sourceText = computed(() => {
  const ordered = view.flow.value?.steps.find((s) => s.key === 'ordered')
  if (!ordered?.source) return ''
  return ordered.source === 'api' ? t('shipping.sources.api') : t('dn.detail.source-manual')
})

// ------------------ 弹窗 / 抽屉 ----------------------
const shipToOpen = ref(false)
const editorOpen = ref(false)
const historyOpen = ref(false)
const dataOpen = ref(false)
const historyKey = computed(() => (view.customsView.value?.current_documents || []).map((d) => d.id).join(','))
</script>

<template>
  <div class="w-dnd w-scope">
    <nav class="w-dnd__crumbs" :aria-label="t('dn.detail.breadcrumb')">
      <NuxtLink to="/dn" class="w-dnd__crumb">{{ t('nav.DN') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <span>DN-{{ dnId }}</span>
    </nav>

    <!-- 读不到 -->
    <WCard v-if="!dn && !loading && loadError">
      <WEmptyState :title="notFound ? t('dn.detail.not-found') : loadError" icon="search-off">
        <template #action>
          <WButton v-if="!notFound" size="sm" @click="load">{{ t('dn.list.retry') }}</WButton>
          <WButton v-else size="sm" to="/dn">{{ t('dn.detail.back-to-list') }}</WButton>
        </template>
      </WEmptyState>
    </WCard>

    <template v-else>
      <header class="w-dnd__head">
        <div class="w-dnd__heading">
          <div class="w-dnd__title-row">
            <h1 class="w-dnd__title">DN-{{ dnId }}</h1>
            <WStatus v-if="stage" :tone="stageTone" variant="pill">{{ t(`shipping.stage.${stage}`) }}</WStatus>
            <span v-if="routeText" class="w-dnd__route" :title="destinationTitle">{{ routeText }}</span>
          </div>
          <div v-if="dn" class="w-dnd__facts">
            <span v-if="dn.order_number">{{ t('dn.fields.order-no') }} <b>{{ dn.order_number }}</b></span>
            <span>{{ t('shipping.dn.status-filter') }} <b>{{ t(`dn.status.${dn.status}`) }}</b></span>
            <span v-if="sourceText">{{ t('dn.detail.source') }} <b>{{ sourceText }}</b></span>
            <span :title="zoneDescription">{{ dn.warehouse?.name }} · {{ zoneAbbr }}</span>
          </div>
          <div v-else class="w-dnd__facts"><span class="w-dnd__skeleton" /></div>
        </div>
        <div v-if="dn" class="w-dnd__actions">
          <WButton icon="printer" :to="`/dn/print/${dnId}`">{{ t('dn.actions.print') }}</WButton>
          <DnActionsMenu :dn-id="dnId" :status="dn.status" size="md" :actions="['ship-to', 'edit', 'start', 'close', 'cancel', 'delete']"
            @changed="refreshAll" @deleted="router.push('/dn')" @ship-to="shipToOpen = true" />
        </div>
      </header>

      <WAlert v-if="view.loadError.value && !view.flow.value" tone="block" :title="view.loadError.value">
        <template #actions><WButton size="sm" @click="view.load()">{{ t('dn.list.retry') }}</WButton></template>
      </WAlert>
      <div v-else-if="!view.flow.value" class="w-dnd__loading" aria-busy="true">
        <span v-for="n in 3" :key="n" />
      </div>
      <DnFlowProgress v-else :selected="shownKey" @select="onSelect" />

      <div class="w-dnd__grid">
        <div class="w-dnd__main">
          <DnFlowStepCard v-if="view.flow.value" id="dn-step-card" ref="stepCard" :selected="selected" :dn-id="dnId"
            :dn-status="view.flow.value.dn_status || dn?.status" :closed-at="dn?.closed_at" @select="onSelect" @changed="refreshAll"
            @edit-customs="editorOpen = true" />
          <DnFlowHistory v-if="view.flow.value" :dn-id="dnId" @select="onSelect" @history="historyOpen = true" />
          <DnGoodsCard v-if="dn" :dn="dn" />
        </div>
        <DnDetailAside v-if="dn && view.flow.value" :dn="dn" @ship-to="shipToOpen = true" @cancel-waybill="cancelWaybill"
          @docs-history="historyOpen = true" @customs-data="dataOpen = true" />
      </div>
    </template>

    <DnShipToEditModal v-model:open="shipToOpen" :dn-id="dnId" @saved="refreshAll" />
    <CustomsSnapshotEditor v-if="view.customsView.value" v-model:open="editorOpen" :dn-id="dnId" :customs="view.customsView.value.customs"
      :lines="view.customsView.value.lines" :recipient-tax-defaults="view.customsView.value.recipient_tax_defaults" :fallback-consignee="view.customsView.value.consignee" @saved="refreshAll" />
    <WDrawer v-model:open="historyOpen" :title="t('customs.operations.history')" width="760px">
      <CustomsDocumentHistory v-if="historyOpen" :dn-id="dnId" :active="historyOpen" :reload-key="historyKey" />
    </WDrawer>
    <WDrawer v-model:open="dataOpen" :title="t('shipping.documents.customs-data')" width="960px">
      <CustomsDataDetail v-if="dataOpen && view.customsView.value" :view="view.customsView.value" :warehouse-id="view.warehouse.value" />
    </WDrawer>
  </div>
</template>

<style scoped>
.w-dnd { display: flex; flex-direction: column; gap: var(--w-sp-16); }
.w-dnd__crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-3);
}
.w-dnd__crumb { color: var(--w-text-3); text-decoration: none; }
.w-dnd__crumb:hover { color: var(--w-link); }
.w-dnd__head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 24px; margin-top: -8px; }
.w-dnd__heading { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.w-dnd__title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.w-dnd__title {
  margin: 0;
  font-size: var(--w-fs-24);
  line-height: var(--w-lh-24);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-dnd__route { font-size: var(--w-fs-13); line-height: var(--w-lh-13); color: var(--w-text-2); }
.w-dnd__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-2);
}
.w-dnd__facts b { color: var(--w-text-1); font-weight: var(--w-fw-semibold); }
.w-dnd__skeleton { display: block; width: 320px; height: 14px; border-radius: 4px; background: var(--w-skeleton); }
.w-dnd__actions { display: flex; gap: 8px; }
.w-dnd__loading { display: flex; flex-direction: column; gap: 12px; }
.w-dnd__loading span { display: block; height: 96px; border-radius: var(--w-radius-card); background: var(--w-skeleton); }
.w-dnd__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: var(--w-card-gap);
  align-items: start;
}
.w-dnd__main { display: flex; flex-direction: column; gap: var(--w-card-gap); min-width: 0; }
@media (max-width: 1199.98px) {
  .w-dnd__grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
