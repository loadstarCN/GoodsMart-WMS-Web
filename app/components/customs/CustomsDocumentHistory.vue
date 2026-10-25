<script lang="ts" setup>
/**
 * 报关单证（及面单）的历史版本：GET /dn/<id>/customs-documents/，按版本倒序。
 * 类型、版本、单证号（悬停 SHA-256）、签发时刻（按上层 provideTimeZone 的仓库时区）+ 签发人、状态（作废 · 原因）、大小；
 * PDF 可查看 / 下载，指令文件面单（ZPL / EPL）只能按原格式下载。
 * 发货流程「报关单证」一步里展开看，发货单详情右栏「报关单证」的「历史版本」在抽屉里看。
 * active 变成 true 时读取；reloadKey 变了（别处签发 / 改箱子作废）且正显示着时重读。
 */
import {
  formatBytes,
  formatUserRef,
  isPdfDocument,
  normalizeDocumentList,
  useCustomsPdfActions,
  type CustomsDocumentMeta,
} from '~/composables/customs/customsDocuments'

const props = withDefaults(defineProps<{
  dnId: number | string
  active?: boolean
  /** 当前单证的标识（如 id 列表）：变了就重读 */
  reloadKey?: string
}>(), {
  active: true,
  reloadKey: '',
})

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const { format: formatZoned } = useTimeZone()
const { busyDocId, viewDoc, downloadDoc, downloadRawDoc } = useCustomsPdfActions()

const loading = ref(false)
const history = ref<CustomsDocumentMeta[]>([])

const load = async () => {
  loading.value = true
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/customs-documents/`, {
    method: 'GET',
    onSuccess: (data) => {
      history.value = normalizeDocumentList(data)
        .slice()
        .sort((a, b) => (Number(b.version) - Number(a.version)) || String(a.doc_type).localeCompare(String(b.doc_type)))
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      loading.value = false
    },
  })
}
watch(() => props.active, (active: boolean) => {
  if (active) load()
}, { immediate: true })
watch(() => props.reloadKey, () => {
  if (props.active) load()
})

const docTypeText = (type: string) => (te(`customs.doc-types.${type}`) ? t(`customs.doc-types.${type}`) : type)
const voidReasonText = (reason: string | null | undefined) => {
  if (!reason) return ''
  const key = `customs.void-reasons.${reason}`
  return te(key) ? t(key) : reason
}
const userText = (u: any) => formatUserRef(u, t)

defineExpose({ load })
</script>

<template>
  <div class="w-cdoc-history">
    <div v-if="loading && !history.length" class="w-cdoc-history__loading" aria-busy="true"><span /><span /></div>
    <p v-else-if="!history.length" class="w-cdoc-history__empty">{{ t('customs.tips.no-documents') }}</p>
    <div v-else class="w-cdoc-history__table">
      <table class="w-cdoc-history__grid">
        <thead>
          <tr>
            <th scope="col">{{ t('customs.fields.doc-type') }}</th>
            <th scope="col">{{ t('customs.fields.version') }}</th>
            <th scope="col">{{ t('customs.fields.document-number') }}</th>
            <th scope="col">{{ t('customs.fields.issued-at') }}</th>
            <th scope="col">{{ t('customs.fields.status') }}</th>
            <th scope="col" class="is-num">{{ t('customs.fields.size') }}</th>
            <th scope="col"><span class="w-sr-only">{{ t('customs.operations.view') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in history" :key="doc.id" :class="{ 'is-void': doc.status === 'void' }">
            <td>{{ docTypeText(doc.doc_type) }}</td>
            <td>v{{ doc.version }}</td>
            <td class="is-mono" :title="doc.sha256 ? `SHA-256 ${doc.sha256}` : ''">{{ doc.document_number }}</td>
            <td>
              {{ formatZoned(doc.issued_at, 'YYYY-MM-DD HH:mm', { withZone: false }) }}
              <span v-if="doc.issued_by" class="w-faint">{{ userText(doc.issued_by_user ?? doc.issued_by) }}</span>
            </td>
            <td>
              <WStatus v-if="doc.status === 'void'" tone="none" muted>
                {{ t('customs.doc-status.void') }}<template v-if="doc.void_reason"> · {{ voidReasonText(doc.void_reason) }}</template>
              </WStatus>
              <WStatus v-else tone="ok" muted>{{ t('customs.doc-status.issued') }}</WStatus>
            </td>
            <td class="is-num">{{ formatBytes(doc.size_bytes) }}</td>
            <td class="is-actions">
              <!-- PDF（CI / PL / PDF 面单）：查看、下载；ZPL / EPL 指令文件面单：只能按原格式下载 -->
              <template v-if="isPdfDocument(doc)">
                <WButton size="sm" variant="text" :disabled="busyDocId !== null" @click="viewDoc(dnId, doc)">{{ t('customs.operations.view') }}</WButton>
                <WButton size="sm" variant="text" :disabled="busyDocId !== null" @click="downloadDoc(dnId, doc)">{{ t('customs.operations.download') }}</WButton>
              </template>
              <WButton v-else size="sm" variant="text" :disabled="busyDocId !== null" @click="downloadRawDoc(dnId, doc)">{{ t('customs.operations.download') }}</WButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.w-cdoc-history { font-family: var(--w-font); font-size: var(--w-fs-13); line-height: var(--w-lh-13); color: var(--w-text-1); }
.w-cdoc-history__loading { display: flex; flex-direction: column; gap: 8px; }
.w-cdoc-history__loading span { display: block; width: 70%; height: 14px; border-radius: 4px; background: var(--w-skeleton); }
.w-cdoc-history__empty { margin: 0; color: var(--w-text-3); }
.w-cdoc-history__table { overflow-x: auto; border: 1px solid var(--w-border); border-radius: var(--w-radius-card); }
.w-cdoc-history__grid { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.w-cdoc-history__grid th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--w-border);
  color: var(--w-text-3);
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  text-align: left;
  white-space: nowrap;
}
.w-cdoc-history__grid td { padding: 6px 10px; border-top: 1px solid var(--w-line); white-space: nowrap; }
.w-cdoc-history__grid tbody tr:first-child td { border-top: 0; }
.w-cdoc-history__grid tr.is-void td { color: var(--w-text-3); }
.w-cdoc-history__grid .is-num { text-align: right; }
.w-cdoc-history__grid .is-mono { font-family: var(--w-font-mono); font-size: var(--w-fs-12); }
.w-cdoc-history__grid .is-actions { text-align: right; }
</style>
