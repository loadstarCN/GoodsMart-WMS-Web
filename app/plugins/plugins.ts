
// 旧页面用到的全局组件 / 指令（模板原来还注册了 Vuetify、EasyDataTable、颜色选择器、PerfectScrollbar 等，
// 业务页面都没用到，已去掉；依赖包本身还在 package.json 里，待统一清理）
import VueApexCharts from "../components/UI/apexcharts.vue";
import "vue-multiselect/dist/vue-multiselect.css";
import AppMultiselect from '~/components/UI/AppMultiselect.vue';
import { vMaska } from 'maska/vue';
import Datepicker from "@vuepic/vue-datepicker";
import '@vuepic/vue-datepicker/dist/main.css';

export default defineNuxtPlugin((nuxt) => {
  nuxt.vueApp.directive('maska', vMaska);
  nuxt.vueApp.component("apexchart", VueApexCharts);
  nuxt.vueApp.component("Datepicker", Datepicker);
  nuxt.vueApp.component("VueMultiselect", AppMultiselect);
});
