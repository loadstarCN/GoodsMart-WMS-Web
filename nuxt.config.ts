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
    port: 3002
  },
  nitro: {
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
     link: [{ rel: 'icon', type: 'image/x-icon', href: "/favicon.ico" }]
 },
 },

 ssr : false,

 build : {
   transpile : ["vuetify"]
 },

 devtools: { enabled: process.env.NODE_ENV !== 'production' },

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
   '@/assets/css/icons.css',
   '@/assets/css/bootstrap.css',
   '@/assets/css/styles.css',
   // 设计令牌（v2A）→ 旧页面映射 → 新界面基础样式；顺序不能换（后者覆盖前者）
   '@/assets/styles/tokens.css',
   '@/assets/styles/legacy-bridge.css',
   '@/assets/styles/base.css',
 ],

 vite: {
   optimizeDeps: {
     include: [],
     exclude: []
   },
   define: {
     // 'import.meta.env.BASE_URL': JSON.stringify('/nuxt/ynex/preview/'),
   },
   build: {
     rollupOptions: {
       output: {
         manualChunks(id) {
           if (id.includes('vuetify')) return 'vuetify'
           if (id.includes('apexcharts') || id.includes('vue3-apexcharts')) return 'apexcharts'
           if (id.includes('sweetalert2')) return 'sweetalert2'
           if (id.includes('bootstrap/dist')) return 'bootstrap'
           if (id.includes('quill') || id.includes('tiptap') || id.includes('@vueup/vue-quill') || id.includes('element-tiptap')) return 'editor'
           if (id.includes('filepond')) return 'filepond'
         }
       }
     }
   }
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
      escapeHtml: true,
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
    // 私有配置（仅服务端可见）：后端地址只在 server/api 代理里使用，不暴露给浏览器
    apiBase: process.env.API_BASE_URL || 'http://127.0.0.1:5002',
    public: {
      clientEncryptionKey: process.env.NUXT_PUBLIC_ENCRYPTION_KEY || 'default_dev_key',
      // 品牌（开源部署可改）：产品名与 Logo。运行时可用环境变量覆盖，
      // 如 NUXT_PUBLIC_BRAND_PRODUCT_NAME、NUXT_PUBLIC_BRAND_LOGO_ON_DARK（路径或完整 URL）
      brand: {
        productName: 'GoodsMart WMS',
        logoOnDark: '/images/brand-logos/desktop-dark.svg',  // 白色版：侧栏、深色底
        logoOnLight: '/images/brand-logos/desktop-logo.svg', // 紫色版：浅色底（登录页、打印页）
        logoMark: '/images/brand-logos/toggle-dark.svg',     // 折叠图标：侧栏收起时
      },
    }
  },

 compatibilityDate: '2024-11-07'
})