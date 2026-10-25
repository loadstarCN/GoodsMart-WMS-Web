<script setup lang="ts">
/**
 * 描边标签：行内的属性型标记（批次 + 效期、临期、超允发期、无批号），不填底色。
 * 中性 = 灰描边灰字；有好坏含义时用语义色（描边用语义「描边」色，字用语义「字」色）。
 * 状态（运输中、已完成）不要用标签，用 WStatus。
 */
withDefaults(defineProps<{
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info'
}>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="w-tag" :class="`w-tag--${tone}`"><slot /></span>
</template>

<style scoped>
.w-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-control);
  color: var(--w-text-2);
  font-family: var(--w-font);
  font-size: var(--w-fs-12);
  line-height: 16px;
  font-weight: var(--w-fw-medium);
  white-space: nowrap;
  vertical-align: middle;
}
.w-tag--ok { border-color: var(--w-ok-border); color: var(--w-ok-text); }
.w-tag--warn { border-color: var(--w-warn-border); color: var(--w-warn-text); }
.w-tag--bad { border-color: var(--w-bad-border); color: var(--w-bad-text); }
.w-tag--info { border-color: var(--w-info-border); color: var(--w-info-text); }
</style>
