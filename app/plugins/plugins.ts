
import { createVuetify } from "vuetify";
import { VTooltip, VBtn, VOverlay } from "vuetify/components";
import { Ripple } from "vuetify/directives";
import Vue3EasyDataTable from 'vue3-easy-data-table';
import 'vue3-easy-data-table/dist/style.css';
import VueApexCharts from "../components/UI/apexcharts.vue";
import { PerfectScrollbarPlugin } from 'vue3-perfect-scrollbar';
import 'vue3-perfect-scrollbar/style.css';
import { Tooltip, Popover } from "bootstrap/dist/js/bootstrap.js";
import Vue3ColorPicker from "vue3-colorpicker";
import "vue3-colorpicker/style.css";
import "vue-multiselect/dist/vue-multiselect.css";
import AppMultiselect from '~/components/UI/AppMultiselect.vue';
import { vMaska } from 'maska/vue';
import Datepicker from "@vuepic/vue-datepicker";
import '@vuepic/vue-datepicker/dist/main.css';

export default defineNuxtPlugin((nuxt) => {
  const vuetify = createVuetify({
    ssr: false,
    components: { VTooltip, VBtn, VOverlay },
    directives: { Ripple },
    theme: {
      themes: {
        colors: {

        }
      }
    }
  });
  nuxt.vueApp.use(vuetify);
  nuxt.vueApp.component("EasyDataTable", Vue3EasyDataTable);
  nuxt.vueApp.use(Vue3ColorPicker);
  nuxt.vueApp.directive('maska', vMaska);
  nuxt.vueApp.use(PerfectScrollbarPlugin);
  nuxt.vueApp.component("apexchart", VueApexCharts);
  nuxt.vueApp.component("Datepicker", Datepicker);
  nuxt.vueApp.component("VueMultiselect", AppMultiselect);
  nuxt.vueApp.provide("Popover", Popover);
  nuxt.vueApp.provide("Tooltip", Tooltip);
});
