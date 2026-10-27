/** Keep mutation completion distinct from a stale-state refresh. */
export function useAsnActions() {
  const busy = ref(false)
  const { t } = useI18n()
  const { bizErrorMessage } = useBizError()
  const run = async (id: number | string, action: 'receive' | 'close' | 'cancel' | 'delete') => {
    if (busy.value) return false
    busy.value = true
    try {
      if (action === 'cancel' || action === 'delete' || action === 'close') {
        const confirmed = await wConfirm({
          title: t(action === 'cancel' ? 'asn.tips.cancel-confirm-title' : action === 'delete' ? 'action-results.delete-confirm-title' : 'button.close'),
          message: action === 'cancel' ? t('asn.tips.cancel-confirm', { id }) : action === 'delete'
            ? t('action-results.delete-confirm', { entity: t('asn.entity') }) : t('asn.form-ui.close-confirm', { id }),
          confirmText: t('button.confirm'), cancelText: t('button.cancel'),
        })
        if (!confirmed) return false
      }
      let done = false, conflict = false
      await httpRequest(action === 'delete' ? `/api/warehouse/asn/${id}` : `/api/warehouse/asn/${id}/${action}/`, {
        method: action === 'delete' ? 'DELETE' : 'PUT',
        onSuccess: () => { done = true },
        onError: error => { conflict = error.status === 409; showToast(bizErrorMessage(error), 'error') },
      })
      if (done) showToast(t('action-results.success'), 'success')
      return done || conflict
    } finally { busy.value = false }
  }
  return { busy, run }
}
