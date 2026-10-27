<script setup lang="ts">
/**
 * 卡片：白底、1px 描边、圆角 10、轻阴影；内边距随密度（舒适 24 / 紧凑 16）。
 * - title：区块标题 16 / 24（headingLevel 默认 h2）；右侧操作放 #actions；标题旁灰字放 subtitle
 * - flush：内容贴边（放表格时），标题区自带内边距和下分隔线
 * - divided：标题区与内容之间画分隔线
 */
const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  headingLevel?: 2 | 3 | 4
  flush?: boolean
  divided?: boolean
}>(), {
  headingLevel: 2,
  flush: false,
  divided: false,
})

const slots = useSlots()
const uid = useId()
const titleId = `${uid}-title`
const hasHeader = computed(() => !!(props.title || slots.header || slots.actions))
</script>

<template>
  <section class="w-card" :class="{ 'is-flush': flush, 'is-divided': divided || flush }"
    :aria-labelledby="title ? titleId : undefined">
    <header v-if="hasHeader" class="w-card__header">
      <slot name="header">
        <div class="w-card__heading">
          <component :is="`h${headingLevel}`" v-if="title" :id="titleId" class="w-card__title">{{ title }}</component>
          <span v-if="subtitle" class="w-card__subtitle">{{ subtitle }}</span>
        </div>
      </slot>
      <div v-if="$slots.actions" class="w-card__actions"><slot name="actions" /></div>
    </header>
    <div class="w-card__body"><slot /></div>
    <footer v-if="$slots.footer" class="w-card__footer"><slot name="footer" /></footer>
  </section>
</template>

<style scoped>
.w-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
  box-shadow: var(--w-shadow-card);
  color: var(--w-text-1);
  font-family: var(--w-font);
}
.w-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--w-sp-12);
  padding: var(--w-card-pad) var(--w-card-pad) 0;
}
.w-card.is-divided .w-card__header {
  padding-bottom: var(--w-sp-16);
  border-bottom: 1px solid var(--w-line);
}
.w-card__heading {
  display: flex;
  align-items: baseline;
  gap: var(--w-sp-12);
  min-width: 0;
}
.w-card__title {
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-card__subtitle {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-card__actions {
  display: flex;
  align-items: center;
  gap: var(--w-sp-8);
  flex: none;
}
.w-card__body {
  padding: var(--w-card-pad);
  min-width: 0;
}
.w-card__header + .w-card__body { padding-top: var(--w-sp-16); }
.w-card.is-flush .w-card__body { padding: 0; }
.w-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--w-sp-8);
  padding: var(--w-sp-16) var(--w-card-pad);
  border-top: 1px solid var(--w-line);
}
@media print { .w-card { box-shadow: none; } }
</style>
