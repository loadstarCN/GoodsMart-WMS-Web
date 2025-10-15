<template>
  <div class="container">
    <svg :viewBox="viewBox" xmlns="http://www.w3.org/2000/svg">

      <!-- 可见面填充 -->
      <path 
        v-for="(face, index) in visibleFaces" 
        :key="'face-'+index"
        :d="face.path"
        :fill="usageColor"
        fill-opacity="0.3"
        stroke="none"
        v-if="showUsage"
      />


      <!-- 立方体线框 -->
      <path 
        v-for="(edge, index) in edges" 
        :key="index"
        :d="`M ${edge.points[0].x} ${edge.points[0].y} L ${edge.points[1].x} ${edge.points[1].y}`"
        :stroke-dasharray="edge.dashed ? '2,2' : '0'"
        stroke="#333" 
        fill="none"
      />

      <!-- 尺寸标注 -->
      <text 
        v-for="(label, index) in labels" 
        :key="'label-'+index"
        :x="label.x"
        :y="label.y"
        class="label"
        :transform="`rotate(${label.angle}, ${label.x}, ${label.y})`"
      >
        {{ label.text }}
      </text>
      
      <!-- 容积标注 -->
      <text :x="capacityX" :y="capacityY" class="label capacity">
        Capacity: {{ formattedCapacity }}m³
        <tspan v-if="showUsage">({{ usagePercentage }}% Used)</tspan>
      </text>
    </svg>
  </div>
</template>

<script>
export default {
  props: {
    depth: { type: Number, default: 1.0 },
    width: { type: Number, default: 1.0 },
    height: { type: Number, default: 1.0 },
    capacity: { type: Number, required: true },
    usagePercentage: {
      type: Number,
      default: null,
      validator: value => value === null || (value >= 0 && value <= 100)
    }
  },
  computed: {
    // 新增归一化计算
    normalizedDimensions() {
      const maxDimension = Math.max(this.depth, this.width, this.height, 1)
      const scaleFactor = 100 / maxDimension
      return {
        depth: this.depth * scaleFactor,
        width: this.width * scaleFactor,
        height: this.height * scaleFactor
      }
    },
    formattedDepth() {
      return this.depth.toFixed(2)
    },
    formattedWidth() {
      return this.width.toFixed(2)
    },
    formattedHeight() {
      return this.height.toFixed(2)
    },

    // 新增容量使用颜色计算
    usageColor() {
      if (this.usagePercentage <= 33) return '#4CAF50' // 绿色
      if (this.usagePercentage <= 66) return '#FFC107' // 黄色
      return '#F44336' // 红色
    },

    // 新增使用率显示判断
    showUsage() {
      return this.usagePercentage !== null && this.usagePercentage > 0
    },

    // 修改后的可见面计算
    visibleFaces() {
      const v = this.vertices
      return [
        { // 前面（左侧面）
          path: `M ${v[7].x} ${v[7].y} L ${v[3].x} ${v[3].y} L ${v[2].x} ${v[2].y} L ${v[6].x} ${v[6].y} Z`
        },
        { // 顶面
          path: `M ${v[4].x} ${v[4].y} L ${v[5].x} ${v[5].y} L ${v[6].x} ${v[6].y} L ${v[7].x} ${v[7].y} Z`
        },
        { // 右侧面
          path: `M ${v[1].x} ${v[1].y} L ${v[5].x} ${v[5].y} L ${v[6].x} ${v[6].y} L ${v[2].x} ${v[2].y} Z`
        }
      ]
    },


    // 修改容积标注显示逻辑
    formattedCapacity() {
      return this.capacity.toFixed(2)
    },
    projection() {
      return (x, y, z) => ({
        x: x-y,
        y: -z + (x + y)/2
      })
    },
    vertices() {
      const { depth, width, height } = this.normalizedDimensions
      return [
        this.projection(0, 0, 0),
        this.projection(depth, 0, 0),
        this.projection(depth, width, 0),
        this.projection(0, width, 0),
        this.projection(0, 0, height),
        this.projection(depth, 0, height),
        this.projection(depth, width, height),
        this.projection(0, width, height)
      ]
    },
    edges() {
      return [
        { points: [this.vertices[0], this.vertices[1]], dashed: true },
        { points: [this.vertices[1], this.vertices[2]], dashed: false },
        { points: [this.vertices[2], this.vertices[3]], dashed: false },
        { points: [this.vertices[3], this.vertices[0]], dashed: true },
        { points: [this.vertices[4], this.vertices[5]], dashed: false },
        { points: [this.vertices[5], this.vertices[6]], dashed: false },
        { points: [this.vertices[6], this.vertices[7]], dashed: false },
        { points: [this.vertices[7], this.vertices[4]], dashed: false },
        { points: [this.vertices[0], this.vertices[4]], dashed: true },
        { points: [this.vertices[1], this.vertices[5]], dashed: false },
        { points: [this.vertices[2], this.vertices[6]], dashed: false },
        { points: [this.vertices[3], this.vertices[7]], dashed: false }
      ]
    },
    labels() {
      return [
        {
          text: `Depth: ${this.formattedDepth}cm`,
          ...this.calcLabelPosition(3, 2, -10)
        },
        {
          text: `Width: ${this.formattedWidth}cm`,
          ...this.calcLabelPosition(2, 1, -10)
        },
        {
          text: `Height: ${this.formattedHeight}cm`,
          ...this.calcLabelPosition(1, 5, -10, true)
        }
      ]
    },
    // 修改后的容积标注位置
    capacityX() {
      const vb = this.viewBox.split(' ')
      return parseFloat(vb[0]) + parseFloat(vb[2])/2
    },
    capacityY() {
      const vb = this.viewBox.split(' ')
      return parseFloat(vb[1]) + parseFloat(vb[3]) - 20
    },
    viewBox() {
      const padding = 50
      const minX = Math.min(...this.vertices.map(v => v.x)) - padding
      const minY = Math.min(...this.vertices.map(v => v.y)) - padding
      const maxX = Math.max(...this.vertices.map(v => v.x)) + padding
      const maxY = Math.max(...this.vertices.map(v => v.y)) + padding
      return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
    }
  },
  methods: {
    calcLabelPosition(v1, v2, offset = 0, vertical = false) {
      const p1 = this.vertices[v1]
      const p2 = this.vertices[v2]
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const angle = Math.atan2(dy, dx) * 180 / Math.PI
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      
      const rad = angle * Math.PI / 180
      const offsetX = vertical ? -offset : offset * Math.sin(rad)
      const offsetY = vertical ? offset : -offset * Math.cos(rad)

      return {
        x: midX + offsetX,
        y: midY + offsetY,
        angle: angle
      }
    }
  }
}
</script>

<style>
.container {
  width: 100%;
  /* max-width: 800px; */
}

.label {
  font: 10px Arial;
  fill: #666;
  dominant-baseline: middle;
  text-anchor: middle;
}

.capacity {
  text-anchor: middle; /* 确保文字居中 */
  font-size: 10px;
  fill: #333;
}


</style>