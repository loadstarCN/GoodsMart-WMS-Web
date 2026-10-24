<script lang="ts" setup>
/**
 * 承运商文件导出被拒（409 16137）时的逐行问题：有问题的行整批不导出，列出每张 DN 哪一列有什么问题
 * （必填为空、超长、编码不了的字符……），改好后再导出。问题码有三语文案时用文案（后端原文在悬停提示里），否则显示后端原文；
 * 模板逐列的问题另显示这一列渲染出来的文字（value），对照着改（收件地址在出库单详情的「改收件地址」里改）。
 */
import type { ExportProblem, ExportProblemRow } from '~/composables/shipping/carrierFile'

const props = withDefaults(defineProps<{
  rows: ExportProblemRow[]
  /** 可以关掉（发货流程里）：emit close */
  closable?: boolean
}>(), {
  closable: false,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t, te } = useI18n()

/** 一行一个问题（同一张 DN 的多个问题合并单元格显示） */
const lines = computed(() => props.rows.flatMap((row: ExportProblemRow) => {
  const problems = row.problems.length ? row.problems : [{ column: null, code: null, message: null } as ExportProblem]
  return problems.map((p: ExportProblem, i: number) => ({ row, problem: p, first: i === 0, span: problems.length }))
}))

const problemText = (p: ExportProblem): string => {
  const code = String(p.code || '').toUpperCase().replace(/-/g, '_')
  const key = `shipping.file.problem-codes.${code}`
  if (!code || !te(key)) return p.message || p.code || '—'
  const unit = p.length_unit === 'sjis_bytes' ? t('shipping.file.units.sjis-bytes') : t('shipping.file.units.chars')
  return t(key, {
    column: p.column || '—',
    characters: (p.characters || []).join(' ') || '—',
    length: p.length ?? '—',
    max: p.max_length ?? '—',
    unit,
  })
}
</script>

<template>
  <div class="alert alert-danger-transparent fs-13 mb-0" role="alert">
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div class="fw-semibold">
        <i class="ri-error-warning-line me-1"></i>{{ t('shipping.file.export-problems', { count: rows.length }) }}
      </div>
      <button type="button" class="btn-close btn-sm" :aria-label="t('button.close')" v-if="closable" @click="emit('close')"></button>
    </div>
    <p class="fs-12 mb-2 mt-1">{{ t('shipping.file.export-problems-hint') }}</p>
    <div class="table-responsive export-problems-table">
      <table class="table table-sm table-bordered mb-0 fs-12">
        <thead>
          <tr>
            <th scope="col">{{ t('shipping.file.fields.dn') }}</th>
            <th scope="col">{{ t('shipping.file.fields.order-number') }}</th>
            <th scope="col">{{ t('shipping.file.fields.column') }}</th>
            <th scope="col">{{ t('shipping.file.fields.problem') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, i) in lines" :key="`ep-${i}`">
            <template v-if="line.first">
              <td :rowspan="line.span" class="text-nowrap">
                <NuxtLink :to="`/dn/detail/${line.row.dn_id}`" v-if="line.row.dn_id">DN-{{ line.row.dn_id }}</NuxtLink>
                <span v-else>—</span>
              </td>
              <td :rowspan="line.span" class="text-nowrap">{{ line.row.order_number || '—' }}</td>
            </template>
            <td>
              {{ line.problem.column || '—' }}
              <span class="text-muted" v-if="line.problem.column_index">#{{ line.problem.column_index }}</span>
            </td>
            <!-- 后端原文（英文）放在悬停提示里 -->
            <td class="text-wrap" :title="line.problem.message || ''">
              {{ problemText(line.problem) }}
              <div class="fs-11 text-muted text-break" v-if="line.problem.value">{{ line.problem.value }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.export-problems-table {
  max-height: 20rem;
  overflow-y: auto;
}
</style>
