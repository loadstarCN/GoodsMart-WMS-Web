<script setup lang="ts">
/**
 * 组件展示页：逐个展示 components/w 的组件和各状态，对照设计稿（Tokens / Patterns）验收。
 * 只在开发环境，或平台管理员可以打开（正式环境的员工、未登录都会被带走）。
 * 顶部可以切换深色 / 紧凑：只作用在本页的预览区（data-theme / data-density 加在预览容器上）。
 */
import type { WSelectOption } from '~/components/w/WSelect.vue'
import type { WSegmentedOption } from '~/components/w/WSegmented.vue'
import type { WStepItem } from '~/components/w/WSteps.vue'
import type { WTabItem } from '~/components/w/WTabs.vue'
import type { WTableColumn } from '~/components/w/WTable.vue'

definePageMeta({
  layout: false,
  middleware: [
    () => {
      if (!import.meta.dev && useAuthStore().userInfo?.type !== 'user') return navigateTo('/')
    },
  ],
})

const { t } = useI18n()
const authStore = useAuthStore()
useHead({ title: () => t('dev-ui.title') })

/** 平台管理员用平台外壳，员工用员工外壳；开发环境未登录时不套外壳 */
const layoutName = computed(() => {
  if (!authStore.authenticated) return 'custom'
  return authStore.userInfo?.type === 'user' ? 'admin' : 'default'
})

// ---- 预览开关（只作用于预览区） ----
const previewTheme = ref<'light' | 'dark'>('light')
const previewDensity = ref<'comfortable' | 'compact'>('comfortable')
const themeOptions = computed<WSegmentedOption<'light' | 'dark'>[]>(() => [
  { value: 'light', label: t('dev-ui.theme-light') },
  { value: 'dark', label: t('dev-ui.theme-dark') },
])
const densityOptions = computed<WSegmentedOption<'comfortable' | 'compact'>[]>(() => [
  { value: 'comfortable', label: t('shell.account.density-comfortable') },
  { value: 'compact', label: t('shell.account.density-compact') },
])

// ---- 按钮 ----
const saving = ref(false)
const fakeSave = () => {
  saving.value = true
  setTimeout(() => { saving.value = false }, 1500)
}

// ---- 输入 ----
const threshold = ref<number | string>(20)
const tracking = ref('8789 7812 6644')
const signedAt = ref('2026-10-30 10:00')
const weight = ref('0.520')
const goodsCode = ref('')
const carrier = ref<string | null>('fedex')
const currency = ref<string | null>(null)
const carrierOptions: WSelectOption<string>[] = [
  { value: 'fedex', label: 'FedEx' },
  { value: 'yamato', label: 'ヤマト運輸' },
  { value: 'sagawa', label: '佐川急便' },
  { value: 'dhl', label: 'DHL', disabled: true },
]
const currencyOptions: WSelectOption<string>[] = [
  { value: 'JPY', label: 'JPY' },
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
]
const lastScan = ref('')
const onScan = () => {
  lastScan.value = goodsCode.value.trim()
  goodsCode.value = ''
}

// ---- 勾选、开关、单选卡片、分段 ----
const byLot = ref(true)
const keepCarton = ref(false)
const partial = ref(true)
const useMap = ref(true)
const lotRequired = ref(false)
const waybillMethod = ref<string>('file')
const view = ref<'goods' | 'location'>('goods')
const viewOptions = computed<WSegmentedOption<'goods' | 'location'>[]>(() => [
  { value: 'goods', label: t('dev-ui.seg.by-goods') },
  { value: 'location', label: t('dev-ui.seg.by-location') },
])

// ---- 页签 ----
const tab = ref('in-stock')
const tabs = computed<WTabItem[]>(() => [
  { key: 'in-stock', label: t('dev-ui.tabs.in-stock'), count: 1402 },
  { key: 'pending', label: t('dev-ui.tabs.pending'), count: 86, attention: true },
  { key: 'slow', label: t('dev-ui.tabs.slow'), count: 128 },
  { key: 'exception', label: t('dev-ui.tabs.exception'), count: 1, error: true },
  { key: 'disabled', label: t('dev-ui.tabs.disabled'), disabled: true },
])
const manyTabs = computed<WTabItem[]>(() =>
  ['working', 'waybill', 'import', 'pickup', 'handover', 'transit', 'exception', 'signed'].map((key, i) => ({
    key, label: t(`dev-ui.stages.${key}`), count: [12, 3, 2, 4, 6, 23, 1, 410][i], attention: i === 1 || i === 3, error: key === 'exception',
  })))
const stageTab = ref('working')

// ---- 表格 ----
interface DemoRow {
  id: number
  goods: string
  code: string
  available: number
  onhand: number
  damaged: number
  freight: number | null
  lot: string | null
  expiry: string | null
  note: string
  status: 'ok' | 'warn' | 'info' | 'bad' | 'none'
}
const baseRows: DemoRow[] = [
  { id: 1, goods: '缶バッジ', code: '4900000000101', available: 18, onhand: 20, damaged: 0, freight: 0, lot: null, expiry: '2027-03-31', note: '', status: 'ok' },
  { id: 2, goods: 'あにずきん', code: '4900000000118', available: 0, onhand: 4, damaged: 1, freight: 4220, lot: 'L2310', expiry: null, note: 'dev-ui.table.no-split', status: 'warn' },
  { id: 3, goods: 'ステラ★ライブ ウエハース 20個入り BOX', code: '4900000000205', available: 22, onhand: 28, damaged: 0, freight: 1280, lot: 'L2402', expiry: null, note: '', status: 'info' },
  { id: 4, goods: 'アクリルスタンド', code: '4900000000310', available: 6, onhand: 6, damaged: 0, freight: null, lot: null, expiry: '2026-11-30', note: '', status: 'bad' },
]
const tableRows = computed(() => Array.from({ length: 12 }, (_, i) => {
  const base = baseRows[i % baseRows.length]!
  return { ...base, id: i + 1, note: base.note ? t(base.note) : '', code: String(Number(base.code) + i * 1000) }
}))
const selectedRows = ref<(string | number)[]>([2])
const tableLoading = ref(false)
const statusText = (status: DemoRow['status']) => t(`dev-ui.status.${status}`)
const columns = computed<WTableColumn<DemoRow>[]>(() => [
  { key: 'goods', label: t('dev-ui.table.goods'), wrap: true },
  { key: 'available', label: t('dev-ui.table.available'), type: 'qty', strong: true, keepZero: true, help: t('dev-ui.table.available-help') },
  { key: 'onhand', label: t('dev-ui.table.onhand'), type: 'qty', muted: true },
  { key: 'damaged', label: t('dev-ui.table.damaged'), type: 'qty', muted: true },
  { key: 'freight', label: t('dev-ui.table.freight'), type: 'money' },
  { key: 'lot', label: t('dev-ui.table.lot') },
  { key: 'expiry', label: t('dev-ui.table.expiry'), emptyText: t('dev-ui.table.expiry-unknown') },
  { key: 'note', label: t('dev-ui.table.note'), muted: true },
  { key: 'status', label: t('dev-ui.table.status') },
])
const page = ref(1)

// ---- 弹窗、抽屉 ----
const modalOpen = ref(false)
const drawerOpen = ref(false)
const drawerNote = ref('')

// ---- 流程进度 ----
const shippingSteps = computed<WStepItem[]>(() => [
  { key: 'ordered', label: t('dev-ui.steps.ordered'), state: 'done', time: '10/15 16:56' },
  { key: 'picking', label: t('dev-ui.steps.picking'), state: 'done', time: '10/21 10:19' },
  { key: 'packing', label: t('dev-ui.steps.packing'), state: 'done', time: '10/21 15:54' },
  { key: 'waybill', label: t('dev-ui.steps.waybill'), state: 'current' },
  { key: 'pickup', label: t('dev-ui.steps.pickup'), state: 'todo' },
  { key: 'delivered', label: t('dev-ui.steps.delivered'), state: 'todo', time: t('dev-ui.steps.eta') },
])
const warnSteps = computed<WStepItem[]>(() => [
  { key: 'handover', label: t('dev-ui.steps.handover'), state: 'done', time: '10/23 13:03' },
  { key: 'transit', label: t('dev-ui.steps.transit'), state: 'warn', time: '10/24 00:19' },
  { key: 'delivered', label: t('dev-ui.steps.delivered'), state: 'todo', time: t('dev-ui.steps.eta') },
])

// ---- 表单布局 ----
const form = reactive({ name: 'ステラ★ライブ ウエハース 20個入り BOX', code: '4900000000205', category: null as string | null,
  brand: '', price: '3300', length: '280', width: '190', height: '60', weight: '0.520', unit: 'box' })
const categoryOptions = computed<WSelectOption<string>[]>(() => [
  { value: 'food', label: t('dev-ui.form.category-food') },
  { value: 'goods', label: t('dev-ui.form.category-goods') },
])
const unitOptions = computed<WSelectOption<string>[]>(() => [
  { value: 'box', label: t('dev-ui.form.unit-box') },
  { value: 'pcs', label: t('dev-ui.form.unit-pcs') },
])

// ---- 令牌色板 ----
const neutralSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
const semanticTones = ['ok', 'warn', 'bad', 'info'] as const
const semanticParts = ['dot', 'text', 'border', 'bg'] as const
const chartColors = [1, 2, 3, 4, 5, 6, 7, 8]
const typeScale = [
  { size: 28, key: 'num-l', sample: '24,580' },
  { size: 24, key: 'title', sample: 'DN-163' },
  { size: 20, key: 'num-s', sample: '8789 7812 6644' },
  { size: 16, key: 'section', sample: '' },
  { size: 14, key: 'body', sample: '' },
  { size: 13, key: 'table', sample: '' },
  { size: 12, key: 'caption', sample: '' },
]
</script>

<template>
  <NuxtLayout :name="layoutName">
    <div class="dev-ui w-scope" :class="{ 'is-bare': layoutName === 'custom' }">
      <div class="w-page-head">
        <h1>{{ t('dev-ui.title') }}</h1>
        <div class="dev-ui__switches">
          <WSegmented v-model="previewTheme" :options="themeOptions" :label="t('dev-ui.theme')" size="sm" />
          <WSegmented v-model="previewDensity" :options="densityOptions" :label="t('shell.account.density')" size="sm" />
        </div>
      </div>

      <div class="dev-ui__preview" :data-theme="previewTheme" :data-density="previewDensity">
        <!-- 按钮 -->
        <WCard :title="t('dev-ui.sections.buttons')">
          <div class="dev-ui__stack">
            <div class="dev-ui__row">
              <WButton variant="primary">{{ t('dev-ui.buttons.complete-shipping') }}</WButton>
              <WButton icon="printer">{{ t('dev-ui.buttons.print-label') }}</WButton>
              <WButton variant="text">{{ t('dev-ui.buttons.clear-selection') }}</WButton>
              <WButton variant="danger">{{ t('dev-ui.buttons.cancel-waybill') }}</WButton>
              <WButton variant="danger-confirm">{{ t('dev-ui.buttons.confirm-cancel') }}</WButton>
            </div>
            <div class="dev-ui__row">
              <WButton variant="primary" :loading="saving" @click="fakeSave">{{ t('dev-ui.buttons.save') }}</WButton>
              <WButton disabled>{{ t('dev-ui.buttons.disabled') }}</WButton>
              <WButton variant="primary" disabled>{{ t('dev-ui.buttons.complete-shipping') }}</WButton>
              <WButton icon="plus" variant="primary">{{ t('dev-ui.buttons.new') }}</WButton>
              <WButton icon="more" icon-only :aria-label="t('dev-ui.buttons.more')" />
            </div>
            <div class="dev-ui__row">
              <span class="dev-ui__caption">{{ t('dev-ui.inline') }}</span>
              <WButton size="sm">{{ t('dev-ui.buttons.view') }}</WButton>
              <WButton size="sm" variant="primary">{{ t('dev-ui.buttons.putaway') }}</WButton>
              <WButton size="sm" variant="text">{{ t('dev-ui.buttons.view') }}</WButton>
              <WButton size="sm" variant="danger">{{ t('dev-ui.buttons.delete') }}</WButton>
              <WButton size="sm" :loading="true">{{ t('dev-ui.buttons.view') }}</WButton>
              <WButton size="sm" icon="more" icon-only :aria-label="t('dev-ui.buttons.more')" />
            </div>
          </div>
        </WCard>

        <!-- 输入 · 下拉 -->
        <WCard :title="t('dev-ui.sections.inputs')">
          <WFormGrid>
            <WField :label="t('dev-ui.inputs.threshold')" :help="t('dev-ui.inputs.threshold-help')" :span="4">
              <WInput v-model.number="threshold" inputmode="numeric" placeholder="20" align="right" />
            </WField>
            <WField :label="t('dev-ui.inputs.tracking')" :span="4">
              <WInput v-model="tracking" clearable />
            </WField>
            <WField :label="t('dev-ui.inputs.signed-at')" :span="4" :error="t('dev-ui.inputs.signed-at-error')">
              <WInput v-model="signedAt" />
            </WField>
            <WField :label="t('dev-ui.inputs.weight')" :span="4" :hint="t('dev-ui.inputs.weight-hint')">
              <WInput v-model="weight" suffix="kg" inputmode="decimal" align="right" />
            </WField>
            <WField :label="t('dev-ui.inputs.carrier')" :span="4">
              <WSelect v-model="carrier" :options="carrierOptions" />
            </WField>
            <WField :label="t('dev-ui.inputs.currency')" optional :span="4">
              <WSelect v-model="currency" :options="currencyOptions" :placeholder="t('common.select-placeholder')" allow-empty />
            </WField>
            <WField :label="t('dev-ui.inputs.scan')" :span="6" :hint="lastScan ? t('dev-ui.inputs.scanned', { code: lastScan }) : t('dev-ui.inputs.scan-hint')">
              <WInput v-model="goodsCode" clearable autocomplete="off" @keydown.enter.prevent="onScan">
                <template #prefix><WIcon name="search" :size="14" /></template>
              </WInput>
            </WField>
            <WField :label="t('dev-ui.inputs.readonly')" :span="3">
              <WInput model-value="Kyoto#1" readonly />
            </WField>
            <WField :label="t('dev-ui.inputs.disabled')" :span="3">
              <WSelect :model-value="'fedex'" :options="carrierOptions" disabled />
            </WField>
          </WFormGrid>
          <div class="dev-ui__row dev-ui__row--top">
            <span class="dev-ui__caption">{{ t('dev-ui.inline') }}</span>
            <WInput size="sm" class="dev-ui__w160" :placeholder="t('dev-ui.inputs.filter')" clearable />
            <WSelect size="sm" class="dev-ui__w160" :model-value="'fedex'" :options="carrierOptions" />
          </div>
        </WCard>

        <!-- 勾选 · 开关 · 单选卡片 · 分段 -->
        <WCard :title="t('dev-ui.sections.choices')">
          <div class="dev-ui__stack">
            <div class="dev-ui__row dev-ui__row--wide">
              <WCheckbox v-model="byLot" :label="t('dev-ui.choices.by-lot')" />
              <WCheckbox v-model="keepCarton" :label="t('dev-ui.choices.keep-carton')" />
              <WCheckbox v-model="partial" :indeterminate="partial" :label="t('dev-ui.choices.partial')" />
              <WCheckbox :model-value="true" disabled :label="t('dev-ui.choices.locked')" />
            </div>
            <div class="dev-ui__row dev-ui__row--wide">
              <WSwitch v-model="useMap" :label="t('dev-ui.choices.use-map')" />
              <WSwitch v-model="lotRequired" :label="t('dev-ui.choices.lot-required')" />
              <WSwitch :model-value="true" disabled :label="t('dev-ui.choices.locked')" />
            </div>
            <div class="dev-ui__grid3">
              <WRadioCard v-model="waybillMethod" name="dev-waybill" value="api" :title="t('dev-ui.choices.method-api')"
                :description="t('dev-ui.choices.method-api-desc')" />
              <WRadioCard v-model="waybillMethod" name="dev-waybill" value="file" :title="t('dev-ui.choices.method-file')"
                :description="t('dev-ui.choices.method-file-desc')" />
              <WRadioCard v-model="waybillMethod" name="dev-waybill" value="manual" :title="t('dev-ui.choices.method-manual')"
                :description="t('dev-ui.choices.method-manual-desc')" disabled />
            </div>
            <div class="dev-ui__row">
              <WSegmented v-model="view" :options="viewOptions" :label="t('dev-ui.seg.label')" />
              <WSegmented v-model="view" :options="viewOptions" :label="t('dev-ui.seg.label')" size="sm" />
            </div>
          </div>
        </WCard>

        <!-- 状态 · 标签 -->
        <WCard :title="t('dev-ui.sections.status')">
          <div class="dev-ui__stack">
            <div class="dev-ui__row dev-ui__row--wide dev-ui__text13">
              <WStatus tone="ok">{{ t('dev-ui.status.ok') }}</WStatus>
              <WStatus tone="warn">{{ t('dev-ui.status.warn') }}</WStatus>
              <WStatus tone="info">{{ t('dev-ui.status.info') }}</WStatus>
              <WStatus tone="bad">{{ t('dev-ui.status.bad') }}</WStatus>
              <WStatus tone="none">{{ t('dev-ui.status.none') }}</WStatus>
              <WStatus tone="info" muted>{{ t('dev-ui.status.info') }}</WStatus>
            </div>
            <div class="dev-ui__row dev-ui__row--wide dev-ui__text13">
              <WStatus tone="bad" variant="text">{{ t('dev-ui.status.bad') }}</WStatus>
              <WStatus tone="warn" variant="text">{{ t('dev-ui.status.overdue') }}</WStatus>
              <WStatus tone="info" variant="pill">{{ t('dev-ui.status.info') }}</WStatus>
              <WStatus tone="ok" variant="pill">{{ t('dev-ui.status.ok') }}</WStatus>
              <WStatus tone="none" variant="pill">{{ t('dev-ui.status.count', { count: 12 }) }}</WStatus>
            </div>
            <div class="dev-ui__row">
              <WTag>{{ t('dev-ui.tags.lot-expiry') }}</WTag>
              <WTag tone="warn">{{ t('dev-ui.tags.near-expiry') }}</WTag>
              <WTag tone="bad">{{ t('dev-ui.tags.past-ship-limit') }}</WTag>
              <WTag tone="ok">{{ t('dev-ui.tags.checked') }}</WTag>
              <WTag tone="info">{{ t('dev-ui.tags.export') }}</WTag>
            </div>
          </div>
        </WCard>

        <!-- 页签 -->
        <WCard :title="t('dev-ui.sections.tabs')">
          <div class="dev-ui__stack">
            <WTabs v-model="tab" :items="tabs" :label="t('dev-ui.tabs.label')" panel-id="dev-tab-panel" />
            <div id="dev-tab-panel" role="tabpanel" class="dev-ui__caption">{{ t('dev-ui.tabs.current', { tab }) }}</div>
            <div class="dev-ui__narrow">
              <WTabs v-model="stageTab" :items="manyTabs" :label="t('dev-ui.tabs.stages')" />
            </div>
          </div>
        </WCard>

        <!-- 卡片 · 指标卡 -->
        <WCard :title="t('dev-ui.sections.cards')" :subtitle="t('dev-ui.cards.subtitle')">
          <template #actions>
            <WButton size="sm">{{ t('dev-ui.buttons.export') }}</WButton>
          </template>
          <div class="dev-ui__grid4">
            <WKpi :label="t('dev-ui.kpi.onhand')" :value="24580" size="l" :caption="t('dev-ui.kpi.onhand-caption')" />
            <WKpi :label="t('dev-ui.kpi.below')" :value="12" :unit="t('dev-ui.kpi.kinds')" tone="warn"
              :caption="t('dev-ui.kpi.below-caption')" to="/dev/ui" />
            <WKpi :label="t('dev-ui.kpi.pending')" :value="754" :unit="t('dev-ui.kpi.pieces')" tone="warn" />
            <WKpi :label="t('dev-ui.kpi.exception')" :value="1" :unit="t('dev-ui.kpi.parcels')" tone="bad" />
          </div>
        </WCard>

        <!-- 警示条 -->
        <WCard :title="t('dev-ui.sections.alerts')">
          <div class="dev-ui__stack">
            <WAlert tone="info">
              {{ t('dev-ui.alerts.invoice') }}
              <template #actions><a href="#">{{ t('dev-ui.alerts.go-check') }}</a></template>
            </WAlert>
            <WAlert tone="warn" :title="t('dev-ui.alerts.needs-action')">
              {{ t('dev-ui.alerts.tracking') }}
              <template #actions><a href="#">{{ t('dev-ui.alerts.refresh') }}</a></template>
            </WAlert>
            <WAlert tone="ok" dismissible>{{ t('dev-ui.alerts.saved') }}</WAlert>
            <WAlert tone="block" :title="t('dev-ui.alerts.blocked')">
              {{ t('dev-ui.alerts.blocked-next') }}
              <template #actions>
                <a href="#">{{ t('dev-ui.alerts.edit-recipient') }}</a>
                <a href="#" class="dev-ui__link-muted">{{ t('dev-ui.alerts.retry') }}</a>
              </template>
            </WAlert>
          </div>
        </WCard>

        <!-- 表格 -->
        <WCard :title="t('dev-ui.sections.table')" flush>
          <template #actions>
            <WSwitch v-model="tableLoading" :label="t('dev-ui.table.loading')" />
          </template>
          <WTable v-model:selected="selectedRows" :columns="columns" :rows="tableRows" selectable inset max-height="360px"
            :loading="tableLoading" :caption="t('dev-ui.sections.table')">
            <template #cell-goods="{ row }">
              <a href="#" class="dev-ui__goods">{{ row.goods }}</a>
              <span class="dev-ui__code">{{ row.code }}</span>
            </template>
            <template #cell-available="{ row, display }">
              <span :class="{ 'dev-ui__below': row.available === 0 }">{{ display.text }}</span>
            </template>
            <template #cell-status="{ row }">
              <WStatus :tone="row.status">{{ statusText(row.status) }}</WStatus>
            </template>
          </WTable>
          <div class="dev-ui__table-foot">
            <WPagination v-model:page="page" :total="572" :page-size="20" show-total />
          </div>
        </WCard>

        <div class="dev-ui__grid2">
          <WCard :title="t('dev-ui.sections.table-empty')" flush>
            <WTable :columns="columns.slice(0, 4)" :rows="[]" inset>
              <template #empty>
                <WEmptyState :title="t('dev-ui.empty.title')" :action-label="t('dev-ui.empty.action')" compact />
              </template>
            </WTable>
          </WCard>
          <WCard :title="t('dev-ui.sections.compact-table')" flush>
            <WTable :columns="columns.slice(0, 5)" :rows="tableRows.slice(0, 4)" density="compact" inset />
          </WCard>
        </div>

        <!-- 空状态 · 弹窗 · 抽屉 · 说明 -->
        <div class="dev-ui__grid2">
          <WCard :title="t('dev-ui.sections.empty')">
            <WEmptyState :title="t('dev-ui.empty.title')" :action-label="t('dev-ui.empty.action')" />
          </WCard>
          <WCard :title="t('dev-ui.sections.overlays')">
            <div class="dev-ui__stack">
              <div class="dev-ui__row">
                <WButton variant="danger" @click="modalOpen = true">{{ t('dev-ui.buttons.cancel-waybill') }}</WButton>
                <WButton @click="drawerOpen = true">{{ t('dev-ui.overlays.open-drawer') }}</WButton>
              </div>
              <div class="dev-ui__row dev-ui__text13">
                <span>{{ t('dev-ui.overlays.help-inline') }}</span>
                <WHelp :text="t('dev-ui.inputs.threshold-help')" />
              </div>
            </div>
          </WCard>
        </div>

        <!-- 流程进度 -->
        <WCard :title="t('dev-ui.sections.steps')">
          <div class="dev-ui__stack dev-ui__stack--loose">
            <WSteps :steps="shippingSteps" :label="t('dev-ui.steps.label')" />
            <div class="dev-ui__half">
              <WSteps :steps="warnSteps" :label="t('dev-ui.steps.label')" />
            </div>
          </div>
        </WCard>

        <!-- 表单布局 -->
        <section class="dev-ui__form" :aria-label="t('dev-ui.sections.form')">
          <h2 class="dev-ui__h2">{{ t('dev-ui.sections.form') }}</h2>
          <div class="dev-ui__form-card">
            <WFormSection :title="t('dev-ui.form.basic')">
              <WFormGrid>
                <WField :label="t('dev-ui.form.name')" :span="12">
                  <WInput v-model="form.name" />
                </WField>
                <WField :label="t('dev-ui.form.code')" :help="t('dev-ui.form.code-help')" :span="6">
                  <WInput v-model="form.code" />
                </WField>
                <WField :label="t('dev-ui.form.category')" optional :span="6">
                  <WSelect v-model="form.category" :options="categoryOptions" :placeholder="t('common.select-placeholder')" allow-empty />
                </WField>
                <WField :label="t('dev-ui.form.brand')" optional :span="6">
                  <WInput v-model="form.brand" />
                </WField>
              </WFormGrid>
            </WFormSection>
            <WFormSection :title="t('dev-ui.form.price')">
              <WFormGrid>
                <WField :label="t('dev-ui.form.price')" :span="4">
                  <WInput v-model="form.price" inputmode="decimal" align="right" suffix="JPY" />
                </WField>
              </WFormGrid>
            </WFormSection>
            <WFormSection :title="t('dev-ui.form.spec')" :help="t('dev-ui.form.spec-help')">
              <WFormGrid>
                <WField :label="t('dev-ui.form.unit')" :span="4">
                  <WSelect v-model="form.unit" :options="unitOptions" />
                </WField>
                <WField :label="t('dev-ui.form.weight')" :span="4">
                  <WInput v-model="form.weight" inputmode="decimal" align="right" suffix="kg" />
                </WField>
                <div class="w-span-4" aria-hidden="true" />
                <WField :label="t('dev-ui.form.length')" :span="4">
                  <WInput v-model="form.length" inputmode="numeric" align="right" suffix="mm" />
                </WField>
                <WField :label="t('dev-ui.form.width')" :span="4">
                  <WInput v-model="form.width" inputmode="numeric" align="right" suffix="mm" />
                </WField>
                <WField :label="t('dev-ui.form.height')" :span="4">
                  <WInput v-model="form.height" inputmode="numeric" align="right" suffix="mm" />
                </WField>
              </WFormGrid>
            </WFormSection>
            <div class="dev-ui__form-actions">
              <WButton>{{ t('dev-ui.buttons.cancel') }}</WButton>
              <WButton variant="primary">{{ t('dev-ui.buttons.save') }}</WButton>
            </div>
          </div>
        </section>

        <!-- 设计令牌 -->
        <WCard :title="t('dev-ui.sections.tokens')">
          <div class="dev-ui__stack dev-ui__stack--loose">
            <div>
              <h3 class="dev-ui__h3">{{ t('dev-ui.tokens.neutral') }}</h3>
              <div class="dev-ui__swatches">
                <span v-for="step in neutralSteps" :key="step" class="dev-ui__swatch">
                  <span class="dev-ui__chip" :style="{ background: `var(--w-neutral-${step})` }" />{{ step }}
                </span>
              </div>
            </div>
            <div>
              <h3 class="dev-ui__h3">{{ t('dev-ui.tokens.brand') }}</h3>
              <div class="dev-ui__swatches">
                <span v-for="step in neutralSteps" :key="step" class="dev-ui__swatch">
                  <span class="dev-ui__chip" :style="{ background: `var(--w-brand-${step})` }" />{{ step }}
                </span>
              </div>
            </div>
            <div>
              <h3 class="dev-ui__h3">{{ t('dev-ui.tokens.semantic') }}</h3>
              <div class="dev-ui__semantic">
                <div v-for="tone in semanticTones" :key="tone" class="dev-ui__swatches">
                  <span v-for="part in semanticParts" :key="part" class="dev-ui__swatch">
                    <span class="dev-ui__chip" :style="{ background: `var(--w-${tone}-${part})` }" />{{ tone }}-{{ part }}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h3 class="dev-ui__h3">{{ t('dev-ui.tokens.chart') }}</h3>
              <div class="dev-ui__swatches">
                <span v-for="n in chartColors" :key="n" class="dev-ui__swatch">
                  <span class="dev-ui__chip" :style="{ background: `var(--w-chart-${n})` }" />{{ n }}
                </span>
              </div>
            </div>
            <div>
              <h3 class="dev-ui__h3">{{ t('dev-ui.tokens.type') }}</h3>
              <div v-for="item in typeScale" :key="item.size" class="dev-ui__type">
                <span class="dev-ui__type-spec">{{ item.size }}</span>
                <span :class="`w-text-${item.size}`">{{ item.sample || t(`dev-ui.tokens.type-${item.key}`) }}</span>
              </div>
            </div>
          </div>
        </WCard>
      </div>

      <WModal v-model:open="modalOpen" :title="t('dev-ui.modal.title')" size="sm">
        {{ t('dev-ui.modal.body') }}
        <template #footer>
          <WButton @click="modalOpen = false">{{ t('dev-ui.modal.keep') }}</WButton>
          <WButton variant="danger-confirm" @click="modalOpen = false">{{ t('dev-ui.buttons.cancel-waybill') }}</WButton>
        </template>
      </WModal>
      <WDrawer v-model:open="drawerOpen" :title="t('dev-ui.overlays.drawer-title')">
        <WFormGrid>
          <WField :label="t('dev-ui.inputs.tracking')">
            <WInput v-model="tracking" autofocus />
          </WField>
          <WField :label="t('dev-ui.overlays.note')" optional>
            <WInput v-model="drawerNote" />
          </WField>
        </WFormGrid>
        <template #footer>
          <WButton @click="drawerOpen = false">{{ t('dev-ui.buttons.cancel') }}</WButton>
          <WButton variant="primary" @click="drawerOpen = false">{{ t('dev-ui.buttons.save') }}</WButton>
        </template>
      </WDrawer>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.dev-ui.is-bare {
  min-height: 100vh;
  padding: var(--w-sp-24) var(--w-sp-32) var(--w-sp-48);
  background: var(--w-bg);
}
.dev-ui__switches { display: flex; gap: var(--w-sp-8); flex-wrap: wrap; }
.dev-ui__preview {
  display: flex;
  flex-direction: column;
  gap: var(--w-card-gap);
  padding: var(--w-sp-16);
  margin: 0 calc(-1 * var(--w-sp-16));
  border-radius: var(--w-radius-card);
  background: var(--w-bg);
  color: var(--w-text-1);
}
.dev-ui__stack { display: flex; flex-direction: column; gap: var(--w-sp-12); }
.dev-ui__stack--loose { gap: var(--w-sp-24); }
.dev-ui__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--w-sp-8); }
.dev-ui__row--wide { gap: var(--w-sp-8) var(--w-sp-24); }
.dev-ui__row--top { margin-top: var(--w-sp-16); }
.dev-ui__grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--w-card-gap); }
.dev-ui__grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--w-sp-12); }
.dev-ui__grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--w-sp-12); }
.dev-ui__caption { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.dev-ui__text13 { font-size: var(--w-fs-13); line-height: var(--w-lh-13); }
.dev-ui__w160 { width: 160px; }
.dev-ui__narrow { max-width: 520px; }
.dev-ui__half { max-width: 50%; }
.dev-ui__goods { display: block; font-weight: var(--w-fw-medium); color: var(--w-link); text-decoration: none; }
.dev-ui__goods:hover { color: var(--w-link-hover); }
.dev-ui__code { display: block; font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.dev-ui__below { color: var(--w-warn-text); }
.dev-ui__link-muted { color: var(--w-text-2) !important; font-weight: var(--w-fw-medium); }
.dev-ui__table-foot { padding: var(--w-sp-12) var(--w-card-pad); border-top: 1px solid var(--w-line); }
.dev-ui__h2 {
  margin: 0 0 var(--w-sp-12);
  color: var(--w-text-1);
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
}
.dev-ui__h3 {
  margin: 0 0 var(--w-sp-8);
  color: var(--w-text-1);
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-semibold);
}
.dev-ui__form-card {
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
}
.dev-ui__form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--w-sp-8);
  padding: var(--w-sp-16) var(--w-card-pad);
  border-top: 1px solid var(--w-border);
}
.dev-ui__swatches { display: flex; flex-wrap: wrap; gap: var(--w-sp-8) var(--w-sp-16); }
.dev-ui__semantic { display: flex; flex-direction: column; gap: var(--w-sp-8); }
.dev-ui__swatch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 84px;
  font-size: var(--w-fs-12);
  color: var(--w-text-2);
}
.dev-ui__chip {
  width: 24px;
  height: 24px;
  border-radius: var(--w-radius-control);
  box-shadow: inset 0 0 0 1px var(--w-line);
}
.dev-ui__type { display: flex; align-items: baseline; gap: var(--w-sp-16); padding: 6px 0; border-top: 1px solid var(--w-line); }
.dev-ui__type-spec { width: 32px; flex: none; font-size: var(--w-fs-12); color: var(--w-text-3); }
@media (max-width: 1023.98px) {
  .dev-ui__grid2, .dev-ui__grid3, .dev-ui__grid4 { grid-template-columns: minmax(0, 1fr); }
  .dev-ui__half { max-width: none; }
}
</style>
