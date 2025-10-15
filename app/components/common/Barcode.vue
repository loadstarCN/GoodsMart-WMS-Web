<template>
  <svg class="barcode" :id="`barcode-${id}`"></svg>
</template>

<script setup>
import JsBarcode from 'jsbarcode'

const props = defineProps({
  value: { type: String, required: true },  // 必传参数，条形码数据
  id: { type: String, default: 'default' },  // 唯一标识（循环生成时必传）
  options: { type: Object, default: () => ({}) }  // 配置项
})

onMounted(() => {
  JsBarcode(`#barcode-${props.id}`, props.value, {
    format: 'CODE128',     // 条形码类型（默认CODE128）
    width: 2,             // 条宽度
    height: 40,           // 条高度
    displayValue: true,   // 显示文本
    fontSize: 14,        // 文本大小
    textMargin: 4,      // 文本与条形码的间距
    lineColor: '#000',    // 条颜色
    background: '#fff',   // 背景颜色
    margin: 10,           // 条形码与边框的间距
    font: "Helvetica", //设置条形码下方显示的文本字体类型。
    fontOptions: "normal", //控制文本的粗体或斜体样式。"bold"（粗体）、"italic"（斜体）、"bold italic"（粗斜体）
    textPosition: "bottom", // 文本位置 "bottom"（默认，文本在条形码下方）、"top"（文本在条形码上方）
    textAlign: "center", //设置条形码文本的水平对齐方式。"left"（左对齐）、"center"（居中，默认）、"right"（右对齐）
    flat: false, //仅适用于 EAN-8/EAN-13 格式，控制是否将条形码压缩为单行显示。
    ...props.options      // 合并自定义配置
  })
})
</script>