<template >
  <a class="me-0" 
     href="javascript:void(0)" 
     data-bs-toggle="tooltip" 
     data-bs-placement="top" 
     :title="title" 
     :data-bs-original-title="originalTitle" :key="`tooltip-${$i18n.locale}`">
    <svg xmlns="http://www.w3.org/2000/svg"
         :class="svgClass"
         :height="height"
         :width="width"
         :viewBox="viewBox"
         :fill="color">
      <path d="M0 0h24v24H0V0z" fill="none" />
      <path :d="pathData" />
    </svg>
  </a>
</template>

<script>
export default {
  props: {
    title: { type: String, default: '' },         // Tooltip提示内容
    originalTitle: { type: String, default: 'DN' },// 默认标题
    width: { type: [String, Number], default: 18 },// 图标宽度
    height: { type: [String, Number], default: 18 },// 图标高度
    color: { type: String, default: '#000000' },   // 填充颜色
    svgClass: { type: String, default: 'svg-primary' },// 自定义类名
    viewBox: { type: String, default: '0 0 24 24' },// SVG视窗
    pathData: {                                    // 图标路径数据
      type: String,
      default: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z'
    }
  }
}
</script>