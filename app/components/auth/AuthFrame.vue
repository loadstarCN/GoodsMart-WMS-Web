<script setup lang="ts">
const {t,locale,setLocale}=useI18n()
const brand=useRuntimeConfig().public.brand
const languageCookie=useCookie('i18n_lang',{maxAge:2592000})
const changeLanguage=async(value:'zh'|'en'|'ja')=>{await setLocale(value);languageCookie.value=value}
</script>
<template><div class="w-auth w-scope"><section class="brand"><NuxtLink to="/auth/login"><img :src="brand.logoOnDark" :alt="brand.productName"/></NuxtLink><div class="brand-main"><svg viewBox="0 0 480 230" aria-hidden="true" style="width: 100%; height: auto">
        <rect x="0" y="214" width="480" height="2" rx="1" fill="#29293A"></rect>
        <rect x="14" y="14" width="6" height="200" rx="2" fill="#29293A"></rect>
        <rect x="214" y="14" width="6" height="200" rx="2" fill="#29293A"></rect>
        <rect x="260" y="14" width="6" height="200" rx="2" fill="#29293A"></rect>
        <rect x="460" y="14" width="6" height="200" rx="2" fill="#29293A"></rect>
        <rect x="14" y="74" width="206" height="6" rx="2" fill="#443A84"></rect>
        <rect x="100" y="83" width="34" height="12" rx="2" fill="#1A1B22"></rect>
        <text x="117" y="92" fill="#BFB9FE" font-size="8" font-family="ui-monospace, Consolas, monospace" text-anchor="middle">A-01-1</text>
        <rect x="14" y="144" width="206" height="6" rx="2" fill="#443A84"></rect>
        <rect x="100" y="153" width="34" height="12" rx="2" fill="#1A1B22"></rect>
        <text x="117" y="162" fill="#BFB9FE" font-size="8" font-family="ui-monospace, Consolas, monospace" text-anchor="middle">A-02-1</text>
        <rect x="260" y="74" width="206" height="6" rx="2" fill="#443A84"></rect>
        <rect x="346" y="83" width="34" height="12" rx="2" fill="#1A1B22"></rect>
        <text x="363" y="92" fill="#BFB9FE" font-size="8" font-family="ui-monospace, Consolas, monospace" text-anchor="middle">B-01-1</text>
        <rect x="260" y="144" width="206" height="6" rx="2" fill="#443A84"></rect>
        <rect x="346" y="153" width="34" height="12" rx="2" fill="#1A1B22"></rect>
        <text x="363" y="162" fill="#BFB9FE" font-size="8" font-family="ui-monospace, Consolas, monospace" text-anchor="middle">B-02-1</text>
        <rect x="32" y="34" width="52" height="40" rx="3" fill="#30295E"></rect>
        <rect x="40" y="42" width="24" height="3" rx="1.5" fill="#443A84"></rect>
        <rect x="90" y="44" width="40" height="30" rx="3" fill="#443A84"></rect>
        <rect x="98" y="52" width="12" height="3" rx="1.5" fill="#7855FE"></rect>
        <rect x="136" y="28" width="70" height="46" rx="3" fill="#29293A"></rect>
        <rect x="144" y="36" width="42" height="3" rx="1.5" fill="#443A84"></rect>
        <rect x="32" y="108" width="60" height="36" rx="3" fill="#7855FE"></rect>
        <rect x="40" y="116" width="32" height="3" rx="1.5" fill="#BFB9FE"></rect>
        <rect x="98" y="92" width="46" height="52" rx="3" fill="#30295E"></rect>
        <rect x="106" y="100" width="18" height="3" rx="1.5" fill="#443A84"></rect>
        <rect x="150" y="114" width="58" height="30" rx="3" fill="#443A84"></rect>
        <rect x="158" y="122" width="30" height="3" rx="1.5" fill="#7855FE"></rect>
        <rect x="32" y="170" width="84" height="44" rx="3" fill="#29293A"></rect>
        <rect x="40" y="178" width="56" height="3" rx="1.5" fill="#443A84"></rect>
        <rect x="124" y="156" width="76" height="58" rx="3" fill="#30295E"></rect>
        <rect x="132" y="164" width="48" height="3" rx="1.5" fill="#443A84"></rect>
        <rect x="278" y="32" width="64" height="42" rx="3" fill="#443A84"></rect>
        <rect x="286" y="40" width="36" height="3" rx="1.5" fill="#7855FE"></rect>
        <rect x="350" y="48" width="44" height="26" rx="3" fill="#7855FE"></rect>
        <rect x="358" y="56" width="16" height="3" rx="1.5" fill="#BFB9FE"></rect>
        <rect x="400" y="40" width="52" height="34" rx="3" fill="#30295E"></rect>
        <rect x="408" y="48" width="24" height="3" rx="1.5" fill="#443A84"></rect>
        <rect x="278" y="96" width="48" height="48" rx="3" fill="#29293A"></rect>
        <rect x="286" y="104" width="20" height="3" rx="1.5" fill="#443A84"></rect>
        <rect x="332" y="110" width="70" height="34" rx="3" fill="#443A84"></rect>
        <rect x="340" y="118" width="42" height="3" rx="1.5" fill="#7855FE"></rect>
        <rect x="278" y="174" width="58" height="40" rx="3" fill="#7855FE"></rect>
        <rect x="286" y="182" width="30" height="3" rx="1.5" fill="#BFB9FE"></rect>
        <rect x="344" y="152" width="52" height="62" rx="3" fill="#443A84"></rect>
        <rect x="352" y="160" width="24" height="3" rx="1.5" fill="#7855FE"></rect>
        <rect x="404" y="184" width="46" height="30" rx="3" fill="#29293A"></rect>
        <rect x="412" y="192" width="18" height="3" rx="1.5" fill="#443A84"></rect>
      </svg><div><h1>{{t('login.title')}}</h1><p>{{t('auth-design.subtitle')}}</p></div><ol><li v-for="key in ['ASN','sorting','putaway','picking','packing','delivery']" :key="key"><span>{{t(key==='putaway'?'asn.flow.steps.putaway':'nav.'+key)}}</span><WIcon name="chevron-right" :size="12"/></li></ol></div><footer>{{brand.productName}} <span>·</span> AGPL-3.0</footer></section><section class="content"><div class="languages" role="group" :aria-label="t('auth-design.language')"><button v-for="item in [{value:'zh',label:'中文'},{value:'en',label:'English'},{value:'ja',label:'日本語'}] as const" :key="item.value" type="button" :class="{active:locale===item.value}" :aria-pressed="locale===item.value" @click="changeLanguage(item.value)">{{item.label}}</button></div><div class="form"><slot/></div></section></div></template>
<style scoped>
.w-auth{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;background:#fff}.brand{background:#171729;color:#EDEEF4;padding:48px 56px 40px;display:flex;flex-direction:column;gap:24px;min-width:0}.brand>a{align-self:start}.brand img{height:28px;width:auto}.brand-main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;max-width:540px}.brand-main>svg{width:100%;height:auto}h1{font-size:28px;line-height:36px;font-weight:600;color:white;margin:0 0 8px}.brand p{font-size:16px;line-height:24px;color:#C5C6D2;margin:0}.brand ol{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}.brand li{display:flex;align-items:center;gap:6px}.brand li>span{white-space:nowrap;display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;background:#1A1B22;border:1px solid #29293A;font-size:13px;line-height:20px;font-weight:500}.brand li:last-child>.w-icon{display:none}.brand footer{display:flex;gap:12px;color:#9597A8;font-size:12px;line-height:18px}.content{padding:32px 56px 48px;display:flex;flex-direction:column;gap:24px;min-width:0}.languages{display:flex;align-self:flex-end;padding:2px;border-radius:6px;background:#EDEFF3}.languages button{height:28px;padding:0 12px;border:0;border-radius:6px;font:inherit;font-size:13px;line-height:20px;color:#4C5261;background:transparent}.languages button.active{background:white;box-shadow:0 1px 2px #10121b1a;color:#151923;font-weight:600}.form{width:100%;max-width:400px;margin:auto}.form :deep(form){display:flex;flex-direction:column;gap:16px}.form :deep(h2){margin:0 0 8px;font-size:24px;line-height:32px;font-weight:600}.form :deep(.w-input){--w-input-h:40px;height:40px}.form :deep(input){font-size:14px}.form :deep(button[type=submit]){height:40px}.form :deep(a){text-decoration:none;font-size:13px;font-weight:500;color:#5F1FE6}.form :deep(p){font-size:13px;line-height:20px;color:#656C7A;margin:0}@media(max-width:900px){.w-auth{grid-template-columns:minmax(0,1fr)}.brand{padding:24px}.brand-main, .brand footer{display:none}.content{padding:24px;min-height:calc(100vh - 76px)}.form{padding:32px 0}}
</style>
