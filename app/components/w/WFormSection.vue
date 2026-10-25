<script setup lang="ts">
/**
 * 表单分区（表单布局统一规则）：左侧分区标题列固定 200px（标题 + 可选「?」），右侧字段区（放 WFormGrid）。
 * 字段区占满剩余宽度、最大 960px、左对齐；窄屏（< 1024）时标题移到字段上方、字段单栏。
 * 一张表单卡片里的多个分区之间画分隔线；卡片本身占满内容区宽度，底部操作条与卡片同宽、右对齐（页面自己放）。
 */
withDefaults(defineProps<{
  title: string
  help?: string
  headingLevel?: 2 | 3
}>(), {
  headingLevel: 2,
})

const uid = useId()
const titleId = `${uid}-title`
</script>

<template>
  <section class="w-form-section" :aria-labelledby="titleId">
    <div class="w-form-section__head">
      <component :is="`h${headingLevel}`" :id="titleId" class="w-form-section__title">
        {{ title }}
        <WHelp v-if="help" :text="help" />
      </component>
      <div v-if="$slots.aside" class="w-form-section__aside"><slot name="aside" /></div>
    </div>
    <div class="w-form-section__body"><slot /></div>
  </section>
</template>

<style scoped>
.w-form-section {
  display: grid;
  grid-template-columns: var(--w-form-title-w) minmax(0, 1fr);
  gap: var(--w-sp-32);
  padding: var(--w-card-pad);
  font-family: var(--w-font);
}
.w-form-section + .w-form-section { border-top: 1px solid var(--w-line); }
.w-form-section__head {
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-4);
  min-width: 0;
}
.w-form-section__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-form-section__aside {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-form-section__body {
  min-width: 0;
  max-width: var(--w-form-max);
}
@media (max-width: 1023.98px) {
  .w-form-section {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--w-sp-16);
  }
}
</style>
