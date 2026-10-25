<script lang="ts" setup>
/**
 * 发货单详情的右栏（设计稿 Main：参考信息）：
 * - 收件地址：面单实际用的（ship_to 快照 → ship_to_effective：收货方的结构化地址）按国家排版，电话 · 邮箱，拉丁转写可展开；
 *   都没有时显示单行地址；「修改」打开改收件地址（没发货、没建运单 / 导出时；不能改时写原因）
 * - 运单与包裹：运单号（可复制）、服务、建单时刻与面单格式，打印 / 下载面单、取消运单（不能取消时写原因）；箱子清单
 * - 运费：在线建单时承运商给的预估（账单对账还没有）
 * - 报关单证：贸易条款、申报价值、保险费；CI / PL 打印、下载；历史版本、报关数据明细（抽屉）
 * - 单据信息：计划发货、发货类型、运输方式、包装信息、特殊处理、仓库、作业任务、创建、更新、备注（缺值写弱化色「—」）
 * 流程数据来自页面提供的 useShippingFlowView（SHIPPING_FLOW_VIEW）；做事的入口 emit 给页面（页面再交给步骤卡）。
 */
import { countryName } from '~/data/countries'
import { SHIPPING_FLOW_VIEW } from '~/composables/shipping/useShippingFlowView'
import { formatAddressLines, hasLatinAddress, hasStructuredAddress, type StructuredAddress } from '~/composables/address/structuredAddress'
import {
  formatMoney,
  formatUserRef,
  pickCurrentDocument,
  useCustomsPdfActions,
} from '~/composables/customs/customsDocuments'
import { isActiveShipment, isPdfLabel, labelDocumentOf, serviceNameOf } from '~/composables/customs/carrierShipment'
import { flowActionOf, flowActionReasonText } from '~/composables/shipping/shippingFlow'
import { dnActionStates } from '~/utils/dnActions'

const props = defineProps<{
  dn: Record<string, any>
}>()
const emit = defineEmits<{
  'ship-to': []
  'cancel-waybill': []
  'docs-history': []
  'customs-data': []
}>()

const { t, te, locale, localeProperties } = useI18n()
const staffStore = useStaffStore()
const view = inject(SHIPPING_FLOW_VIEW)!
const { format, formatLocale } = useTimeZone()
const { busyDocId, printDoc, viewDoc, downloadDoc, downloadRawDoc } = useCustomsPdfActions()
const iso = computed(() => String(localeProperties.value?.iso || '') || null)

// ------------------ 收件地址 ----------------------
const shipTo = computed<StructuredAddress | null>(() => {
  for (const s of [props.dn?.ship_to, props.dn?.ship_to_effective]) {
    if (s && typeof s === 'object' && hasStructuredAddress(s)) return s as StructuredAddress
  }
  return null
})
/** 显示的是收货方的结构化地址（本单没有自己的快照） */
const fromRecipient = computed(() => !!shipTo.value && !(props.dn?.ship_to && hasStructuredAddress(props.dn.ship_to)))
const addressLines = computed(() => formatAddressLines(shipTo.value, {
  style: 'local', withNames: true, withCountry: true, countryLabel: (code: string) => countryName(code, locale.value),
}))
const latinLines = computed(() => (shipTo.value && hasLatinAddress(shipTo.value)
  ? formatAddressLines(shipTo.value, { style: 'latin', withNames: true, countryLabel: (code: string) => countryName(code, 'en') })
  : []))
const contactLine = computed(() => [shipTo.value?.phone, shipTo.value?.email].filter(Boolean).join(' · '))
const shipToState = computed(() => dnActionStates(props.dn?.status, staffStore.hasPermission, ['ship-to'])[0]!)
/** 在线建的 / 导出或导回的运单在时，后端不让改地址（手填的运单号不锁） */
const shipToLockedByWaybill = computed(() => {
  const s = view.waybillShipment.value
  return !!s && ['api', 'file'].includes(String(s.source || '')) && (s.status === 'exported' || isActiveShipment(s))
})
const shipToReason = computed(() => {
  if (!shipToState.value.enabled) return shipToState.value.reason ? t(`dn.actions.reasons.${shipToState.value.reason}`) : ''
  if (shipToLockedByWaybill.value) return t('dn.detail.aside.ship-to-locked')
  return ''
})

// ------------------ 运单与包裹 ----------------------
const waybillSummary = computed<Record<string, any>>(() => view.waybillStep.value?.summary || {})
const shipment = computed(() => view.waybillShipment.value)
const trackingNumber = computed(() => String(shipment.value && isActiveShipment(shipment.value)
  ? shipment.value.tracking_number || '' : waybillSummary.value.tracking_number || ''))
const serviceText = computed(() => serviceNameOf(shipment.value, iso.value) || String(waybillSummary.value.service_name || ''))
const labelFormatText = (format: string | null | undefined) => {
  const key = `customs.carrier.label-formats.${String(format || '').toUpperCase()}`
  return format && te(key) ? t(key) : ''
}
const waybillMeta = computed(() => {
  const s = shipment.value
  if (!s || !isActiveShipment(s)) {
    const source = waybillSummary.value.source
    return source && te(`shipping.waybill-sources.${source}`) ? t(`shipping.waybill-sources.${source}`) : ''
  }
  const parts = [t('dn.detail.aside.created-at', { time: format(s.created_at, 'MM/DD HH:mm', { withZone: false }) })]
  const label = labelFormatText(s.label_format)
  if (label) parts.push(label)
  else if (s.source && te(`shipping.waybill-sources.${s.source}`)) parts.push(t(`shipping.waybill-sources.${s.source}`))
  return parts.join(' · ')
})
const label = computed(() => {
  const s = shipment.value
  const raw = Number(waybillSummary.value.label_document_id)
  const id = Number.isFinite(raw) && raw > 0 ? raw : null
  const doc = labelDocumentOf(s) || (id ? { id, sha256: null, file_name: null } : null)
  return doc && trackingNumber.value ? { doc, pdf: !s || isPdfLabel(s) } : null
})
const printLabel = () => {
  if (!label.value) return
  if (label.value.pdf) viewDoc(props.dn.id, label.value.doc)
  else downloadRawDoc(props.dn.id, label.value.doc)
}
const downloadLabel = () => {
  if (!label.value) return
  if (label.value.pdf) downloadDoc(props.dn.id, label.value.doc)
  else downloadRawDoc(props.dn.id, label.value.doc)
}
const cancelAction = computed(() => flowActionOf(view.waybillStep.value, 'cancel_waybill'))
const cancelReason = computed(() => (cancelAction.value && !cancelAction.value.enabled
  ? flowActionReasonText(cancelAction.value, t, te, { carrier: view.carrier.value?.name || '' }) : ''))

const packages = computed<any[]>(() => {
  const list = view.packingStep.value?.summary?.packages
  return Array.isArray(list) ? [...list].sort((a, b) => Number(a.package_no) - Number(b.package_no)) : []
})
const grossWeight = computed(() => view.packingStep.value?.summary?.gross_weight_kg ?? null)
const cm = (mm: unknown) => (mm === null || mm === undefined || mm === '' ? '' : String(Math.round(Number(mm)) / 10))
const showWaybill = computed(() => !!trackingNumber.value || packages.value.length > 0)

const copied = ref(false)
const copyTracking = async () => {
  try {
    await navigator.clipboard.writeText(trackingNumber.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // 剪贴板不可用（http、权限）：不提示
  }
}

// ------------------ 运费（在线建单的预估） ----------------------
const freight = computed(() => {
  const s = shipment.value
  if (!s || !isActiveShipment(s) || s.net_charge === null || s.net_charge === undefined || s.net_charge === '') return null
  return { amount: Number(s.net_charge), currency: s.currency || 'JPY' }
})

// ------------------ 报关单证 ----------------------
const customsView = computed(() => view.customsView.value)
const customs = computed<Record<string, any>>(() => customsView.value?.customs || {})
const ci = computed(() => pickCurrentDocument(customsView.value?.current_documents, 'commercial_invoice'))
const pl = computed(() => pickCurrentDocument(customsView.value?.current_documents, 'packing_list'))
const docsVersion = computed(() => Math.max(0, ...[ci.value, pl.value].map((d) => Number(d?.version) || 0)))
const customsCurrency = computed(() => String(customs.value.currency || 'JPY'))
const recipientCountry = computed(() => String(customsView.value?.recipient_country || customs.value.recipient_country || '').toUpperCase())
const showCustoms = computed(() => view.needsCustoms.value && !!customsView.value)

// ------------------ 单据信息 ----------------------
const dash = '—'
const infoRows = computed(() => {
  const dn = props.dn || {}
  const tasks = view.tasks.value
  const taskCodes = [...tasks.picking.map((id: number) => `PICK-${id}`), ...tasks.packing.map((id: number) => `PACK-${id}`),
    ...(tasks.delivery ? [`DEL-${tasks.delivery}`] : [])]
  return [
    { key: 'date', label: t('dn.fields.scheduled-date'), value: dn.expected_shipping_date || '' },
    { key: 'type', label: t('dn.fields.type'), value: dn.dn_type ? t(`dn.type.${dn.dn_type}`) : '' },
    { key: 'transport', label: t('dn.fields.transportation'), value: dn.transportation_mode ? t(`dn.transportation.${dn.transportation_mode}`) : '' },
    { key: 'packing', label: t('dn.fields.packing-info'), value: dn.packaging_info || '' },
    { key: 'handling', label: t('dn.fields.special-handling'), value: dn.special_handling || '' },
    { key: 'warehouse', label: t('common.entities.warehouse'), value: dn.warehouse?.name || '' },
    { key: 'tasks', label: t('dn.detail.aside.tasks'), value: taskCodes.join(' · ') },
    { key: 'created', label: t('dn.detail.aside.created'), value: [formatLocale(dn.created_at), dn.creator?.user_name].filter(Boolean).join(' · ') },
    { key: 'updated', label: t('dn.detail.aside.updated'), value: formatLocale(dn.updated_at) },
    { key: 'remark', label: t('common.fields.remark'), value: dn.remark || '' },
  ]
})
const taskLinks = computed(() => [
  ...view.taskLinks('picking'), ...view.taskLinks('packing'), ...view.taskLinks('handover'),
])
const userText = (u: any) => formatUserRef(u, t)
</script>

<template>
  <aside class="w-dnaside">
    <!-- 收件地址 -->
    <WCard :title="t('dn.detail.aside.ship-to')" :heading-level="3">
      <template #actions>
        <WButton v-if="shipToState.allowed && shipToState.enabled && !shipToLockedByWaybill" size="sm" variant="text" @click="emit('ship-to')">
          {{ t('dn.detail.aside.edit') }}
        </WButton>
        <span v-else-if="shipToReason" class="w-dnaside__note">{{ shipToReason }}</span>
      </template>
      <div v-if="shipTo" class="w-dnaside__address">
        <span v-for="(line, i) in addressLines" :key="`a-${i}`" :class="{ 'is-name': i === 0 }">{{ line }}</span>
        <span v-if="contactLine" class="w-dnaside__sub">{{ contactLine }}</span>
        <span v-if="fromRecipient" class="w-dnaside__sub">{{ t('dn.detail.aside.from-recipient') }}</span>
        <details v-if="latinLines.length" class="w-dnaside__latin">
          <summary>{{ t('address.latin.title') }}</summary>
          <span v-for="(line, i) in latinLines" :key="`l-${i}`">{{ line }}</span>
        </details>
      </div>
      <p v-else class="w-dnaside__text">
        <b v-if="dn.recipient?.name">{{ dn.recipient.name }}</b>
        <span>{{ dn.shipping_address || dash }}</span>
      </p>
    </WCard>

    <!-- 运单与包裹 -->
    <WCard v-if="showWaybill" :title="t('dn.detail.aside.waybill')" :heading-level="3">
      <div class="w-dnaside__stack">
        <template v-if="trackingNumber">
          <span class="w-dnaside__sub">{{ [view.carrier.value?.name, serviceText].filter(Boolean).join(' · ') }}</span>
          <span class="w-dnaside__tracking">
            {{ trackingNumber }}
            <button type="button" class="w-dnaside__copy" :aria-label="t('dn.detail.aside.copy')" @click="copyTracking">
              <WIcon :name="copied ? 'check' : 'copy'" :size="14" />
            </button>
          </span>
          <span v-if="waybillMeta" class="w-dnaside__sub">{{ waybillMeta }}</span>
          <div class="w-dnaside__links">
            <template v-if="label">
              <button type="button" class="w-dnaside__link" :disabled="busyDocId !== null" @click="printLabel">{{ t('customs.carrier.operations.print-label') }}</button>
              <button type="button" class="w-dnaside__link" :disabled="busyDocId !== null" @click="downloadLabel">{{ t('customs.operations.download') }}</button>
            </template>
            <button v-if="cancelAction?.enabled" type="button" class="w-dnaside__link is-danger" @click="emit('cancel-waybill')">
              {{ t('customs.carrier.operations.cancel') }}
            </button>
            <span v-else-if="cancelReason" class="w-dnaside__note">{{ t('dn.detail.aside.cancel-disabled', { reason: cancelReason }) }}</span>
          </div>
        </template>
        <div v-if="packages.length" class="w-dnaside__packages" :class="{ 'has-top': trackingNumber }">
          <div class="w-dnaside__pkg-head">
            <b>{{ t('dn.detail.aside.packages', { count: packages.length }) }}</b>
            <span v-if="grossWeight !== null">{{ t('dn.detail.aside.gross', { weight: grossWeight }) }}</span>
          </div>
          <div v-for="p in packages" :key="p.package_no" class="w-dnaside__pkg">
            <span>{{ t('dn.detail.aside.box', { no: p.package_no }) }}</span>
            <span>{{ p.gross_weight_kg }} kg</span>
            <span class="w-dnaside__pkg-dims">{{ cm(p.length_mm) }} × {{ cm(p.width_mm) }} × {{ cm(p.height_mm) }} cm</span>
          </div>
        </div>
      </div>
    </WCard>

    <!-- 运费：在线建单时承运商给的预估 -->
    <WCard v-if="freight" :heading-level="3">
      <template #header>
        <h3 class="w-dnaside__card-title">{{ t('dn.detail.aside.freight') }} <span class="w-faint">{{ freight.currency }}</span></h3>
      </template>
      <div class="w-dnaside__freight">
        <span class="w-dnaside__sub">{{ t('dn.detail.aside.estimate') }}</span>
        <span class="w-dnaside__amount">{{ formatMoney(freight.amount, freight.currency) }}</span>
        <span class="w-dnaside__sub">{{ t('dn.detail.aside.estimate-source', { carrier: view.carrier.value?.name || '' }) }}</span>
      </div>
    </WCard>

    <!-- 报关单证 -->
    <WCard v-if="showCustoms" :heading-level="3">
      <template #header>
        <h3 class="w-dnaside__card-title">{{ t('dn.detail.aside.customs') }}</h3>
      </template>
      <template #actions>
        <span class="w-dnaside__note">
          {{ docsVersion ? t('dn.detail.aside.docs-version', { version: docsVersion }) : t('customs.tips.no-documents') }}<template v-if="view.locked.value"> · {{ t('shipping.options.locked') }}</template>
        </span>
      </template>
      <div class="w-dnaside__stack">
        <dl class="w-dnaside__dl">
          <dt>{{ t('customs.fields.incoterm') }}</dt>
          <dd :class="{ 'is-empty': !customs.incoterm }">{{ customs.incoterm ? `${customs.incoterm}${recipientCountry ? ` ${recipientCountry}` : ''}` : dash }}</dd>
          <dt>{{ t('dn.detail.aside.declared') }}</dt>
          <dd :class="{ 'is-empty': customsView?.totals?.invoice_total === null || customsView?.totals?.invoice_total === undefined }">
            {{ customsView?.totals?.invoice_total !== null && customsView?.totals?.invoice_total !== undefined
              ? formatMoney(customsView.totals.invoice_total, customsCurrency) : dash }}
          </dd>
          <dt>{{ t('customs.fields.insurance') }}</dt>
          <dd :class="{ 'is-empty': !customs.insurance_charge }">{{ customs.insurance_charge ? formatMoney(Number(customs.insurance_charge), customsCurrency) : dash }}</dd>
        </dl>
        <div v-for="doc in [{ key: 'ci', meta: ci }, { key: 'pl', meta: pl }]" :key="doc.key" class="w-dnaside__doc">
          <span>{{ t(`dn.detail.aside.doc-${doc.key}`) }}</span>
          <span v-if="doc.meta" class="w-dnaside__doc-links">
            <button type="button" class="w-dnaside__link" :disabled="busyDocId !== null" @click="printDoc(dn.id, doc.meta)">{{ t('button.print') }}</button>
            <button type="button" class="w-dnaside__link" :disabled="busyDocId !== null" @click="downloadDoc(dn.id, doc.meta)">{{ t('customs.operations.download') }}</button>
          </span>
          <span v-else class="w-dnaside__note">{{ t('customs.tips.no-documents') }}</span>
        </div>
        <div class="w-dnaside__links">
          <button type="button" class="w-dnaside__link" @click="emit('docs-history')">{{ t('customs.operations.history') }}</button>
          <button v-if="customsView?.customs" type="button" class="w-dnaside__link" @click="emit('customs-data')">{{ t('shipping.documents.customs-data') }}</button>
        </div>
      </div>
    </WCard>

    <!-- 单据信息 -->
    <WCard :title="t('dn.detail.aside.info')" :heading-level="3">
      <dl class="w-dnaside__dl">
        <template v-for="row in infoRows" :key="row.key">
          <dt>{{ row.label }}</dt>
          <dd v-if="row.key === 'tasks' && taskLinks.length" class="w-dnaside__tasks">
            <NuxtLink v-for="link in taskLinks" :key="link.to" :to="link.to" class="w-dnaside__link">{{ link.text }}</NuxtLink>
          </dd>
          <dd v-else :class="{ 'is-empty': !row.value, 'is-wrap': row.key === 'remark' || row.key === 'handling' || row.key === 'packing' }">
            {{ row.value || dash }}
          </dd>
        </template>
      </dl>
    </WCard>
  </aside>
</template>

<style scoped>
.w-dnaside { display: flex; flex-direction: column; gap: var(--w-card-gap); font-family: var(--w-font); }
.w-dnaside :deep(.w-card__body) { font-size: var(--w-fs-13); line-height: var(--w-lh-13); }
.w-dnaside__card-title {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
}
.w-dnaside__card-title .w-faint { font-size: var(--w-fs-13); font-weight: var(--w-fw-regular); }
.w-dnaside__note { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-dnaside__address { display: flex; flex-direction: column; gap: 1px; color: var(--w-text-2); }
.w-dnaside__address .is-name { color: var(--w-text-1); font-size: var(--w-fs-14); font-weight: var(--w-fw-semibold); }
.w-dnaside__sub { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-dnaside__address .w-dnaside__sub:first-of-type { margin-top: 6px; }
.w-dnaside__latin { margin-top: 6px; font-size: var(--w-fs-12); color: var(--w-text-2); }
.w-dnaside__latin summary { color: var(--w-link); font-weight: var(--w-fw-medium); cursor: pointer; }
.w-dnaside__latin span { display: block; }
.w-dnaside__text { display: flex; flex-direction: column; margin: 0; color: var(--w-text-2); }
.w-dnaside__text b { color: var(--w-text-1); }
.w-dnaside__stack { display: flex; flex-direction: column; gap: 6px; }
.w-dnaside__tracking {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--w-fs-20);
  line-height: var(--w-lh-20);
  font-weight: var(--w-fw-semibold);
  font-variant-numeric: tabular-nums;
}
.w-dnaside__copy {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-3);
  cursor: pointer;
}
.w-dnaside__copy:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-dnaside__links { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin-top: 4px; }
.w-dnaside__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-weight: var(--w-fw-medium);
  text-decoration: none;
  cursor: pointer;
}
.w-dnaside__link:hover { color: var(--w-link-hover); }
.w-dnaside__link:disabled { color: var(--w-text-3); cursor: progress; }
.w-dnaside__link.is-danger { color: var(--w-bad-text); }
.w-dnaside__packages { display: flex; flex-direction: column; gap: 4px; }
.w-dnaside__packages.has-top { margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--w-line); }
.w-dnaside__pkg-head { display: flex; justify-content: space-between; gap: 8px; }
.w-dnaside__pkg {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 8px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-2);
  font-variant-numeric: tabular-nums;
}
.w-dnaside__pkg-dims { text-align: right; }
.w-dnaside__freight { display: flex; flex-direction: column; gap: 2px; }
.w-dnaside__amount { font-size: var(--w-fs-20); line-height: var(--w-lh-20); font-weight: var(--w-fw-semibold); font-variant-numeric: tabular-nums; }
.w-dnaside__dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 16px; margin: 0; }
.w-dnaside__dl dt { color: var(--w-text-2); font-weight: var(--w-fw-regular); }
.w-dnaside__dl dd { margin: 0; color: var(--w-text-1); overflow-wrap: anywhere; }
.w-dnaside__dl dd.is-empty { color: var(--w-text-3); }
.w-dnaside__dl dd.is-wrap { white-space: pre-line; }
.w-dnaside__tasks { display: flex; flex-wrap: wrap; gap: 2px 10px; }
.w-dnaside__doc { display: flex; justify-content: space-between; gap: 8px; }
.w-dnaside__doc-links { display: inline-flex; gap: 12px; }
</style>
