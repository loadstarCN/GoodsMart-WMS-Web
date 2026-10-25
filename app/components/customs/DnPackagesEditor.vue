<script lang="ts" setup>
/**
 * 海外出荷：箱子录入（每箱毛重、长宽高）
 * - 画面按 cm / kg 录入，保存时尺寸 ×10 换算成 mm（整数），毛重保留三位小数；
 *   尺寸超过 1 位小数、毛重超过 3 位小数时提示用户改正（不静默四舍五入）
 * - 1–99 箱，编号从 1 连续（保存时按顺序自动编号）
 * - 已出单证后改箱子，后端会自动作废现有单证（返回 voided_documents）
 */
import type { CustomsPackage } from '~/composables/customs/customsDocuments'

const props = withDefaults(defineProps<{
  dnId: number | string
  /** 由父组件传入的箱子；不传（undefined）时组件自己读取 */
  packages?: CustomsPackage[] | null
  editable?: boolean
  /** 不可编辑时的说明文字 */
  readonlyReason?: string
}>(), {
  packages: undefined,
  editable: false,
  readonlyReason: '',
})

const emit = defineEmits<{
  (e: 'saved', data: { packages: CustomsPackage[]; voided_documents: number[] }): void
}>()

const { t } = useI18n()
const { bizErrorMessage } = useBizError()

interface PackageRow {
  gross_weight_kg: string | number
  length_cm: string | number
  width_cm: string | number
  height_cm: string | number
  remark: string
}

const MAX_PACKAGES = 99
const rows = ref<PackageRow[]>([])
const original = ref('[]')
const loading = ref(false)
const saving = ref(false)
const rowErrors = ref<string[][]>([])
const formError = ref<string | null>(null)

const mmToCm = (mm: number | null | undefined): string =>
  mm === null || mm === undefined || isNaN(Number(mm)) ? '' : String(Math.round(Number(mm)) / 10)

const toRows = (packages: CustomsPackage[] | null | undefined): PackageRow[] =>
  [...(packages || [])]
    .sort((a, b) => Number(a.package_no) - Number(b.package_no))
    .map((p) => ({
      gross_weight_kg: p.gross_weight_kg === null || p.gross_weight_kg === undefined ? '' : String(p.gross_weight_kg),
      length_cm: mmToCm(p.length_mm),
      width_cm: mmToCm(p.width_mm),
      height_cm: mmToCm(p.height_mm),
      remark: p.remark || '',
    }))

const serialize = (list: PackageRow[]) =>
  JSON.stringify(list.map((r) => [String(r.gross_weight_kg), String(r.length_cm), String(r.width_cm), String(r.height_cm), r.remark || '']))

const dirty = computed(() => serialize(rows.value) !== original.value)

const reset = (packages: CustomsPackage[] | null | undefined) => {
  rows.value = toRows(packages)
  original.value = serialize(rows.value)
  rowErrors.value = []
  formError.value = null
}

const load = async () => {
  loading.value = true
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/packages`, {
    method: 'GET',
    onSuccess: (data) => {
      reset(Array.isArray(data) ? data : data?.packages)
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      loading.value = false
    },
  })
}

// 父组件刷新时同步（有未保存修改时不覆盖）
watch(() => props.packages, (val: CustomsPackage[] | null | undefined) => {
  if (val === undefined) return
  if (dirty.value) return
  reset(val)
}, { deep: true })

onMounted(() => {
  if (props.packages === undefined) {
    load()
  } else {
    reset(props.packages)
  }
})

const addRow = () => {
  if (rows.value.length >= MAX_PACKAGES) {
    formError.value = t('customs.packages.validation.count')
    return
  }
  const last = rows.value[rows.value.length - 1]
  // 新箱子沿用上一箱的尺寸（同规格纸箱常见），毛重留空
  rows.value.push({
    gross_weight_kg: '',
    length_cm: last?.length_cm ?? '',
    width_cm: last?.width_cm ?? '',
    height_cm: last?.height_cm ?? '',
    remark: '',
  })
}

const removeRow = (index: number) => {
  rows.value.splice(index, 1)
  rowErrors.value.splice(index, 1)
}

const toNumber = (v: string | number): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

/** 小数位数（忽略末尾的 0；兼容 1e-7 这类指数写法） */
const decimalPlaces = (v: string | number): number => {
  const m = /^[+-]?\d*(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(v).trim())
  if (!m) return 0
  const fraction = (m[1] || '').replace(/0+$/, '').length
  return Math.max(0, fraction - (m[2] ? Number(m[2]) : 0))
}
/** 毛重最多 3 位小数（g），尺寸最多 1 位小数（mm）：多了提示用户，不静默四舍五入 */
const WEIGHT_MAX_DECIMALS = 3
const DIMENSION_MAX_DECIMALS = 1

const validate = (): boolean => {
  formError.value = null
  const errs: string[][] = []
  let ok = true
  if (rows.value.length < 1 || rows.value.length > MAX_PACKAGES) {
    formError.value = t('customs.packages.validation.count')
    ok = false
  }
  rows.value.forEach((r: PackageRow, i: number) => {
    const e: string[] = []
    const w = toNumber(r.gross_weight_kg)
    if (w === null || w < 0.01 || w > 999.999) {
      e.push(t('customs.packages.validation.weight'))
    } else if (decimalPlaces(r.gross_weight_kg) > WEIGHT_MAX_DECIMALS) {
      e.push(t('customs.packages.validation.weight-decimals', { max: WEIGHT_MAX_DECIMALS }))
    }
    for (const v of [r.length_cm, r.width_cm, r.height_cm]) {
      const cm = toNumber(v)
      const mm = cm === null ? null : Math.round(cm * 10)
      if (mm === null || mm < 1 || mm > 3000) {
        e.push(t('customs.packages.validation.dimension'))
        break
      }
      if (decimalPlaces(v) > DIMENSION_MAX_DECIMALS) {
        e.push(t('customs.packages.validation.dimension-decimals', { max: DIMENSION_MAX_DECIMALS }))
        break
      }
    }
    errs[i] = e
    if (e.length) ok = false
  })
  rowErrors.value = errs
  return ok
}

const save = async () => {
  if (!validate()) return
  saving.value = true
  const payload = {
    packages: rows.value.map((r: PackageRow, i: number) => ({
      package_no: i + 1,
      gross_weight_kg: Math.round(Number(r.gross_weight_kg) * 1000) / 1000,
      length_mm: Math.round(Number(r.length_cm) * 10),
      width_mm: Math.round(Number(r.width_cm) * 10),
      height_mm: Math.round(Number(r.height_cm) * 10),
      remark: r.remark?.trim() || null,
    })),
  }
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/packages`, {
    method: 'PUT',
    body: payload,
    onSuccess: (data) => {
      const saved: CustomsPackage[] = Array.isArray(data?.packages) ? data.packages : payload.packages
      const voided: number[] = Array.isArray(data?.voided_documents) ? data.voided_documents : []
      reset(saved)
      showToast(t('action-results.success'), 'success')
      if (voided.length > 0) {
        showToast(t('customs.tips.documents-voided', { count: voided.length }), 'warning')
      }
      emit('saved', { packages: saved, voided_documents: voided })
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      saving.value = false
    },
  })
}

const totalWeight = computed(() => {
  const sum = rows.value.reduce((s: number, r: PackageRow) => s + (toNumber(r.gross_weight_kg) || 0), 0)
  return Math.round(sum * 1000) / 1000
})

defineExpose({ reload: load, dirty })
</script>

<template>
  <div class="w-pkgs">
    <div v-if="loading" class="w-pkgs__loading" aria-busy="true"><span /><span /></div>
    <template v-else>
      <p v-if="!editable && readonlyReason" class="w-pkgs__reason">{{ readonlyReason }}</p>

      <div class="w-pkgs__table">
        <table class="w-pkgs__grid">
          <thead>
            <tr>
              <th scope="col" class="is-no">{{ t('customs.packages.box-no') }}</th>
              <th scope="col" class="is-num">{{ t('customs.packages.gross-weight-kg') }}</th>
              <th scope="col" class="is-num">{{ t('customs.packages.length-cm') }}</th>
              <th scope="col" class="is-num">{{ t('customs.packages.width-cm') }}</th>
              <th scope="col" class="is-num">{{ t('customs.packages.height-cm') }}</th>
              <th scope="col">{{ t('customs.packages.remark') }}</th>
              <th v-if="editable" scope="col" class="is-del"><span class="w-sr-only">{{ t('customs.packages.remove') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, index) in rows" :key="index">
              <tr :class="{ 'has-error': rowErrors[index]?.length }">
                <td class="is-no">{{ Number(index) + 1 }} / {{ rows.length }}</td>
                <template v-if="editable">
                  <td><WInput v-model="row.gross_weight_kg" size="sm" type="number" min="0.01" max="999.999" step="0.001" align="right"
                    :aria-label="t('customs.packages.gross-weight-kg')" /></td>
                  <td><WInput v-model="row.length_cm" size="sm" type="number" min="0.1" max="300" step="0.1" align="right"
                    :aria-label="t('customs.packages.length-cm')" /></td>
                  <td><WInput v-model="row.width_cm" size="sm" type="number" min="0.1" max="300" step="0.1" align="right"
                    :aria-label="t('customs.packages.width-cm')" /></td>
                  <td><WInput v-model="row.height_cm" size="sm" type="number" min="0.1" max="300" step="0.1" align="right"
                    :aria-label="t('customs.packages.height-cm')" /></td>
                  <td><WInput v-model="row.remark" size="sm" maxlength="200" :aria-label="t('customs.packages.remark')" /></td>
                  <td class="is-del">
                    <WButton size="sm" variant="text" icon="close" icon-only :aria-label="t('customs.packages.remove')" @click="removeRow(index)" />
                  </td>
                </template>
                <template v-else>
                  <td class="is-num">{{ row.gross_weight_kg }}</td>
                  <td class="is-num">{{ row.length_cm }}</td>
                  <td class="is-num">{{ row.width_cm }}</td>
                  <td class="is-num">{{ row.height_cm }}</td>
                  <td class="w-muted">{{ row.remark || '' }}</td>
                </template>
              </tr>
              <tr v-if="rowErrors[index]?.length" class="w-pkgs__errors">
                <td :colspan="editable ? 7 : 6">
                  <span v-for="(msg, i) in rowErrors[index]" :key="i">{{ msg }}</span>
                </td>
              </tr>
            </template>
            <tr v-if="rows.length === 0">
              <td :colspan="editable ? 7 : 6" class="w-pkgs__empty">{{ t('customs.packages.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="formError" class="w-pkgs__error" role="alert">{{ formError }}</p>

      <div class="w-pkgs__foot">
        <span class="w-pkgs__total">
          {{ t('customs.packages.total', { count: rows.length, weight: totalWeight }) }}
          <WTag v-if="editable && dirty" tone="warn">{{ t('customs.packages.unsaved') }}</WTag>
        </span>
        <div v-if="editable" class="w-pkgs__actions">
          <WButton size="sm" icon="plus" :disabled="rows.length >= MAX_PACKAGES" @click="addRow">{{ t('customs.packages.add') }}</WButton>
          <WButton size="sm" variant="primary" :loading="saving" :disabled="!dirty" @click="save">{{ t('customs.packages.save') }}</WButton>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.w-pkgs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-pkgs__loading { display: flex; flex-direction: column; gap: 8px; }
.w-pkgs__loading span { display: block; height: 14px; width: 60%; border-radius: 4px; background: var(--w-skeleton); }
.w-pkgs__reason { margin: 0; font-size: var(--w-fs-12); color: var(--w-text-3); }
.w-pkgs__table {
  overflow-x: auto;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
}
.w-pkgs__grid { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.w-pkgs__grid th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--w-border);
  color: var(--w-text-3);
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  text-align: left;
  white-space: nowrap;
}
.w-pkgs__grid td { padding: 6px 10px; border-top: 1px solid var(--w-line); vertical-align: middle; }
.w-pkgs__grid tbody tr:first-child td { border-top: 0; }
.w-pkgs__grid .is-num { text-align: right; }
.w-pkgs__grid td.is-num { min-width: 80px; }
.w-pkgs__grid .is-no { width: 64px; white-space: nowrap; font-weight: var(--w-fw-medium); }
.w-pkgs__grid .is-del { width: 40px; text-align: right; }
.w-pkgs__grid td :deep(.w-input) { min-width: 84px; }
.w-pkgs__errors td { border-top: 0; padding-top: 0; color: var(--w-bad-text); font-size: var(--w-fs-12); }
.w-pkgs__errors span + span::before { content: ' · '; }
.w-pkgs__empty { padding: 20px; text-align: center; color: var(--w-text-3); }
.w-pkgs__error { margin: 0; color: var(--w-bad-text); font-size: var(--w-fs-12); }
.w-pkgs__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.w-pkgs__total { display: inline-flex; align-items: center; gap: 8px; color: var(--w-text-2); }
.w-pkgs__actions { display: flex; gap: 8px; }
</style>
