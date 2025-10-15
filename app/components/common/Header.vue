<script setup>
import { switcherStore } from '@/stores/switcher'
import { header as staticHeader, languages } from '~/data/headerData.js'
import { useI18n } from 'vue-i18n'
import Avatar from '@/components/UI/avatar.vue'

// 获取i18n实例
const { setLocale: setI18nLocale } = useI18n()

// 响应式状态
const cookieLang = useCookie('i18n_lang', { maxAge: 2592000 })
const currentLang = ref(cookieLang.value || 'en')
const header = ref([...staticHeader])
const isFullScreen = ref(false)

// Store 实例
const switcher = switcherStore()
const router = useRouter()
const staffStore = useStaffStore()
const userStore = useAuthStore()
const warehouseStore = useWarehouseStore()


// 方法定义
const colorthemeFn = (value) => {
  localStorage.setItem('ynexcolortheme', value)
  localStorage.removeItem('ynexbodyBgRGB', value)
  switcher.colorthemeFn(value)
}

const logout = () => {
  userStore.logUserOut();
  staffStore.clearStaffInfo();
  warehouseStore.clearWarehouse();
  router.push('/');
}

const setLocale = async (lang) => {
  try {
    // 使用 i18n 模块的 setLocale 方法处理懒加载
    await setI18nLocale(lang)
    
    // 更新 cookie 状态
    cookieLang.value = lang
    currentLang.value = lang
    
    // console.log('Language changed to:', lang)
  } catch (error) {
    console.error('Language switch failed:', error)
    // 可以在这里添加错误处理逻辑
  }
}

const ToggleMenu = () => {
  let html = document.querySelector('html');
  if (window.innerWidth <= 992) {
      let dataToggled = html.getAttribute('data-toggled');
      if (dataToggled == 'open') {
          html.setAttribute('data-toggled', 'close');
      } else {
          html.setAttribute('data-toggled', 'open');
      }
  } else {
      let menuNavLayoutType = html.getAttribute('data-nav-style');
      let verticalStyleType = html.getAttribute('data-vertical-style');
      if (menuNavLayoutType) {
          let dataToggled = html.getAttribute('data-toggled');
          if (dataToggled) {
              html.removeAttribute('data-toggled');
          } else {
              html.setAttribute('data-toggled', menuNavLayoutType + '-closed');
          }
      } else if (verticalStyleType) {
          let dataToggled = html.getAttribute('data-toggled');
          if (verticalStyleType == 'doublemenu') {
              if (html.getAttribute('data-toggled') === 'double-menu-open' && document.querySelector('.double-menu-active')) {
                  html.setAttribute('data-toggled', 'double-menu-close');
              } else {
                  if (document.querySelector('.double-menu-active')) {
                      html.setAttribute('data-toggled', 'double-menu-open');
                  }
              }
          } else if (dataToggled) {
              html.removeAttribute('data-toggled');
          } else {
              switch (verticalStyleType) {
                  case 'closed':
                      html.setAttribute('data-toggled', 'close-menu-close');
                      break;
                  case 'icontext':
                      html.setAttribute('data-toggled', 'icon-text-close');
                      break;
                  case 'overlay':
                      html.setAttribute('data-toggled', 'icon-overlay-close');
                      break;
                  case 'detached':
                      html.setAttribute('data-toggled', 'detached-close');
                      break;
              }
          }
      }
  }
}


const toggleFullScreen = () => {
  const element = document.documentElement
  if (document.fullscreenElement) {
    exitFullscreen()
  } else {
    enterFullscreen(element)
  }
}

const fullscreenchanged = () => {
  isFullScreen.value = !!document.fullscreenElement
}

const exitFullscreen = () => {
  const exitMethods = [
    () => document.exitFullscreen(),
    () => document.mozCancelFullScreen(),
    () => document.webkitExitFullscreen()
  ]
  exitMethods.find(fn => fn())
}

const enterFullscreen = (element) => {
  const enterMethods = [
    () => element.requestFullscreen(),
    () => element.mozRequestFullScreen(),
    () => element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT)
  ]
  enterMethods.find(fn => fn())
}

const removeHeader = (index) => {
    header.value.splice(index, 1)
}


const selectWarehouse = (warehouse) => {
  warehouseStore.selectWarehouse(warehouse);
  location.reload(true);
}


// 生命周期
onMounted(async () => {

    // 获取Staff信息
    if (userStore.authenticated && userStore.userInfo) {
      if (userStore.userInfo?.type === 'staff') {
          if (!staffStore.staffInfo) {
              console.log("Staff info not found, fetching...");
              await staffStore.getCurrentStaffInfo();
          }
      }
    }  
    
    // 获取仓库信息
    const warehouseId = useCookie('warehouse_id').value
    
    // 初始化仓库列表
    await warehouseStore.fetchWarehouses()
    
    // 设置当前仓库
    if (warehouseId) {
      const warehouse = warehouseStore.warehouses.find(w => w.id === warehouseId)
      warehouseStore.selectWarehouse(warehouse || null)
    }


    // locale.value = currentLang.value    
    // 设置默认语言
    setLocale(currentLang.value)
    document.addEventListener("fullscreenchange", fullscreenchanged)
})

onBeforeUnmount(() => {
    document.removeEventListener("fullscreenchange", fullscreenchanged)
})
</script>


<template>



  <!-- app-header -->
  <header class="app-header">
    <!-- Start::main-header-container -->
    <div class="main-header-container container-fluid">

      <!-- Start::header-content-left -->
      <div class="header-content-left">

        <!-- Start::header-element -->
        <div class="header-element">
          <div class="horizontal-logo">
            <NuxtLink to='/' class="header-logo">
              <img src="/images/brand-logos/desktop-logo.svg" alt="logo" class="desktop-logo">
              <img src="/images/brand-logos/toggle-logo.svg" alt="logo" class="toggle-logo">
              <img src="/images/brand-logos/desktop-dark.svg" alt="logo" class="desktop-dark">
              <img src="/images/brand-logos/toggle-dark.svg" alt="logo" class="toggle-dark">
              <img src="/images/brand-logos/desktop-white.svg" alt="logo" class="desktop-white">
              <img src="/images/brand-logos/toggle-white.svg" alt="logo" class="toggle-white">
            </NuxtLink>
          </div>
        </div>
        <!-- End::header-element -->

        <!-- Start::header-element -->
        <div class="header-element">
          <!-- Start::header-link -->
          <a @click="ToggleMenu" aria-label="Hide Sidebar"
            class="sidemenu-toggle header-link animated-arrow hor-toggle horizontal-navtoggle"
            href="javascript:void(0);"><span></span></a>
          <!-- End::header-link -->
        </div>
        <!-- End::header-element -->


      </div>
      <!-- End::header-content-left -->

      <!-- Start::header-content-right -->
      <div class="header-content-right">

        <!-- Start::header-element -->
        <div class="header-element header-search">
          <!-- Start::header-link -->
          <a href="javascript:void(0);" class="header-link" data-bs-toggle="modal" data-bs-target="#searchModal">
            <i class="bx bx-search-alt-2 header-link-icon"></i>
          </a>
          <!-- End::header-link -->
        </div>
        <!-- End::header-element -->

        <!-- Start::header-element -->

        <div class="header-element country-selector">
          <!-- Start::header-link|dropdown-toggle -->
          <a href="javascript:void(0);" class="header-link dropdown-toggle" data-bs-auto-close="outside"
            data-bs-toggle="dropdown">
            <img :src="`/images/flags/${currentLang}_flag.jpg`" :alt="currentLang"
              class="rounded-circle header-link-icon"><span class="fw-semibold mb-0 lh-1">{{ languages[currentLang]
              }}</span>
          </a>
          <!-- End::header-link|dropdown-toggle -->
          <ul class="main-header-dropdown dropdown-menu dropdown-menu-end" data-popper-placement="none">
            <li v-for="lang in ['en', 'zh', 'ja']" :key="lang">
              <a @click="setLocale(lang)" class="dropdown-item">
                <img :src="`/images/flags/${lang}_flag.jpg`" class="avatar avatar-xs me-2">
                {{ languages[lang] }}
              </a>
            </li>
          </ul>
        </div>
        <!-- End::header-element -->

        <!-- Start::header-element -->
        <div class="header-element header-theme-mode">
          <!-- Start::header-link|layout-setting -->
          <a href="javascript:void(0);" class="header-link layout-setting">
            <span class="light-layout" @click="colorthemeFn('dark')">
              <!-- Start::header-link-icon -->
              <i class="bx bx-moon header-link-icon"></i>
              <!-- End::header-link-icon -->
            </span>
            <span class="dark-layout" @click="colorthemeFn('light')">
              <!-- Start::header-link-icon -->
              <i class="bx bx-sun header-link-icon"></i>
              <!-- End::header-link-icon -->
            </span>
          </a>
          <!-- End::header-link|layout-setting -->
        </div>
        <!-- End::header-element -->

        <!-- Start::header-element -->
        <div class="header-element header-fullscreen">
          <!-- Start::header-link -->
          <a @click="toggleFullScreen();" href="javascript:void(0);" class="header-link">
            <i v-if="!isFullScreen" class="bx bx-fullscreen full-screen-open header-link-icon"></i>
            <i v-if="isFullScreen" class="bx bx-exit-fullscreen full-screen-close header-link-icon"></i>
          </a>
          <!-- End::header-link -->
        </div>
        <!-- End::header-element -->

        <!-- Start::header-element -->
        <div class="header-element"> <!-- Start::header-link|dropdown-toggle -->
          <a href="javascript:void(0);" class="header-link dropdown-toggle" id="mainHeaderProfile"
            data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
            <div class="d-flex align-items-center">
              <div class="me-sm-2 me-0">
                <Avatar :avatar="userStore.userInfo?.avatar" :size="32" :alt="userStore.userInfo?.user_name"></Avatar>
              </div>
              <div class="d-sm-block d-none">
                <p class="fw-semibold mb-0 lh-1">{{ userStore.userInfo?.user_name }}</p>
                <span class="op-7 fw-normal d-block fs-11">{{staffStore.staffInfo?.company?.name}}</span>
              </div>
            </div>
          </a> <!-- End::header-link|dropdown-toggle -->
          <ul class="main-header-dropdown dropdown-menu pt-0 overflow-hidden header-profile-dropdown dropdown-menu-end"
            aria-labelledby="mainHeaderProfile" style="">
            <li>
              <NuxtLink class="dropdown-item d-flex" to="/authentication/reset-password"><i
                  class="ti ti-lock fs-18 me-2 op-7"></i>{{ $t("nav.reset-password") }}</NuxtLink>
            </li>
            <li>
              <NuxtLink class="dropdown-item d-flex" @click="logout"><i class="ti ti-logout fs-18 me-2 op-7"></i>{{
                $t("nav.logout") }}</NuxtLink>
            </li>
          </ul>
        </div>
        <!-- End::header-element -->
        <!-- Start::header-element -->
        <div class="pt-1">
          <WarehouseSelector :warehouses="warehouseStore.warehouses"
            :selected-label="warehouseStore.currentWarehouseLabel" @select="selectWarehouse" />
        </div>
        <!-- End::header-element -->

        <!-- Start::header-element -->
        <div class="header-element">
          <!-- Start::header-link|switcher-icon -->
          <a href="javascript:void(0);" class="header-link switcher-icon" data-bs-toggle="offcanvas"
            data-bs-target="#switcher-canvas">
            <i class="bx bx-cog header-link-icon"></i>
          </a>
          <!-- End::header-link|switcher-icon -->
        </div>
        <!-- End::header-element -->

      </div>
      <!-- End::header-content-right -->

    </div>
    <!-- End::main-header-container -->
  </header>
  <!-- /app-header -->


  <div class="modal fade" id="searchModal" tabindex="-1" aria-labelledby="searchModal" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-body">
          <div class="input-group">
            <a href="javascript:void(0);" class="input-group-text" id="Search-Grid"><i
                class="fe fe-search header-link-icon fs-18"></i></a>
            <input type="search" class="form-control border-0 px-2" placeholder="Search" aria-label="Username">
            <a href="javascript:void(0);" class="input-group-text" id="voice-search"><i
                class="fe fe-mic header-link-icon"></i></a>
            <a href="javascript:void(0);" class="btn btn-light btn-icon" data-bs-toggle="dropdown"
              aria-expanded="false">
              <i class="fe fe-more-vertical"></i>
            </a>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item" href="javascript:void(0);">Action</a></li>
              <li><a class="dropdown-item" href="javascript:void(0);">Another action</a></li>
              <li><a class="dropdown-item" href="javascript:void(0);">Something else here</a></li>
              <li>
                <hr class="dropdown-divider">
              </li>
              <li><a class="dropdown-item" href="javascript:void(0);">Separated link</a></li>
            </ul>
          </div>
          <div class="mt-4">
            <p class="font-weight-semibold text-muted mb-2">Are You Looking For...</p>
            <span class="search-tags" v-for="(header,index) in header" :key="index">
              <i :class="`fe fe-${header.icon} me-2`"></i>{{$t(header.name)}}
              <a href="javascript:void(0)" class="tag-addon" @click="removeHeader(index)">
                <i class="fe fe-x"></i>
              </a>
            </span>
          </div>
          <div class="my-4">
            <p class="font-weight-semibold text-muted mb-2">Recent Search :</p>
            <div class="p-2 border br-5 d-flex align-items-center text-muted mb-2 alert">
              <NuxtLink to="/"><span>Notifications</span></NuxtLink>
              <a class="ms-auto lh-1" href="javascript:void(0);" data-bs-dismiss="alert" aria-label="Close"><i
                  class="fe fe-x text-muted"></i></a>
            </div>
            <div class="p-2 border br-5 d-flex align-items-center text-muted mb-2 alert">
              <NuxtLink to="/"><span>Alerts</span></NuxtLink>
              <a class="ms-auto lh-1" href="javascript:void(0);" data-bs-dismiss="alert" aria-label="Close"><i
                  class="fe fe-x text-muted"></i></a>
            </div>
            <div class="p-2 border br-5 d-flex align-items-center text-muted mb-0 alert">
              <NuxtLink to="/"><span>Mail</span></NuxtLink>
              <a class="ms-auto lh-1" href="javascript:void(0);" data-bs-dismiss="alert" aria-label="Close"><i
                  class="fe fe-x text-muted"></i></a>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div class="btn-group ms-auto">
            <button class="btn btn-sm btn-primary-light">{{ $t("button.search") }}</button>
            <button class="btn btn-sm btn-primary">{{ $t("button.clear_recents") }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
