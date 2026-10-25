<script lang="ts" setup>
/**
 * 发货单详情的「处理记录」（设计稿 Main）：已完成的步，最近的在前。每条：灰底小勾、步骤名 + 来源（仓库 / 承运商 / 规则 /
 * 来源系统）、时刻（按仓库时区）、一行概要，以及这一步留下的东西的入口——拣货 / 打包 / 配送任务、打印 CI / PL、历史版本、
 * 打印 / 下载面单。点步骤名在上面的步骤卡里看这一步（emit select）。
 * 数据来自页面提供的 useShippingFlowView（SHIPPING_FLOW_VIEW）。
 */
import { SHIPPING_FLOW_VIEW } from '~/composables/shipping/useShippingFlowView'
import { historySteps } from '~/utils/dnFlowDisplay'
import {
  normalizeDocumentList,
  pickCurrentDocument,
  useCustomsPdfActions,
} from '~/composables/customs/customsDocuments'
import { isPdfLabel, labelDocumentOf } from '~/composables/customs/carrierShipment'
import type { FlowStep } from '~/composables/shipping/shippingFlow'

const props = defineProps<{ dnId: number | string }>()
const emit = defineEmits<{
  select: [key: string]
  /** 看单证的历史版本（页面开抽屉） */
  history: []
}>()

const { t } = useI18n()
const view = inject(SHIPPING_FLOW_VIEW)!
const { format, abbr, differs } = useTimeZone()
const { busyDocId, printDoc, viewDoc, downloadDoc, downloadRawDoc } = useCustomsPdfActions()

const items = computed(() => historySteps(view.flow.value?.steps || []))

const sourceText = (step: FlowStep) => {
  const s = step.source
  if (!s) return ''
  return t(s === 'api' && (step.key === 'waybill' || step.key === 'pickup') ? 'shipping.sources.carrier-api' : `shipping.sources.${s}`)
}
const timeText = (step: FlowStep) => format(step.at, 'MM/DD HH:mm', { withZone: false })

/** 报关单证一步留下的 CI / PL（流程接口的 summary.documents） */
const docsOf = (step: FlowStep) => {
  const list = normalizeDocumentList(step.summary?.documents)
  return { ci: pickCurrentDocument(list, 'commercial_invoice'), pl: pickCurrentDocument(list, 'packing_list') }
}
/** 运单一步的面单（在线建的运单才有） */
const labelOf = () => {
  const shipment = view.waybillShipment.value
  const raw = Number(view.waybillStep.value?.summary?.label_document_id)
  const id = Number.isFinite(raw) && raw > 0 ? raw : null
  const doc = labelDocumentOf(shipment) || (id ? { id, sha256: null, file_name: null } : null)
  return doc ? { doc, pdf: !shipment || isPdfLabel(shipment) } : null
}
const printLabel = () => {
  const label = labelOf()
  if (!label) return
  if (label.pdf) viewDoc(props.dnId, label.doc)
  else downloadRawDoc(props.dnId, label.doc)
}
const downloadLabel = () => {
  const label = labelOf()
  if (!label) return
  if (label.pdf) downloadDoc(props.dnId, label.doc)
  else downloadRawDoc(props.dnId, label.doc)
}
</script>

<template>
  <section class="w-dnhist" aria-labelledby="dn-history-title">
    <header class="w-dnhist__head">
      <h2 id="dn-history-title" class="w-dnhist__title">{{ t('dn.detail.history') }}</h2>
      <span v-if="differs" class="w-faint">{{ t('dn.detail.times-in', { zone: abbr }) }}</span>
    </header>
    <ol v-if="items.length" class="w-dnhist__list">
      <li v-for="step in items" :key="step.key" class="w-dnhist__item">
        <span class="w-dnhist__mark" aria-hidden="true"><WIcon name="check" :size="11" :stroke-width="3" /></span>
        <div class="w-dnhist__body">
          <div class="w-dnhist__line">
            <button type="button" class="w-dnhist__name" @click="emit('select', step.key)">{{ view.stepTitle(step.key) }}</button>
            <span class="w-dnhist__source">{{ sourceText(step) }}</span>
            <span class="w-dnhist__time">{{ timeText(step) }}</span>
          </div>
          <p v-if="view.summaryText(step)" class="w-dnhist__summary">{{ view.summaryText(step) }}</p>
          <div class="w-dnhist__actions">
            <NuxtLink v-for="link in view.taskLinks(step.key)" :key="link.to" :to="link.to" class="w-dnhist__link">
              {{ t(`dn.detail.task-links.${step.key}`, { code: link.text }) }}
            </NuxtLink>
            <template v-if="step.key === 'documents'">
              <button v-if="docsOf(step).ci" type="button" class="w-dnhist__link" :disabled="busyDocId !== null"
                @click="printDoc(dnId, docsOf(step).ci)">{{ t('customs.operations.print-ci') }}</button>
              <button v-if="docsOf(step).pl" type="button" class="w-dnhist__link" :disabled="busyDocId !== null"
                @click="printDoc(dnId, docsOf(step).pl)">{{ t('customs.operations.print-pl') }}</button>
              <button type="button" class="w-dnhist__link" @click="emit('history')">{{ t('customs.operations.history') }}</button>
            </template>
            <template v-if="step.key === 'waybill' && labelOf()">
              <button type="button" class="w-dnhist__link" :disabled="busyDocId !== null" @click="printLabel">{{ t('customs.carrier.operations.print-label') }}</button>
              <button type="button" class="w-dnhist__link" :disabled="busyDocId !== null" @click="downloadLabel">{{ t('customs.carrier.operations.download-label') }}</button>
            </template>
          </div>
        </div>
      </li>
    </ol>
    <p v-else class="w-dnhist__empty">{{ t('dn.detail.history-empty') }}</p>
  </section>
</template>

<style scoped>
.w-dnhist {
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
  font-family: var(--w-font);
  color: var(--w-text-1);
}
.w-dnhist__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px var(--w-card-pad);
  border-bottom: 1px solid var(--w-line);
  font-size: var(--w-fs-12);
}
.w-dnhist__title { margin: 0; font-size: var(--w-fs-16); line-height: var(--w-lh-16); font-weight: var(--w-fw-semibold); }
.w-dnhist__list { margin: 0; padding: 12px var(--w-card-pad) 16px; list-style: none; }
.w-dnhist__item { position: relative; display: flex; gap: 12px; padding-bottom: 14px; }
.w-dnhist__item:last-child { padding-bottom: 0; }
/* 勾与勾之间的竖线 */
.w-dnhist__item:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 22px;
  bottom: 0;
  left: 8px;
  width: 1px;
  background: var(--w-border);
}
.w-dnhist__mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 17px;
  height: 17px;
  margin-top: 2px;
  border-radius: var(--w-radius-pill);
  background: var(--w-surface-2);
  color: var(--w-text-2);
}
.w-dnhist__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.w-dnhist__line { display: flex; align-items: baseline; gap: 8px; }
.w-dnhist__name {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-text-1);
  font: inherit;
  font-size: var(--w-fs-14);
  font-weight: var(--w-fw-semibold);
  cursor: pointer;
}
.w-dnhist__name:hover { color: var(--w-link); }
.w-dnhist__name:focus-visible { outline: none; border-radius: 2px; box-shadow: var(--w-focus-ring); }
.w-dnhist__source { font-size: var(--w-fs-12); color: var(--w-text-3); }
.w-dnhist__time { margin-left: auto; font-size: var(--w-fs-13); color: var(--w-text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.w-dnhist__summary { margin: 0; font-size: var(--w-fs-13); line-height: var(--w-lh-13); color: var(--w-text-2); overflow-wrap: anywhere; }
.w-dnhist__actions { display: flex; flex-wrap: wrap; gap: 2px 14px; }
.w-dnhist__actions:empty { display: none; }
.w-dnhist__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-size: var(--w-fs-13);
  font-weight: var(--w-fw-medium);
  text-decoration: none;
  cursor: pointer;
}
.w-dnhist__link:hover { color: var(--w-link-hover); }
.w-dnhist__link:disabled { color: var(--w-text-3); cursor: progress; }
.w-dnhist__empty { margin: 0; padding: 16px var(--w-card-pad); color: var(--w-text-3); font-size: var(--w-fs-13); }
</style>
