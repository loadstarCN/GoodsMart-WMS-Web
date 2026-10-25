<script lang="ts" setup>
/**
 * 承运商文件导出被拒（409 16137）时的逐行问题：有问题的行整批不导出，列出每张 DN 哪一列有什么问题
 * （必填为空、超长、编码不了的字符……），改好后再导出。问题码有三语文案时用文案（后端原文在悬停提示里），否则显示后端原文；
 * 模板逐列的问题另显示这一列渲染出来的文字（value），对照着改（收件地址在发货单详情的「修改收件地址」里改）。
 * 阻断提示（浅红底）+ 表格；closable 时右上角可关。
 */
import type { ExportProblem, ExportProblemRow } from '~/composables/shipping/carrierFile'

const props = withDefaults(defineProps<{
  rows: ExportProblemRow[]
  /** 可以关掉：emit close */
  closable?: boolean
}>(), {
  closable: false,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t, te } = useI18n()

/** 一行一个问题（同一张 DN 的多个问题只在第一行写单号） */
const lines = computed(() => props.rows.flatMap((row: ExportProblemRow) => {
  const problems = row.problems.length ? row.problems : [{ column: null, code: null, message: null } as ExportProblem]
  return problems.map((p: ExportProblem, i: number) => ({ row, problem: p, first: i === 0 }))
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
  <div class="w-exp">
    <WAlert tone="block" :title="t('shipping.file.export-problems', { count: rows.length })" :dismissible="closable"
      @close="emit('close')">
      {{ t('shipping.file.export-problems-hint') }}
    </WAlert>
    <div class="w-exp__table">
      <table class="w-exp__grid">
        <thead>
          <tr>
            <th scope="col">{{ t('shipping.file.fields.dn') }}</th>
            <th scope="col">{{ t('shipping.file.fields.order-number') }}</th>
            <th scope="col">{{ t('shipping.file.fields.column') }}</th>
            <th scope="col">{{ t('shipping.file.fields.problem') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, i) in lines" :key="`ep-${i}`" :class="{ 'is-first': line.first }">
            <td class="w-exp__nowrap">
              <template v-if="line.first">
                <NuxtLink v-if="line.row.dn_id" :to="`/dn/detail/${line.row.dn_id}`" class="w-exp__link">DN-{{ line.row.dn_id }}</NuxtLink>
              </template>
            </td>
            <td class="w-exp__nowrap w-muted">{{ line.first ? (line.row.order_number || '') : '' }}</td>
            <td>
              {{ line.problem.column || '' }}
              <span v-if="line.problem.column_index" class="w-faint">#{{ line.problem.column_index }}</span>
            </td>
            <!-- 后端原文（英文）放在悬停提示里 -->
            <td :title="line.problem.message || ''">
              {{ problemText(line.problem) }}
              <span v-if="line.problem.value" class="w-exp__value">{{ line.problem.value }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.w-exp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--w-font);
}
.w-exp__table {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
}
.w-exp__grid {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
}
.w-exp__grid th {
  position: sticky;
  top: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--w-border);
  background: var(--w-surface);
  color: var(--w-text-3);
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  text-align: left;
}
.w-exp__grid td {
  padding: 8px 12px;
  vertical-align: top;
  color: var(--w-text-1);
}
.w-exp__grid tr.is-first td { border-top: 1px solid var(--w-line); }
.w-exp__grid tbody tr:first-child td { border-top: 0; }
.w-exp__nowrap { white-space: nowrap; }
.w-exp__link { font-weight: var(--w-fw-semibold); color: var(--w-link); text-decoration: none; }
.w-exp__link:hover { color: var(--w-link-hover); }
.w-exp__value {
  display: block;
  margin-top: 2px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
  overflow-wrap: anywhere;
}
</style>
