<script setup lang="ts">
/**
 * 字段区的 12 栏网格：字段按内容长短取宽——长文本（名称、地址、说明、URL）12 栏；成对的短字段（电话 / 邮箱、
 * 宽 / 深 / 高）各 6 或 4 栏；数字、日期、单位类 3–4 栏。宽度用 WField 的 span，或在任意子元素上加 w-span-N。
 * 不用固定像素宽的输入框。窄屏（< 1024）时一律单栏。
 */
</script>

<template>
  <div class="w-form-grid"><slot /></div>
</template>

<style>
/* 不加 scoped：w-span-N 要能用在任意子元素（WField 的根元素、自定义块）上 */
.w-form-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--w-sp-16);
  align-items: start;
}
.w-form-grid > * { grid-column: span 12; min-width: 0; }
.w-form-grid > .w-span-1 { grid-column: span 1; }
.w-form-grid > .w-span-2 { grid-column: span 2; }
.w-form-grid > .w-span-3 { grid-column: span 3; }
.w-form-grid > .w-span-4 { grid-column: span 4; }
.w-form-grid > .w-span-5 { grid-column: span 5; }
.w-form-grid > .w-span-6 { grid-column: span 6; }
.w-form-grid > .w-span-7 { grid-column: span 7; }
.w-form-grid > .w-span-8 { grid-column: span 8; }
.w-form-grid > .w-span-9 { grid-column: span 9; }
.w-form-grid > .w-span-10 { grid-column: span 10; }
.w-form-grid > .w-span-11 { grid-column: span 11; }
.w-form-grid > .w-span-12 { grid-column: span 12; }
@media (max-width: 1023.98px) {
  .w-form-grid > [class*="w-span-"] { grid-column: 1 / -1; }
}
</style>
