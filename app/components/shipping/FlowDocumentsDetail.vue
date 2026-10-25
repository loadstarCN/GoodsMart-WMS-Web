<script lang="ts" setup>
/**
 * 发货流程 ·「报关单证」一步的内容（跨境、要报关的发货单；设计稿 DeliveryCustoms）：
 * - 报关数据的问题（「要处理 N」）：快照里的点「补录」（需 dn_edit），缺原产国就地补录（写入商品主数据），
 *   重量 / 出口资料 / 承运商名给对应编辑页（打包完成前不列「还没打包完 / 还没录箱子」，那是流程状态）
 * - 当前 CI / PL（打印）、签发 / 重新签发（issue_documents）、历史版本（CustomsDocumentHistory）
 * - 运送申告价额提示（DeclaredValueNotice）
 * - 报关数据明细（CustomsDataDetail，展开看）、修改报关数据（CustomsSnapshotEditor，由流程组件打开）
 * 报关视图（GET /dn/<id>/customs）由流程组件读，这里只显示；做了操作 emit changed，流程组件整体刷新。
 */
import {
  CUSTOMS_SNAPSHOT_PROBLEMS,
  CUSTOMS_WORKFLOW_PROBLEMS,
  DN_LOCKED_STATUSES,
  pickCurrentDocument,
  useCustomsPdfActions,
  type CustomsDocumentMeta,
  type CustomsLine,
  type CustomsProblem,
  type CustomsView,
} from '~/composables/customs/customsDocuments'
import type { DeclaredValueMode } from '~/composables/customs/carrierShipment'
import { flowActionEnabled, flowActionOf, flowActionReasonText, type FlowStep } from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  dnId: number | string
  step: FlowStep
  view: CustomsView | null
  loading?: boolean
  loadError?: string | null
  dnStatus?: string | null
  warehouseId?: number | string | null
  /** 箱子有未保存的修改：单证会按已保存的旧箱子生成，先拦下 */
  packagesDirty?: boolean
  declaredMode?: DeclaredValueMode
}>(), {
  loading: false,
  loadError: null,
  dnStatus: null,
  warehouseId: null,
  packagesDirty: false,
  declaredMode: 'manual',
})

const emit = defineEmits<{
  (e: 'changed'): void
  (e: 'edit-customs'): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const staffStore = useStaffStore()
const { busyDocId, printDoc } = useCustomsPdfActions()

const locked = computed(() => !!props.view?.locked || DN_LOCKED_STATUSES.includes(String(props.dnStatus || '')))
const isPacked = computed(() => props.dnStatus === 'packed')
/** 打包完成（或已发货只读）后才办单证；打包中只补数据 */
const shippingStage = computed(() => locked.value || isPacked.value)
const ready = computed(() => !!props.view?.ready)

const problems = computed<CustomsProblem[]>(() => {
  const all = props.view?.problems || []
  // 「还没打包完 / 还没录箱子」是流程状态，由流程的打包一步表达
  return all.filter((p: CustomsProblem) => !CUSTOMS_WORKFLOW_PROBLEMS.includes(p.code))
})
const errorCount = computed(() => problems.value.filter((p: CustomsProblem) => p.level === 'error').length)
const canEditCustoms = computed(() => !locked.value && !!props.view?.customs && staffStore.hasPermission('dn_edit'))
const hasSnapshotProblems = computed(() => problems.value.some((p: CustomsProblem) => CUSTOMS_SNAPSHOT_PROBLEMS.includes(p.code)))
const originMissingLines = computed<CustomsLine[]>(() =>
  (props.view?.lines || []).filter((line: CustomsLine) => !line.origin_country && !!line.goods_id))

const ci = computed(() => pickCurrentDocument(props.view?.current_documents, 'commercial_invoice'))
const pl = computed(() => pickCurrentDocument(props.view?.current_documents, 'packing_list'))
const outdated = computed(() => !locked.value && !!props.view?.documents_outdated && !!(ci.value || pl.value))

// ------------------ 签发 ----------------------
const issueAction = computed(() => flowActionOf(props.step, 'issue_documents'))
const canIssue = computed(() => flowActionEnabled(props.step, 'issue_documents', !locked.value && isPacked.value && ready.value))
const issueHint = computed(() => {
  if (locked.value) return ''
  if (issueAction.value && !issueAction.value.enabled) return flowActionReasonText(issueAction.value, t, te, { carrier: t('customs.carrier.carrier-fallback') })
  if (!isPacked.value) return t('customs.tips.issue-need-packed')
  if (!ready.value) return t('customs.tips.issue-not-ready')
  if (props.packagesDirty) return t('customs.tips.packages-unsaved-before-issue')
  return ''
})
const issueText = computed(() => (outdated.value ? t('customs.operations.reissue')
  : (ci.value && pl.value ? t('customs.operations.issue-again') : t('customs.operations.issue'))))
/** 还没签发 / 要重新签发时签发是主操作；已经签发过时是次按钮 */
const issuePrimary = computed(() => outdated.value || !(ci.value && pl.value))
const issuing = ref(false)

const issue = async () => {
  if (!canIssue.value || issuing.value) return
  if (props.packagesDirty) {
    wAlert({ title: t('customs.operations.issue'), message: t('customs.tips.packages-unsaved-before-issue'), tone: 'warning' })
    return
  }
  const prevVersion = Math.max(0, ...(props.view?.current_documents || []).map((d: CustomsDocumentMeta) => Number(d.version) || 0))
  issuing.value = true
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/customs-documents/issue`, {
    method: 'POST',
    body: {},
    onSuccess: (data) => {
      const version = data?.version ?? ''
      showToast(t(version !== '' && Number(version) === prevVersion ? 'customs.tips.issued-same' : 'customs.tips.issued-new', { version }), 'success')
    },
    onError: (error) => {
      // 16068：单证条件不全（重新读取后问题清单是最新的）
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      issuing.value = false
    },
  })
  emit('changed')
}

// ------------------ 历史版本 ----------------------
const historyOpen = ref(false)
/** 单证变了（别处签发 / 改箱子作废）：打开着的历史跟着刷新 */
const historyKey = computed(() => (props.view?.current_documents || []).map((d: CustomsDocumentMeta) => d.id).join(','))

const docTypeText = (type: string) => {
  const key = `customs.doc-types.${type}`
  return te(key) ? t(key) : type
}

// ------------------ 缺原产国：就地补录（写入商品主数据） ----------------------
const originDraft = reactive<Record<string, string | null>>({})
const originSaving = reactive<Record<string, boolean>>({})

const saveOrigin = async (line: CustomsLine) => {
  if (!line.goods_id) return
  const key = String(line.goods_id)
  const code = originDraft[key]
  if (!code) return
  originSaving[key] = true
  let saved = false
  // 只改原产国的接口（goods_edit / sorting_edit / packing_edit 任一即可），与 PDA 一致
  await httpRequest(`/api/warehouse/goods/${line.goods_id}/origin-country`, {
    method: 'PUT',
    body: { origin_country: code },
    onSuccess: () => {
      saved = true
      showToast(t('action-results.op-success', { operation: t('goods.operations.edit'), entity: line.goods_code }), 'success')
      delete originDraft[key]
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      originSaving[key] = false
    },
  })
  if (saved) emit('changed')
}

/** 报关数据明细：默认收起 */
const dataOpen = ref(false)

const run = (key: string) => {
  if (key === 'issue_documents') issue()
}
defineExpose({ run })
</script>

<template>
  <div class="w-flow-docs">
    <div v-if="loading && !view" class="w-flow-docs__loading" aria-busy="true"><span /><span /></div>
    <WAlert v-else-if="loadError && !view" tone="block" :title="loadError" />

    <template v-else-if="view">
      <WAlert v-if="!view.customs" tone="warn" :title="t('shipping.states.warning')">{{ t('customs.tips.no-snapshot') }}</WAlert>
      <WAlert v-if="outdated" tone="warn" :title="t('shipping.states.warning')">{{ t('customs.tips.documents-outdated') }}</WAlert>

      <!-- 要处理 / 请留意：报关数据的问题 -->
      <div v-if="problems.length > 0" class="w-flow-docs__problems" :class="{ 'is-error': errorCount > 0 }">
        <div class="w-flow-docs__problems-title">
          {{ errorCount > 0 ? t('shipping.documents.problems-title', { count: errorCount }) : t('shipping.documents.warnings-title', { count: problems.length }) }}
        </div>
        <CustomsProblemList :problems="problems" :lines="view.lines" :warehouse-id="warehouseId"
          :can-edit-customs="canEditCustoms" @edit-customs="emit('edit-customs')" />

        <!-- 缺原产国：就地补录到商品主数据 -->
        <div v-if="!locked && originMissingLines.length > 0" class="w-flow-docs__origins">
          <div v-for="line in originMissingLines" :key="line.goods_code" class="w-flow-docs__origin">
            <span class="w-flow-docs__origin-goods">
              <span class="w-flow-docs__mono">{{ line.goods_code }}</span>
              <span class="w-faint">{{ line.goods_name }}</span>
            </span>
            <CountryCombobox v-model="originDraft[String(line.goods_id)]" size="sm" :clearable="false" class="w-flow-docs__origin-select"
              :aria-label="t('customs.fields.origin')" />
            <WButton size="sm" variant="primary" :loading="originSaving[String(line.goods_id)]"
              :disabled="!originDraft[String(line.goods_id)]" @click="saveOrigin(line)">{{ t('button.save') }}</WButton>
          </div>
          <span class="w-flow-docs__hint">{{ t('customs.tips.origin-master') }}</span>
        </div>

        <div v-if="hasSnapshotProblems" class="w-flow-docs__fix">
          <WButton v-if="canEditCustoms" size="sm" @click="emit('edit-customs')">{{ t('customs.operations.edit-customs') }}</WButton>
          <span v-else-if="!locked" class="w-flow-docs__hint">{{ t('customs.tips.data-need-dn-edit') }}</span>
        </div>
      </div>
      <WStatus v-else-if="view.customs" tone="ok" class="w-flow-docs__ok">{{ t('customs.tips.no-problems') }}</WStatus>

      <!-- 当前单证 + 签发 -->
      <div class="w-flow-docs__docs">
        <div class="w-flow-docs__current">
          <template v-if="ci || pl">
            <span v-if="ci">{{ docTypeText('commercial_invoice') }} <b>v{{ ci.version }}</b></span>
            <span v-if="pl">{{ docTypeText('packing_list') }} <b>v{{ pl.version }}</b></span>
          </template>
          <span v-else class="w-faint">{{ t('customs.tips.no-documents') }}</span>
        </div>
        <div v-if="shippingStage" class="w-flow-docs__actions">
          <WButton v-if="ci" icon="printer" :loading="busyDocId === ci.id" :disabled="busyDocId !== null && busyDocId !== ci.id"
            @click="printDoc(dnId, ci)">{{ t('customs.operations.print-ci') }}</WButton>
          <WButton v-if="pl" icon="printer" :loading="busyDocId === pl.id" :disabled="busyDocId !== null && busyDocId !== pl.id"
            @click="printDoc(dnId, pl)">{{ t('customs.operations.print-pl') }}</WButton>
          <WButton v-if="!locked" :variant="issuePrimary ? 'primary' : 'secondary'" :loading="issuing"
            :disabled="!canIssue || packagesDirty" :title="issueHint" @click="issue">{{ issueText }}</WButton>
        </div>
      </div>
      <p v-if="!locked && issueHint" class="w-flow-docs__hint">{{ issueHint }}</p>

      <DeclaredValueNotice v-if="view.customs" compact :customs="view.customs" :mode="declaredMode" />

      <div class="w-flow-docs__links">
        <WButton v-if="shippingStage" size="sm" variant="text" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">
          {{ t('customs.operations.history') }}<WIcon :name="historyOpen ? 'chevron-up' : 'chevron-down'" :size="14" />
        </WButton>
        <WButton v-if="view.customs" size="sm" variant="text" :aria-expanded="dataOpen" @click="dataOpen = !dataOpen">
          {{ t('shipping.documents.customs-data') }}<WIcon :name="dataOpen ? 'chevron-up' : 'chevron-down'" :size="14" />
        </WButton>
        <WButton v-if="canEditCustoms" size="sm" variant="text" @click="emit('edit-customs')">{{ t('customs.operations.edit-customs') }}</WButton>
      </div>
      <CustomsDocumentHistory v-if="historyOpen" :dn-id="dnId" :active="historyOpen" :reload-key="historyKey" />
      <CustomsDataDetail v-if="dataOpen && view.customs" :view="view" :warehouse-id="warehouseId" />
    </template>
  </div>
</template>

<style scoped>
.w-flow-docs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-flow-docs__loading { display: flex; flex-direction: column; gap: 8px; }
.w-flow-docs__loading span { display: block; width: 60%; height: 14px; border-radius: 4px; background: var(--w-skeleton); }
/* 「要处理」：白底 + 左侧琥珀条（阻断级的错误也只用琥珀，设计稿：一个问题一种颜色） */
.w-flow-docs__problems {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--w-border);
  border-left: 3px solid var(--w-warn-dot);
  border-radius: var(--w-radius-control);
}
.w-flow-docs__problems-title { font-weight: var(--w-fw-semibold); color: var(--w-warn-text); }
.w-flow-docs__origins { display: flex; flex-direction: column; gap: 6px; }
.w-flow-docs__origin { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.w-flow-docs__origin-goods { display: inline-flex; flex-direction: column; min-width: 200px; }
.w-flow-docs__origin-select { width: 240px; }
.w-flow-docs__mono { font-family: var(--w-font-mono); font-size: var(--w-fs-12); }
.w-flow-docs__fix { display: flex; align-items: center; gap: 8px; }
.w-flow-docs__ok { font-size: var(--w-fs-13); }
.w-flow-docs__docs { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.w-flow-docs__current { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.w-flow-docs__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.w-flow-docs__hint { margin: 0; font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-flow-docs__links { display: flex; flex-wrap: wrap; gap: 4px; margin-left: -8px; }
</style>
