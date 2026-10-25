<script setup lang="ts">
/**
 * 状态：圆点 + 文字（默认）。语义：ok 已完成 / warn 需处理 / bad 异常 / info 进行中 / none 未开始。
 * - variant="dot"（默认）：表格、列表里的状态，文字用正文色（muted 时次要文字色）
 * - variant="text"：状态词本身用语义字色（如「跟踪异常」），每块卡片最多一处
 * - variant="pill"：单据标题旁的当前状态，浅底胶囊，每页只用一个
 * 圆点只是装饰（aria-hidden），意思由文字表达。
 */
withDefaults(defineProps<{
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'none'
  variant?: 'dot' | 'text' | 'pill'
  /** 文字用次要文字色（列表里状态不是主信息时） */
  muted?: boolean
}>(), {
  tone: 'none',
  variant: 'dot',
  muted: false,
})
</script>

<template>
  <span class="w-status" :class="[`w-status--${tone}`, `w-status--${variant}`, { 'is-muted': muted }]">
    <span class="w-status__dot" aria-hidden="true" />
    <span class="w-status__text"><slot /></span>
  </span>
</template>

<style scoped>
.w-status {
  --w-status-dot: var(--w-none-dot);
  --w-status-text: var(--w-text-2);
  --w-status-bg: var(--w-surface-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--w-font);
  white-space: nowrap;
  vertical-align: middle;
}
.w-status--ok { --w-status-dot: var(--w-ok-dot); --w-status-text: var(--w-ok-text); --w-status-bg: var(--w-ok-bg); }
.w-status--warn { --w-status-dot: var(--w-warn-dot); --w-status-text: var(--w-warn-text); --w-status-bg: var(--w-warn-bg); }
.w-status--bad { --w-status-dot: var(--w-bad-dot); --w-status-text: var(--w-bad-text); --w-status-bg: var(--w-bad-bg); }
.w-status--info { --w-status-dot: var(--w-info-dot); --w-status-text: var(--w-info-text); --w-status-bg: var(--w-info-bg); }

.w-status__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: var(--w-radius-pill);
  background: var(--w-status-dot);
}
.w-status.is-muted .w-status__text { color: var(--w-text-2); }

.w-status--text .w-status__text {
  color: var(--w-status-text);
  font-weight: var(--w-fw-medium);
}

.w-status--pill {
  height: 24px;
  padding: 0 10px;
  border-radius: var(--w-radius-pill);
  background: var(--w-status-bg);
  color: var(--w-status-text);
  font-size: var(--w-fs-13);
  line-height: 20px;
  font-weight: var(--w-fw-semibold);
}
.w-status--pill.w-status--none { color: var(--w-text-2); font-weight: var(--w-fw-medium); }
</style>
