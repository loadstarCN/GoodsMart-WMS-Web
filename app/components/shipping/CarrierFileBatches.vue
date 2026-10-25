<script lang="ts" setup>
/**
 * 最近的承运商文件（发货单列表「最近的文件」）：GET /dn/carrier-files/batches?carrier_id=&warehouse_id=
 * → 导出 / 导入批次（文件名、行数、导入结果的汇总、时间、操作人）。右侧抽屉（v-model:open），选承运商（文件方式的）后读取；
 * 每次打开都重读一次（可能刚导出 / 导入过），也可以手动刷新。
 */
import { formatUserRef } from '~/composables/customs/customsDocuments'
import {
  CARRIER_FILES_BATCHES_URL,
  IMPORT_RESULTS,
  normalizeFileBatches,
  type CarrierFileBatch,
  type FileCarrierOption,
} from '~/composables/shipping/carrierFile'
import type { WSelectOption } from '~/components/w/WSelect.vue'

const props = withDefaults(defineProps<{
  carriers: FileCarrierOption[]
  /** 默认的承运商（选中的发货单的） */
  carrierId?: number | null
  warehouseId?: number | string | null
}>(), {
  carrierId: null,
  warehouseId: null,
})

const open = defineModel<boolean>('open', { default: false })
const { t, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()
const locale = computed(() => String(localeProperties.value?.iso || '') || undefined)

const chosen = ref<number | null>(null)
const batches = ref<CarrierFileBatch[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

const carrierOptions = computed<WSelectOption<number>[]>(() => props.carriers.map((c) => ({ value: c.id, label: c.name })))

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

watch(open, async (value: boolean) => {
  if (!value) return
  const fallback = props.carriers.length === 1 ? props.carriers[0]!.id : null
  const next = props.carrierId ?? chosen.value ?? fallback
  // 换了承运商时由下面的 watch 读取；没换时每次打开重读一次
  if (next !== chosen.value) chosen.value = next
  else await load()
})
watch(chosen, (value: number | null, old: number | null) => {
  if (open.value && value !== old) load()
})

/** 批次时刻按批次的仓库（有 warehouse_id 时）→ 列表的仓库 → 页头 / 浏览器的时区显示 */
const timeText = (value: string | null, batch?: CarrierFileBatch) =>
  formatLocaleDateTime(value, locale.value, resolveTimeZone(batch as Record<string, any> | undefined, props.warehouseId))
const userText = (u: any) => formatUserRef(u, t)
/** 导入批次的结果汇总（匹配 3 · 找不到 1 …）；导出批次没有 */
const summaryText = (b: CarrierFileBatch) => (b.kind === 'import' && b.summary
  ? IMPORT_RESULTS.filter((r) => Number(b.summary?.[r]) > 0)
    .map((r) => `${t(`shipping.file.results.${r}`)} ${Number(b.summary?.[r])}`).join(' · ')
  : '')
</script>

<template>
  <WDrawer v-model:open="open" :title="t('shipping.file.recent-files')" width="440px">
    <div class="w-fbat">
      <div class="w-fbat__bar">
        <WSelect v-model="chosen" :options="carrierOptions" :placeholder="t('shipping.file.choose-carrier')"
          :aria-label="t('common.entities.carrier')" />
        <WButton icon="refresh" icon-only :loading="loading" :disabled="!chosen" :aria-label="t('shipping.refresh')"
          @click="load" />
      </div>
      <WAlert v-if="loadError" tone="block" :title="loadError" />
      <WEmptyState v-else-if="!loading && !batches.length" :title="t('shipping.file.no-batches')" icon="dn" compact />
      <ul v-else class="w-fbat__list">
        <li v-for="b in batches" :key="b.id" class="w-fbat__item">
          <div class="w-fbat__head">
            <span class="w-fbat__kind">{{ t(`shipping.file.batch-kinds.${b.kind}`) }}</span>
            <span class="w-faint">#{{ b.id }}</span>
            <span class="w-fbat__time">{{ timeText(b.created_at, b) }}</span>
          </div>
          <div v-if="b.file_name" class="w-fbat__file">{{ b.file_name }}</div>
          <div class="w-fbat__meta">
            <span v-if="b.row_count !== null">{{ t('shipping.file.batch-rows', { count: b.row_count }) }}</span>
            <span v-if="summaryText(b)">{{ summaryText(b) }}</span>
            <span v-if="b.created_by" class="w-fbat__user">{{ userText(b.created_by) }}</span>
          </div>
        </li>
      </ul>
    </div>
  </WDrawer>
</template>

<style scoped>
.w-fbat {
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-16);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
}
.w-fbat__bar { display: flex; gap: 8px; }
.w-fbat__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
}
.w-fbat__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
}
.w-fbat__item + .w-fbat__item { border-top: 1px solid var(--w-line); }
.w-fbat__head { display: flex; align-items: baseline; gap: 8px; }
.w-fbat__kind { font-weight: var(--w-fw-semibold); color: var(--w-text-1); }
.w-fbat__time { margin-left: auto; color: var(--w-text-3); font-size: var(--w-fs-12); }
.w-fbat__file { color: var(--w-text-1); overflow-wrap: anywhere; font-family: var(--w-font-mono); font-size: var(--w-fs-12); }
.w-fbat__meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--w-text-2); font-size: var(--w-fs-12); }
.w-fbat__user { margin-left: auto; color: var(--w-text-3); }
</style>
