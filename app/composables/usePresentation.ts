export const usePresentation = () => {
 const data=useState<any>('platform-presentation',()=>({brand:{},pda:{},notices:[]}))
 const defaults=useRuntimeConfig().public.brand
 const brand=computed<Record<string,any>>(()=>({...defaults,...Object.fromEntries(Object.entries(data.value.brand||{}).filter(([,value])=>!!value))}))
 const refresh=async()=>{try{data.value=await $fetch('/api/system/settings/presentation/public')}catch{/* Keep deployment defaults if unavailable. */}}
 return {data,brand,refresh}
}
