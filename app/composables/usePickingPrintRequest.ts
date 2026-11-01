/** A request audit is not confirmation that a printer produced a page. */
export const usePickingPrintRequest = () => {
  const printing = ref(false), printError = ref('')
  const { bizErrorMessage } = useBizError()
  let retry: { key: string; id: string } | null = null
  const requestPrint = async (ids: number[], language: string) => {
    if (printing.value) return
    printing.value = true
    printError.value = ''
    try {
      await document.fonts.ready
      await nextTick()
      const key = JSON.stringify([ids, language])
      if (retry?.key !== key) retry = { key, id: crypto.randomUUID() }
      const result = await httpRequest('/api/warehouse/picking/print-requests', {
        method: 'POST', body: { task_ids: ids, request_id: retry.id, language },
        onError: error => { printError.value = bizErrorMessage(error) },
      })
      if (!result) return
      retry = null
      window.print()
    } catch (error: any) {
      printError.value = bizErrorMessage(error)
    } finally {
      printing.value = false
    }
  }
  return { printing, printError, requestPrint }
}
