/**
 * 全局搜索（顶栏搜索框、Ctrl K）的开关状态。
 * 这一步只有顶栏上的入口和快捷键；搜索面板（设计稿 TopbarSpec「全局搜索」）与结果页下一步接到这个状态上。
 */
export function useGlobalSearch() {
  const isOpen = useState<boolean>('w-search-open', () => false)
  return {
    isOpen,
    open: () => { isOpen.value = true },
    close: () => { isOpen.value = false },
  }
}
