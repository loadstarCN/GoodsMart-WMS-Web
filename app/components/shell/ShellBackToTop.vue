<script setup lang="ts">
/**
 * 回到顶部（沿用原来外壳 common/BackToTop 的功能）：页面往下滚过一屏左右时出现在右下角，点了回到页面顶部。
 * 设计稿没有画它；用浮层的描边 + 阴影，不抢内容的注意力。打印时不显示。
 */
const { t } = useI18n()
const visible = ref(false)
const THRESHOLD = 400

const onScroll = () => { visible.value = window.scrollY > THRESHOLD }
const toTop = () => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  // 焦点回到内容区开头，键盘用户接着从页面顶部往下走
  document.getElementById('w-main')?.focus({ preventScroll: true })
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <Transition name="w-top-btn">
    <button v-if="visible" type="button" class="w-top-btn" :aria-label="t('shell.back-to-top')" :title="t('shell.back-to-top')"
      @click="toTop">
      <WIcon name="chevron-up" :size="18" :stroke-width="2" />
    </button>
  </Transition>
</template>

<style scoped>
.w-top-btn {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: var(--w-z-sticky);
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-pill);
  background: var(--w-raised);
  box-shadow: var(--w-shadow-raised);
  color: var(--w-text-2);
  cursor: pointer;
}
.w-top-btn:hover { color: var(--w-text-1); background: var(--w-surface-2); }
.w-top-btn:focus-visible { outline: none; border-color: var(--w-sel); box-shadow: var(--w-focus-ring); }
.w-top-btn-enter-active,
.w-top-btn-leave-active { transition: opacity 0.15s ease; }
.w-top-btn-enter-from,
.w-top-btn-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .w-top-btn-enter-active, .w-top-btn-leave-active { transition: none; }
}
@media print {
  .w-top-btn { display: none; }
}
</style>
