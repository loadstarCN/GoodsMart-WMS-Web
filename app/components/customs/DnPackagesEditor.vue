<script lang="ts" setup>
/**
 * 海外出荷：箱子录入（每箱毛重、长宽高）
 * - 画面按 cm / kg 录入，保存时尺寸 ×10 换算成 mm（整数），毛重保留三位小数
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
    if (w === null || w < 0.01 || w > 999.999) e.push(t('customs.packages.validation.weight'))
    for (const v of [r.length_cm, r.width_cm, r.height_cm]) {
      const cm = toNumber(v)
      const mm = cm === null ? null : Math.round(cm * 10)
      if (mm === null || mm < 1 || mm > 3000) {
        e.push(t('customs.packages.validation.dimension'))
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
  <div class="dn-packages-editor">
    <div class="d-flex justify-content-center py-3" v-if="loading">
      <div class="spinner-border spinner-border-sm text-primary" role="status">
        <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
      </div>
    </div>
    <template v-else>
      <p class="fs-12 text-muted mb-2" v-if="editable">
        <i class="ri-information-line me-1"></i>{{ t('customs.packages.tip') }}
      </p>
      <p class="fs-12 text-muted mb-2" v-else-if="readonlyReason">
        <i class="ri-lock-line me-1"></i>{{ readonlyReason }}
      </p>

      <div class="table-responsive">
        <table class="table table-sm table-bordered align-middle mb-2">
          <thead>
            <tr>
              <th scope="col" style="width: 64px;">{{ t('customs.packages.box-no') }}</th>
              <th scope="col">{{ t('customs.packages.gross-weight-kg') }}</th>
              <th scope="col">{{ t('customs.packages.length-cm') }}</th>
              <th scope="col">{{ t('customs.packages.width-cm') }}</th>
              <th scope="col">{{ t('customs.packages.height-cm') }}</th>
              <th scope="col">{{ t('customs.packages.remark') }}</th>
              <th scope="col" v-if="editable" style="width: 48px;"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, index) in rows" :key="index">
              <tr>
                <td class="fw-semibold">{{ Number(index) + 1 }} / {{ rows.length }}</td>
                <template v-if="editable">
                  <td>
                    <input type="number" class="form-control form-control-sm" min="0.01" max="999.999" step="0.001"
                      v-model="row.gross_weight_kg" :aria-label="t('customs.packages.gross-weight-kg')">
                  </td>
                  <td>
                    <input type="number" class="form-control form-control-sm" min="0.1" max="300" step="0.1"
                      v-model="row.length_cm" :aria-label="t('customs.packages.length-cm')">
                  </td>
                  <td>
                    <input type="number" class="form-control form-control-sm" min="0.1" max="300" step="0.1"
                      v-model="row.width_cm" :aria-label="t('customs.packages.width-cm')">
                  </td>
                  <td>
                    <input type="number" class="form-control form-control-sm" min="0.1" max="300" step="0.1"
                      v-model="row.height_cm" :aria-label="t('customs.packages.height-cm')">
                  </td>
                  <td>
                    <input type="text" class="form-control form-control-sm" maxlength="200" v-model="row.remark"
                      :aria-label="t('customs.packages.remark')">
                  </td>
                  <td class="text-center">
                    <button type="button" class="btn btn-icon btn-sm btn-danger-light" :title="t('customs.packages.remove')"
                      @click="removeRow(index)">
                      <i class="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </template>
                <template v-else>
                  <td>{{ row.gross_weight_kg !== '' ? row.gross_weight_kg : '—' }}</td>
                  <td>{{ row.length_cm !== '' ? row.length_cm : '—' }}</td>
                  <td>{{ row.width_cm !== '' ? row.width_cm : '—' }}</td>
                  <td>{{ row.height_cm !== '' ? row.height_cm : '—' }}</td>
                  <td>{{ row.remark || '' }}</td>
                </template>
              </tr>
              <tr v-if="rowErrors[index]?.length">
                <td :colspan="editable ? 7 : 6" class="py-1">
                  <div class="invalid-feedback d-block mt-0" v-for="(msg, i) in rowErrors[index]" :key="i">{{ msg }}</div>
                </td>
              </tr>
            </template>
            <tr v-if="rows.length === 0">
              <td :colspan="editable ? 7 : 6" class="text-center text-muted py-3">{{ t('customs.packages.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="invalid-feedback d-block mb-2" v-if="formError">{{ formError }}</div>

      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <span class="fs-12 text-muted">
          {{ t('customs.packages.total', { count: rows.length, weight: totalWeight }) }}
          <span class="badge bg-warning-transparent ms-2" v-if="editable && dirty">{{ t('customs.packages.unsaved') }}</span>
        </span>
        <div class="btn-list" v-if="editable">
          <button type="button" class="btn btn-sm btn-light" @click="addRow" :disabled="rows.length >= MAX_PACKAGES">
            <i class="ri-add-line me-1"></i>{{ t('customs.packages.add') }}
          </button>
          <button type="button" class="btn btn-sm btn-primary" @click="save" :disabled="saving || !dirty">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-save-line me-1"></i>{{ t('customs.packages.save') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
