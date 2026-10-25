<script lang="ts" setup>
/**
 * 最近的承运商文件（出库单列表「待建运单 / 待导回」的批量操作旁）：GET /dn/carrier-files/batches?carrier_id=&warehouse_id=
 * → 导出 / 导入批次（文件名、行数、导入结果的汇总、时间、操作人）。点按钮弹出，选承运商（文件方式的）后读取。
 */
import { formatUserRef } from '~/composables/customs/customsDocuments'
import {
  CARRIER_FILES_BATCHES_URL,
  IMPORT_RESULTS,
  importResultColor,
  normalizeFileBatches,
  type CarrierFileBatch,
  type FileCarrierOption,
} from '~/composables/shipping/carrierFile'

const props = withDefaults(defineProps<{
  carriers: FileCarrierOption[]
  /** 默认的承运商（选中的出库单的） */
  carrierId?: number | null
  warehouseId?: number | string | null
}>(), {
  carrierId: null,
  warehouseId: null,
})

const { t, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()
const locale = computed(() => String(localeProperties.value?.iso || '') || undefined)

const open = ref(false)
const chosen = ref<number | null>(null)
const batches = ref<CarrierFileBatch[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)

const load = async () => {
  if (!chosen.value) {
    batches.value = []
    return
  }
  loading.value = true
  loadError.value = null
  await httpRequest<any>(CARRIER_FILES_BATCHES_URL, {
    method: 'GET',
    params: {
      carrier_id: chosen.value,
      warehouse_id: props.warehouseId === null || props.warehouseId === '' ? undefined : props.warehouseId,
    },
    onSuccess: (data) => {
      batches.value = normalizeFileBatches(data)
    },
    onError: (error) => {
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      loading.value = false
    },
  })
}

const toggle = async () => {
  open.value = !open.value
  if (!open.value) return
  const fallback = props.carriers.length === 1 ? props.carriers[0]!.id : null
  const next = props.carrierId ?? chosen.value ?? fallback
  // 换了承运商时由下面的 watch 读取；没换时每次打开重读一次（可能刚导出 / 导入过）
  if (next !== chosen.value) chosen.value = next
  else await load()
}
watch(chosen, (value: number | null, old: number | null) => {
  if (open.value && value !== old) load()
})

const onDocumentClick = (event: MouseEvent) => {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

/** 批次时刻按批次的仓库（有 warehouse_id 时）→ 列表的仓库 → 页头 / 浏览器的时区显示 */
const timeText = (value: string | null, batch?: CarrierFileBatch) =>
  formatLocaleDateTime(value, locale.value, resolveTimeZone(batch as Record<string, any> | undefined, props.warehouseId))
const userText = (u: any) => formatUserRef(u, t)
/** 导入批次的结果汇总（matched 3 · not_found 1 …）；导出批次没有 */
const summaryParts = (b: CarrierFileBatch) => (b.kind === 'import' && b.summary
  ? IMPORT_RESULTS.filter((r) => Number(b.summary?.[r]) > 0).map((r) => ({ r, n: Number(b.summary?.[r]) }))
  : [])
</script>

<template>
  <div class="carrier-file-batches position-relative" ref="root">
    <button type="button" class="btn btn-sm btn-outline-light text-default" :aria-expanded="open" @click.stop="toggle">
      <i class="ri-history-line me-1"></i>{{ t('shipping.file.recent-files') }}
    </button>
    <div class="dropdown-menu dropdown-menu-end show p-0 carrier-file-batches-menu" v-if="open" @click.stop>
      <div class="p-2 border-bottom d-flex align-items-center gap-2">
        <select class="form-select form-select-sm" v-model.number="chosen" :aria-label="t('common.entities.carrier')">
          <option :value="null" disabled>{{ t('shipping.file.choose-carrier') }}</option>
          <option v-for="c in carriers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button type="button" class="btn btn-sm btn-icon btn-light" :disabled="loading || !chosen" :title="t('shipping.refresh')"
          :aria-label="t('shipping.refresh')" @click="load">
          <span class="spinner-border spinner-border-sm" v-if="loading"></span>
          <i class="ri-refresh-line" v-else></i>
        </button>
      </div>
      <div class="carrier-file-batches-list">
        <div class="p-3 fs-12 text-danger" v-if="loadError">{{ loadError }}</div>
        <div class="p-3 fs-12 text-muted text-center" v-else-if="!loading && !batches.length">{{ t('shipping.file.no-batches') }}</div>
        <div class="px-3 py-2 border-bottom fs-12" v-for="b in batches" :key="b.id">
          <div class="d-flex align-items-center gap-2">
            <span class="badge" :class="b.kind === 'import' ? 'bg-info-transparent' : 'bg-primary-transparent'">
              <i class="me-1" :class="b.kind === 'import' ? 'ri-file-upload-line' : 'ri-file-download-line'"></i>{{ t(`shipping.file.batch-kinds.${b.kind}`) }}
            </span>
            <span class="text-muted">#{{ b.id }}</span>
            <span class="text-muted ms-auto">{{ timeText(b.created_at, b) }}</span>
          </div>
          <div class="font-monospace text-break mt-1" v-if="b.file_name">{{ b.file_name }}</div>
          <div class="text-muted mt-1 d-flex flex-wrap gap-1 align-items-center">
            <span v-if="b.row_count !== null">{{ t('shipping.file.batch-rows', { count: b.row_count }) }}</span>
            <span class="badge" :class="`bg-${importResultColor(p.r)}-transparent`" v-for="p in summaryParts(b)" :key="p.r">
              {{ t(`shipping.file.results.${p.r}`) }} {{ p.n }}
            </span>
            <span class="ms-auto" v-if="b.created_by">{{ userText(b.created_by) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.carrier-file-batches-menu {
  position: absolute;
  right: 0;
  top: 100%;
  width: 22rem;
  max-width: 90vw;
  z-index: 1050;
}

.carrier-file-batches-list {
  max-height: 22rem;
  overflow-y: auto;
}
</style>
