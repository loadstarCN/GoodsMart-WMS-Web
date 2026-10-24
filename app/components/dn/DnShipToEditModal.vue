<script lang="ts" setup>
/**
 * 出库单详情页的「改收件地址」弹窗（后端 doc/shipping-flow.md §6.6）：打包后也能改 DN 的收件地址快照（ship_to），
 * 如承运商文件导出报「地址超长」（409 16137 TOO_LONG）时改短再导出。
 * - 打开时 GET /dn/<id>/ship-to → {ship_to, ship_to_effective, shipping_address, locked, locked_reason, locked_message}；
 *   表单按 ship_to（没有快照时按 ship_to_effective，即面单现在用的地址）填
 * - 保存 PUT /dn/<id>/ship-to {ship_to} → 同上；单行地址 shipping_address 由后端按新地址重新生成
 * - 不能改：已有在线建的 / 已导出或导回的运单（locked_reason WAYBILL_EXISTS，先取消运单或作废导出；保存时 409 16076
 *   reason SHIP_TO_LOCKED）、已发货（DN_SHIPPED，409 16065）、已关闭（DN_CLOSED，400 16001）；手填的运单号不锁。
 *   字段不合法 400 14019 / 14020（field = ship_to.<key>）标在表单上方
 * 报关件的报关快照（收货人）不跟着改。保存成功 emit saved。
 */
import type { HttpRequestError } from '~/utils/http'
import { addressFieldLabel, cleanShipTo, type StructuredAddress } from '~/composables/address/structuredAddress'

const props = defineProps<{
  open: boolean
  dnId: number | string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()

interface ShipToState {
  ship_to: StructuredAddress | null
  ship_to_effective: StructuredAddress | null
  shipping_address: string | null
  locked: boolean
  locked_reason: string | null
  locked_message: string | null
}

const state = ref<ShipToState | null>(null)
const form = ref<Record<string, any>>({})
const loading = ref(false)
const saving = ref(false)
const failure = ref<string | null>(null)
const countryError = ref<string | null>(null)

const url = computed(() => `/api/warehouse/dn/${props.dnId}/ship-to`)

const load = async () => {
  loading.value = true
  failure.value = null
  countryError.value = null
  await httpRequest<ShipToState>(url.value, {
    method: 'GET',
    onSuccess: (data) => {
      state.value = data
      const base = data?.ship_to || data?.ship_to_effective || {}
      form.value = JSON.parse(JSON.stringify(base))
      if (form.value.latin === undefined) form.value.latin = null
    },
    onError: (error: HttpRequestError) => {
      failure.value = bizErrorMessage(error)
    },
    onFinally: () => {
      loading.value = false
    },
  })
}

watch(() => props.open, (open: boolean) => {
  if (open) load()
}, { immediate: true })

const close = () => {
  if (!saving.value) emit('update:open', false)
}

/** 锁定原因（按原因码翻译，没有文案时用后端原文） */
const lockedText = computed(() => {
  const code = state.value?.locked_reason
  const key = code ? `dn.ship-to.locked-reasons.${code}` : ''
  return key && te(key) ? t(key) : (state.value?.locked_message || '')
})
const editable = computed(() => !!state.value && !state.value.locked && !saving.value)

const save = async () => {
  if (!editable.value) return
  saving.value = true
  failure.value = null
  countryError.value = null
  let saved = false
  let stale = false
  await httpRequest<ShipToState>(url.value, {
    method: 'PUT',
    body: { ship_to: cleanShipTo(form.value) },
    onSuccess: (data) => {
      saved = true
      state.value = data
    },
    onError: (error: HttpRequestError) => {
      if (error.code === 14019 || error.code === 14020) {
        const label = addressFieldLabel(error.field, form.value?.country, t, te)
        const message = t('dn.ship-to.invalid-field', { field: label || error.field || '—', message: error.message || '—' })
        if (error.code === 14020) countryError.value = message
        else failure.value = message
        return
      }
      // 别人刚建了运单 / 导出或刚发货：提示并按最新状态重读（变成只读）
      stale = error.code === 16076 || error.code === 16065
      failure.value = bizErrorMessage(error)
    },
    onFinally: () => {
      saving.value = false
    },
  })
  if (saved) {
    showToast(t('dn.ship-to.saved'), 'success')
    emit('saved')
    emit('update:open', false)
  } else if (stale) {
    const message = failure.value
    await load()
    failure.value = message
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal fade" :class="{ show: open }" :style="{ display: open ? 'block' : 'none' }" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ t('dn.ship-to.edit-title') }} · DN-{{ dnId }}</h6>
            <button type="button" class="btn-close" :disabled="saving" @click="close"></button>
          </div>
          <div class="modal-body">
            <div class="text-center py-4" v-if="loading && !state">
              <span class="spinner-border spinner-border-sm"></span>
            </div>
            <template v-else-if="state">
              <div class="alert alert-warning-transparent fs-13" v-if="state.locked">
                <i class="ri-lock-line me-1"></i>{{ lockedText }}
              </div>
              <p class="fs-13 text-muted" v-else>{{ t('dn.ship-to.edit-hint') }}</p>
              <p class="fs-12 text-muted" v-if="!state.ship_to && !state.locked">{{ t('dn.ship-to.edit-from-effective') }}</p>
              <DnShipToFields v-model="form" id-prefix="dn-ship-to-edit" :editable="editable" :country-error="countryError" />
            </template>
            <div class="alert alert-danger-transparent fs-13 mt-3 mb-0" v-if="failure">{{ failure }}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" :disabled="saving" @click="close">{{ t('button.cancel') }}</button>
            <button type="button" class="btn btn-primary" :disabled="!editable" @click="save" v-if="state && !state.locked">
              <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>{{ t('button.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="open" @click="close"></div>
  </Teleport>
</template>
