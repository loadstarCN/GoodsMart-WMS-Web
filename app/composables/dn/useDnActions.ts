/**
 * 发货单的单据操作（列表行与详情页共用，原来在 pages/dn/index.vue 与 dn/detail/[id].vue 各写了一份）：
 * - start：开始作业 PUT /dn/<id>/progress/
 * - close：关闭（待处理的单据，释放预占）PUT /dn/<id>/close/ —— 先确认
 * - cancel：取消（处理中 / 已拣货 / 已打包）PUT /dn/<id>/cancel/ —— 先确认（已拣 / 已打包时说明货退回待上架）；
 *   16110（有未结束的在线运单，要先在「运单」一步取消）弹窗说明，其它按业务码提示；409（状态已变）也要刷新
 * - remove：删除（待处理）DELETE /dn/<id> —— 先确认
 * 返回是否要刷新（成功，或状态已变）。busy 是正在做的「操作-单号」（按钮转圈、同类按钮禁用）。
 */
import { DN_PICKED_STATUSES } from '~/utils/dnActions'

export const useDnActions = () => {
  const { t } = useI18n()
  const { bizErrorMessage } = useBizError()
  const busy = ref<string | null>(null)

  const run = async (key: string, fn: () => Promise<boolean>): Promise<boolean> => {
    if (busy.value) return false
    busy.value = key
    try {
      return await fn()
    } finally {
      busy.value = null
    }
  }

  const start = (id: number | string) => run(`start-${id}`, async () => {
    let ok = false
    let conflict = false
    await httpRequest(`/api/warehouse/dn/${id}/progress/`, {
      method: 'PUT',
      onSuccess: () => {
        ok = true
        showToast(t('dn.actions.started', { dn: `DN-${id}` }), 'success')
      },
      onError: (error) => {
        conflict = error.status === 409
        showToast(bizErrorMessage(error), 'error')
      },
    })
    return ok || conflict
  })

  const close = async (id: number | string) => {
    const confirmed = await wConfirm({
      title: t('dn.actions.close-confirm-title', { dn: `DN-${id}` }),
      message: t('dn.actions.close-confirm'),
      confirmText: t('dn.actions.close'),
      cancelText: t('dn.actions.keep-open'),
      danger: true,
    })
    if (!confirmed) return false
    return run(`close-${id}`, async () => {
      let ok = false
      let conflict = false
      await httpRequest(`/api/warehouse/dn/${id}/close/`, {
        method: 'PUT',
        onSuccess: () => {
          ok = true
          showToast(t('dn.actions.closed', { dn: `DN-${id}` }), 'success')
        },
        onError: (error) => {
          conflict = error.status === 409
          showToast(bizErrorMessage(error), 'error')
        },
      })
      return ok || conflict
    })
  }

  const cancel = async (id: number | string, status?: string | null) => {
    // 已拣 / 已打包：确认框说明货会退回待上架
    const picked = DN_PICKED_STATUSES.includes(String(status || ''))
    const confirmed = await wConfirm({
      title: t('dn.tips.cancel-confirm-title'),
      message: t(picked ? 'dn.tips.cancel-confirm-picked' : 'dn.tips.cancel-confirm', { id }),
      confirmText: t('dn.operations.cancel'),
      cancelText: t('button.dont-cancel'),
      danger: true,
    })
    if (!confirmed) return false
    return run(`cancel-${id}`, async () => {
      let done = false
      let conflict = false
      await httpRequest(`/api/warehouse/dn/${id}/cancel/`, {
        method: 'PUT',
        onSuccess: () => {
          done = true
        },
        onError: (error) => {
          // 16052 状态已变 / 16053 拣货已开始 / 16110 有未结束的在线运单（要先在发货流程的「运单」一步取消运单）
          conflict = error.status === 409
          if (error.code === 16110) {
            wAlert({ title: t('dn.tips.cancel-confirm-title'), message: bizErrorMessage(error), tone: 'warning' })
            return
          }
          showToast(bizErrorMessage(error), 'error')
        },
      })
      if (done) showToast(t('dn.actions.cancelled', { dn: `DN-${id}` }), 'success')
      return done || conflict
    })
  }

  const remove = async (id: number | string) => {
    const confirmed = await wConfirm({
      title: t('dn.actions.delete-confirm-title', { dn: `DN-${id}` }),
      message: t('action-results.delete-confirm', { entity: t('dn.entity') }),
      confirmText: t('dn.actions.delete'),
      cancelText: t('dn.actions.keep'),
      danger: true,
    })
    if (!confirmed) return false
    return run(`delete-${id}`, async () => {
      let ok = false
      await httpRequest(`/api/warehouse/dn/${id}`, {
        method: 'DELETE',
        onSuccess: () => {
          ok = true
          showToast(t('dn.actions.deleted', { dn: `DN-${id}` }), 'success')
        },
        onError: (error) => showToast(bizErrorMessage(error), 'error'),
      })
      return ok
    })
  }

  return { busy, start, close, cancel, remove }
}
