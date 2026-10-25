/**
 * 界面偏好（只存在这台浏览器里，读写失败时用默认值）：
 * - 侧栏收起（全站一个）
 * - 显示密度：舒适 / 紧凑，按用户保存（同一台电脑换人登录各自一份）
 * - 深色模式：机制已就绪，旧页面还没适配深色，顶栏开关先隐藏（见 data/navigation.ts 的 SHELL_FEATURES）
 * 外壳（components/shell/ShellFrame）把密度、主题写到 <html data-density / data-theme> 上。
 */
export type UiDensity = 'comfortable' | 'compact'
export type UiTheme = 'light' | 'dark'

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 隐私模式 / 存储被禁用：只在本次打开期间生效
  }
}

const densityKey = () => {
  const userId = useAuthStore().userInfo?.id
  return userId ? `w.density.${userId}` : 'w.density'
}

export function useUiPrefs() {
  const sidebarCollapsed = useState<boolean>('w-sidebar-collapsed', () => read('w.sidebar.collapsed') === '1')
  const density = useState<UiDensity>('w-density', () => (read(densityKey()) === 'compact' ? 'compact' : 'comfortable'))
  const theme = useState<UiTheme>('w-theme', () => (read('w.theme') === 'dark' ? 'dark' : 'light'))

  const setSidebarCollapsed = (value: boolean) => {
    sidebarCollapsed.value = value
    write('w.sidebar.collapsed', value ? '1' : '0')
  }
  const setDensity = (value: UiDensity) => {
    density.value = value
    write(densityKey(), value)
  }
  const setTheme = (value: UiTheme) => {
    theme.value = value
    write('w.theme', value)
  }
  /** 换人登录后按新用户重新读密度 */
  const reloadDensity = () => {
    density.value = read(densityKey()) === 'compact' ? 'compact' : 'comfortable'
  }

  return { sidebarCollapsed, density, theme, setSidebarCollapsed, setDensity, setTheme, reloadDensity }
}
