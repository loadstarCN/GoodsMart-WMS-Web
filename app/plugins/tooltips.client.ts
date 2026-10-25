import { Tooltip } from 'bootstrap/dist/js/bootstrap.js'

/**
 * 旧页面的 Bootstrap 提示（data-bs-toggle="tooltip"，如 UI/HelpIcon）：在 body 上委托初始化一次。
 * 原来由模板的主题设置面板（common/Switcher）挂载时初始化，新外壳不再放那个面板，挪到这里。
 * 新组件的「?」说明用 WHelp，不依赖它。
 */
export default defineNuxtPlugin(() => {
  new Tooltip(document.body, { selector: '[data-bs-toggle="tooltip"]' })
})
