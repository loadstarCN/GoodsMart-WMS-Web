<template>
  <div>
    <Helmet>
      <html :dir="local_variable.dir" :data-theme-mode="local_variable.dataThemeMode"
        :data-menu-position="local_variable.dataMenuPosition" :data-nav-layout="local_variable.dataNavLayout"
        :data-nav-style="local_variable.dataNavStyle" :data-toggled="local_variable.toggled" :style="customStyles">

      </html>
    </Helmet>

    <div class="switcher-backdrop" v-if="showBackdrop" @click="Switcherclose"></div>

    <div class="offcanvas offcanvas-end" tabindex="-1" id="switcher-canvas" aria-labelledby="offcanvasRightLabel">
      <div class="offcanvas-header border-bottom">
        <h5 class="offcanvas-title" id="offcanvasRightLabel">Switcher</h5>
        <button @click="Switcherclose" type="button" class="btn-close" aria-label="Close"></button>
      </div>

      <div class="offcanvas-body">
        <div>
          <p class="switcher-style-head">Theme Color Mode:</p>
          <div class="row switcher-style">
            <div class="col-4">
              <div class="form-check switch-select">
                <label class="form-check-label" for="switcher-light-theme">Light</label>
                <input type="radio" class="form-check-input" id="switcher-light-theme" v-model="themeMode" value="light"
                  @change="setLightMode" />
              </div>
            </div>
            <div class="col-4">
              <div class="form-check switch-select">
                <label class="form-check-label" for="switcher-dark-theme">Dark</label>
                <input type="radio" class="form-check-input" id="switcher-dark-theme" v-model="themeMode" value="dark"
                  @change="setDarkMode" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <p class="switcher-style-head">Directions:</p>
          <div class="row switcher-style">
            <div class="col-4">
              <div class="form-check switch-select">
                <label class="form-check-label" for="switcher-ltr">LTR</label>
                <input type="radio" class="form-check-input" id="switcher-ltr" v-model="direction" value="ltr"
                  @change="setLTR" />
              </div>
            </div>
            <div class="col-4">
              <div class="form-check switch-select">
                <label class="form-check-label" for="switcher-rtl">RTL</label>
                <input type="radio" class="form-check-input" id="switcher-rtl" v-model="direction" value="rtl"
                  @change="setRTL" />
              </div>
            </div>
          </div>
        </div>

        <div class="theme-colors">
          <p class="switcher-style-head">Theme Primary:</p>
          <div class="d-flex align-items-center switcher-style">
            <div v-for="(color, index) in primaryColors" :key="index" class="form-check switch-select me-3">
              <input type="radio" class="form-check-input" :id="'switcher-primary' + index"
                @click="changePrimaryColor(color)" />
            </div>
          </div>
        </div>

        <div>
          <p class="switcher-style-head">Reset:</p>
          <div class="text-center">
            <button @click="resetSettings" class="btn btn-danger mt-3">Reset</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import { switcherStore } from '~/stores/switcher';

export default defineComponent({

  setup() {
    const store = useStore();
    const local_variable = store.state; // Vuex store state

    const themeMode = ref(local_variable.dataThemeMode); // To control theme mode (light/dark)
    const direction = ref(local_variable.dir); // LTR or RTL
    const showBackdrop = ref(false); // To control backdrop visibility
    const primaryColors = ['color1', 'color2', 'color3', 'color4', 'color5']; // Assuming these are the primary colors

    const customStyles = computed(() => {
      return local_variable.colorPrimaryRgb ? `--primary-rgb: ${local_variable.colorPrimaryRgb};` : '';
    });

    // Methods
    const Switcherclose = () => {
      if (document.querySelector('.offcanvas-end')?.classList.contains('show')) {
        document.querySelector('.offcanvas-end')?.classList.remove('show');
        showBackdrop.value = false;
      }
    };

    const setLightMode = () => {
      store.dispatch('setThemeMode', 'light');
    };

    const setDarkMode = () => {
      store.dispatch('setThemeMode', 'dark');
    };

    const setLTR = () => {
      store.dispatch('setDirection', 'ltr');
    };

    const setRTL = () => {
      store.dispatch('setDirection', 'rtl');
    };

    const changePrimaryColor = (color: string) => {
      store.dispatch('setPrimaryColor', color);
    };

    const resetSettings = () => {
      store.dispatch('resetSettings');
    };

    // Watch for any state changes
    watch(themeMode, (newMode) => {
      store.dispatch('setThemeMode', newMode);
    });

    onMounted(() => {
      showBackdrop.value = true; // Example of backdrop appearing on mount
    });

    return {
      local_variable,
      themeMode,
      direction,
      showBackdrop,
      primaryColors,
      customStyles,
      Switcherclose,
      setLightMode,
      setDarkMode,
      setLTR,
      setRTL,
      changePrimaryColor,
      resetSettings,
      switcher: reactive(switcherStore()),
      dynamicPrimaryColor: ref("black"),
    };
  },
  methods: {
    primaryColorFn(color: any) {
      let primaryRgb = this.convertRgbToIndividual(color);
      this.themePrimaryFn(primaryRgb);
    },
    dynamicBackgroundColorFn(color: any) {
      let bgRgb = this.convertRgbToIndividual(color);
      let bgRgb2 = this.convertRgbToIndividual(color);
      let bg1Update: any = bgRgb.split(', ').join(', ');
      let bg2Update: any = bgRgb2.split(', ');
      bg2Update[0] = Number(bg2Update[0]) + 14;
      bg2Update[1] = Number(bg2Update[1]) + 14;
      bg2Update[2] = Number(bg2Update[2]) + 14;
      this.themeBackgroundFn(bg1Update, bg2Update.join(', '));
    },
    convertRgbToIndividual(value: string) {
      // Use a regular expression to extract the numeric values
      const numericValues: any = value.match(/\d+/g);
      // Join the numeric values with spaces to get the desired format
      return numericValues.join(', ');
    },
    themePrimaryFn(value: any) { this.switcher.themePrimaryFn(value); },
    themeBackgroundFn(val1: any, val2: any) { this.switcher.themeBackgroundFn(val1, val2); localStorage.removeItem('ynexHeader'); localStorage.removeItem('ynexMenu') },

  },
});
</script>

<style scoped>
/* Add your styles here */
</style>