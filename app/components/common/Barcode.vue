<template><svg ref="element" class="barcode" :id="id ? `barcode-${id}` : undefined" role="img" :aria-label="value" /></template>
<script setup>
import JsBarcode from 'jsbarcode'
const props=defineProps({value:{type:String,required:true},id:{type:String,default:''},options:{type:Object,default:()=>({})}})
const element=ref(null)
const render=()=>{if(!element.value)return;element.value.replaceChildren();if(!props.value)return;JsBarcode(element.value,props.value,{format:'CODE128',width:2,height:40,displayValue:true,fontSize:14,textMargin:4,lineColor:'#000',background:'#fff',margin:10,font:'Helvetica',fontOptions:'normal',textPosition:'bottom',textAlign:'center',flat:false,...props.options})}
onMounted(render)
watch(()=>[props.value,props.options],render,{deep:true,flush:'post'})
</script>
