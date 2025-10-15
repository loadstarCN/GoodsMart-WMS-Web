import { resolve } from "node:path"
// https://nuxt.com/docs/api/configuration/nuxt-confi
/*
 Make sure to rename the " /nuxt/preview/ynex " to the subdirectory where you are gonana upload the project. If you are uploading it in root then chang the /nuxt/preview/ynex to '/' or remove.
*/
export default defineNuxtConfig({
  
  future: {
    compatibilityVersion: 4,
  },

  devServer: {
    port: 3000
  },
  nitro: {
    devProxy: {
      '/api': {
        target: process.env.API_BASE_URL || 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    },
    
  },
  
 telemetry: false,

 alias:{
   assets : "/<rootDir>/assets",
   cookie: resolve(__dirname, "node_modules/cookie")
 },

 modules: [
   '@nuxt/image',
   '@pinia/nuxt', 
   '@nuxtjs/i18n',
 ],

 // Used to add the base path of url Example : https://www.spruko.com/ynex-nuxt
 app: {
   baseURL: '', // Replace with your desired base path
  //  baseURL: '/nuxt', // Replace with your desired base path
   head: {
     link: [{ rel: 'icon', type: 'image/x-icon', href: "/nuxt/ynex/preview/favicon.ico" }]
 },
 },

 ssr : false,

 build : {
   transpile : ["vuetify", 'vue-countup-v3']
 },

 devtools: { enabled: true },

 imports: {
    dirs: [
      'types/**/*.ts',       // 自动导入全局类型
      'stores/**/*.types.ts' // 自动导入模块类型
    ]
  },

 components: {
    dirs: [
      {
        path: "~/components",
        pathPrefix: false, 
      }
    ]
  },
 plugins: [
    { src: "@/plugins/plugins.ts", mode: "client" },
  ],


 css : [
   '@mdi/font/css/materialdesignicons.css',
   'vuetify/styles/main.sass',
   '@/assets/css/icons.css',
   '@/assets/css/bootstrap.css',
   '@/assets/css/styles.css',
 ],

 vite: {
   optimizeDeps: {
     include: [],
     exclude: []
   },
   define: {
     // 'import.meta.env.BASE_URL': JSON.stringify('/nuxt/ynex/preview/'),
   },
 },

  i18n: {
    lazy: true,
    langDir: 'locales', 
    locales: [      
      { code: 'en', iso: 'en-US', name: 'English', file: 'en-US.json' },
      { code: 'zh', iso: 'zh-CN', name: '中文', file: 'zh-CN.json' },
      { code: 'ja', iso: 'ja-JP', name: '日本語', file: 'ja-JP.json' },   
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix', // 路由策略
    compilation: {
      escapeHtml: false, // 允许HTML标签渲染
      strictMessage: false // 关闭严格模式警告
    },
    detectBrowserLanguage: {
      useCookie: true,      // 启用 Cookie 存储
      cookieKey: 'i18n_lang', // 自定义 Cookie 键名
      redirectOn: 'root'    // 仅在根路径检测语言
    },
    bundle: {
      optimizeTranslationDirective: false // 关闭警告
    },
  },

  runtimeConfig: {
    // 私有配置（仅服务端可见）
    public: {
      apiBase: process.env.API_BASE_URL || 'http://127.0.0.1:5000',
      clientEncryptionKey: process.env.NUXT_PUBLIC_ENCRYPTION_KEY || 'default_dev_key',
    }
  },

 compatibilityDate: '2024-11-07'
})