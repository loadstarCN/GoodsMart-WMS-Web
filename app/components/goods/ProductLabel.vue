<script setup lang="ts">
import { referenceGoodsBarcode } from '~/utils/referenceGoodsBarcode'
const props = withDefaults(defineProps<{name:string;code:string;lot?:string;expiry?:string;width?:number;height?:number;nameFontPt?:number;nameFamily?:string;showName?:boolean;qr?:string;margin?:number}>(),{width:50,height:30,showName:true})
const {t,locale}=useI18n()
const emit=defineEmits<{fit:[value:boolean]}>()
const artboard=ref<HTMLElement|null>(null)
let observer:ResizeObserver|undefined, disposed=false
const measure=()=>{
  const el=artboard.value
  if(!el||disposed)return
  const bounds=el.getBoundingClientRect()
  const fits=[...el.querySelectorAll<HTMLElement>('svg,.digits,.ean,.qr-block img,footer,footer>span')].every(child=>{
    const rect=child.getBoundingClientRect()
    return rect.left>=bounds.left-1&&rect.right<=bounds.right+1&&rect.bottom<=bounds.bottom+1
  })
  emit('fit',fits)
}
watch(()=>({...props,locale:locale.value}),async()=>{emit('fit',false);await nextTick();measure()},{flush:'post'})
onMounted(async()=>{observer=new ResizeObserver(measure);if(artboard.value)observer.observe(artboard.value);await document.fonts.ready;measure()})
onBeforeUnmount(()=>{disposed=true;observer?.disconnect()})
// Original artboard: 378 × 227 px at 2×. Scale the design, not the remaining whitespace.
const scale=computed(()=>Math.min(props.width*96/25.4/378,props.height*96/25.4/227))
const artStyle=computed(()=>({width:props.width*96/25.4/scale.value+'px',height:props.height*96/25.4/scale.value+'px',transform:`scale(${scale.value})`,...(props.margin==null?{}:{padding:props.margin*96/25.4/scale.value+'px'})}))
const nameStyle=computed(()=>({fontFamily:props.nameFamily||'"Noto Sans JP", Inter, sans-serif',...(props.nameFontPt==null?{}:{fontSize:props.nameFontPt*96/72/scale.value+'px'})}))
const barcode=computed<any>(()=>props.qr?null:referenceGoodsBarcode(props.code))
</script>
<template>
  <section class="w-product-label" :style="{width:width+'mm',height:height+'mm'}" :aria-label="name+' '+code">
    <div ref="artboard" class="artboard" :style="artStyle">
      <span v-if="showName" class="product-name" :style="nameStyle">{{name}}</span>
      <div v-if="qr" class="qr-block"><img :src="qr" :alt="'QR '+code"/><span class="digits">{{code}}</span></div>
      <div v-else-if="barcode.format==='CODE128'" class="code128">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" :aria-label="'Code 128 '+code" :style="{width:barcode.w,height:barcode.h}"><path :d="barcode.d" fill="#151923"/></svg>
        <span class="digits">{{code}}</span>
      </div>
      <div v-else class="ean" :style="{width:barcode.w}">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" :aria-label="'EAN-13 '+code" :style="{width:barcode.w}"><path :d="barcode.d" fill="#151923"/></svg>
        <span class="first" :style="{width:barcode.qL}">{{barcode.first}}</span>
        <span class="group" :style="{left:barcode.lL,width:barcode.gW}">{{barcode.left}}</span>
        <span class="group" :style="{left:barcode.rL,width:barcode.gW}">{{barcode.right}}</span>
      </div>
      <footer v-if="lot"><span><small>{{t('goods-label.lot')}}</small>{{lot}}</span><span v-if="expiry"><small>{{t('goods-label.expiry')}}</small>{{expiry}}</span></footer>
    </div>
  </section>
</template>
<style scoped>
.w-product-label{position:relative;flex:none;overflow:hidden;background:#fff;border-radius:6px;color:#151923}
.artboard{position:absolute;top:0;left:0;box-sizing:border-box;transform-origin:top left;padding:14px 16px 12px;display:flex;flex-direction:column;font-family:Inter,'Noto Sans JP',sans-serif;line-height:1.2}
.product-name{font-size:16px;font-weight:700;line-height:1.22;height:44px;flex:none;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.code128{display:flex;flex-direction:column;align-items:center;margin-top:8px;flex:none}
svg{display:block;flex:none}.code128 svg{max-width:100%}
.digits{margin-top:2px;font-family:Inter,sans-serif;font-size:16px;font-weight:600;letter-spacing:.14em;font-variant-numeric:tabular-nums}
.ean{align-self:center;position:relative;height:86px;margin-top:10px;flex:none;font-family:Inter,sans-serif;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.ean svg{height:80px}.ean span{position:absolute;top:63px;text-align:center}.ean .first{left:0}.ean .group{letter-spacing:.32em;text-indent:.32em;background:#fff}
footer{margin-top:auto;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;padding-top:5px;border-top:2px solid #151923;font-variant-numeric:tabular-nums;gap:12px}
footer>span{font-size:16px;font-weight:800;max-width:100%;overflow-wrap:anywhere}footer small{font-size:12px;font-weight:700;margin-right:6px}
.qr-block{display:flex;flex-direction:column;align-items:center;margin-top:8px}.qr-block img{width:120px;height:120px}
@media print{.w-product-label{border-radius:0;break-inside:avoid;break-after:page}.w-product-label:last-child{break-after:auto}}
</style>
