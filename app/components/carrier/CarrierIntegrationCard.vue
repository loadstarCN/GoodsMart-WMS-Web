<script lang="ts" setup>
/**
 * 承运商的在线对接（自动建运单）：选对接插件 → 按插件声明的设置项生成表单 → 测试连接 / 保存。
 *
 * GET  /warehouse/carrier/integrations              可选的插件与各自的设置项（label / help 按语言给）
 * GET  /warehouse/carrier/<id>/integration          当前设置：{adapter, name, enabled, settings, secrets: {key: 已设置}, ready, problems}
 * PUT  /warehouse/carrier/<id>/integration          保存（adapter 为空 = 移除）；设置不合法 400 16124（field settings.<key>）
 * POST /warehouse/carrier/<id>/integration/test     用表单里的值连一次（不保存）→ {ok, message, errors?}
 * 密钥只写不读：已保存的显示「已保存」，留空 = 不改。有未结束的运单时不能移除 / 换插件（409 16125）。
 */
const props = withDefaults(defineProps<{
  carrierId: number | string
  /** 有 carrier_edit 权限：可以改；否则只读 */
  editable?: boolean
}>(), {
  editable: true,
})

const emit = defineEmits<{
  /** 保存 / 移除后：{adapter, name, enabled} 或 null */
  (e: 'saved', summary: { adapter: string; name: string; enabled: boolean } | null): void
}>()

interface FieldOption { value: string; label: Record<string, string> }
interface IntegrationField {
  key: string
  kind: 'text' | 'secret' | 'select' | 'boolean'
  label: Record<string, string>
  required: boolean
  default: any
  options: FieldOption[] | null
  help: Record<string, string> | null
  group: string
  placeholder: Record<string, string> | null
}
interface IntegrationPlugin {
  code: string
  name: string
  portal_name: string | null
  portal_url: string | null
  fields: IntegrationField[]
}
interface IntegrationState {
  adapter: string
  name: string
  enabled: boolean
  settings: Record<string, any>
  secrets: Record<string, boolean>
  ready: boolean
  problems: { code: string; message: string; fields?: string[] }[]
}

const { t, te, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const plugins = ref<IntegrationPlugin[]>([])
const current = ref<IntegrationState | null>(null)
const form = reactive<{ adapter: string; enabled: boolean; settings: Record<string, any>; secrets: Record<string, string> }>({
  adapter: '',
  enabled: true,
  settings: {},
  secrets: {},
})
const fieldErrors = ref<Record<string, string>>({})
const testResult = ref<{ ok: boolean; message: string; detail: string } | null>(null)

/** 插件给的多语言文本：按当前语言取，没有用英文 */
const localized = (text: Record<string, string> | null | undefined): string => {
  if (!text) return ''
  const iso = String(localeProperties.value?.iso || 'en-US')
  return text[iso] || text['en-US'] || Object.values(text)[0] || ''
}

const plugin = computed(() => plugins.value.find((p: IntegrationPlugin) => p.code === form.adapter) || null)
const GROUP_ORDER = ['account', 'shipping', 'label']
const groups = computed(() => {
  const fields = plugin.value?.fields || []
  const keys = [...GROUP_ORDER, ...new Set(fields.map((f: IntegrationField) => f.group).filter((g: string) => !GROUP_ORDER.includes(g)))]
  return keys
    .map((group) => ({ group, fields: fields.filter((f: IntegrationField) => f.group === group) }))
    .filter((g) => g.fields.length > 0)
})
const groupTitle = (group: string) => {
  const key = `carrier.integration.groups.${group}`
  return te(key) ? t(key) : group
}

/** 表单回到「已保存的设置」（换插件时用该插件的默认值） */
const resetForm = (adapter: string) => {
  form.adapter = adapter
  form.secrets = {}
  fieldErrors.value = {}
  testResult.value = null
  const fields = plugins.value.find((p: IntegrationPlugin) => p.code === adapter)?.fields || []
  const saved = current.value && current.value.adapter === adapter ? current.value.settings : {}
  const settings: Record<string, any> = {}
  for (const field of fields) {
    if (field.kind === 'secret') continue
    const value = saved[field.key]
    settings[field.key] = value !== undefined && value !== null ? value : (field.default ?? (field.kind === 'boolean' ? false : ''))
  }
  form.settings = settings
  form.enabled = current.value && current.value.adapter === adapter ? current.value.enabled : true
}

const load = async () => {
  loading.value = true
  await Promise.all([
    httpRequest<IntegrationPlugin[]>('/api/warehouse/carrier/integrations', {
      method: 'GET',
      onSuccess: (data) => {
        plugins.value = Array.isArray(data) ? data : []
      },
      onError: (error) => {
        showToast(bizErrorMessage(error), 'error')
      },
    }),
    httpRequest<IntegrationState | null>(`/api/warehouse/carrier/${props.carrierId}/integration`, {
      method: 'GET',
      onSuccess: (data) => {
        current.value = data && typeof data === 'object' && (data as any).adapter ? data : null
      },
      onError: (error) => {
        showToast(bizErrorMessage(error), 'error')
      },
    }),
  ])
  resetForm(current.value?.adapter || '')
  loading.value = false
}

onMounted(load)

const onAdapterChange = (event: Event) => {
  resetForm((event.target as HTMLSelectElement).value)
}

/** 状态徽章：未对接 / 已启用 / 已停用 / 设置不全 */
const badge = computed(() => {
  const c = current.value
  if (!c) return { cls: 'bg-light text-muted', text: t('carrier.integration.status.none') }
  if (!c.ready && c.enabled) return { cls: 'bg-warning-transparent', text: t('carrier.integration.status.incomplete') }
  if (!c.enabled) return { cls: 'bg-secondary-transparent', text: t('carrier.integration.status.disabled', { name: c.name }) }
  return { cls: 'bg-success-transparent', text: t('carrier.integration.status.enabled', { name: c.name }) }
})
const problemText = (p: { code: string; message: string; fields?: string[] }) => {
  if (p.code === 'CARRIER_NOT_CONFIGURED' && p.fields?.length) {
    const names = p.fields.map((key) => localized(plugin.value?.fields.find((f: IntegrationField) => f.key === key)?.label) || key)
    return t('carrier.integration.problems.missing', { fields: names.join(t('carrier.integration.list-separator')) })
  }
  const key = `carrier.integration.problems.${p.code}`
  return te(key) ? t(key) : p.message
}

const body = () => ({
  adapter: form.adapter || null,
  enabled: form.enabled,
  settings: form.settings,
  secrets: form.secrets,
})

/** 400 16124：field 是 settings.<key> / secrets.<key> → 标到对应输入框下面 */
const showFieldError = (error: any) => {
  const field = String(error?.field || '')
  const key = field.split('.').pop() || ''
  if (field && key) {
    fieldErrors.value = { [key]: bizErrorMessage(error) }
    return true
  }
  return false
}

const save = async () => {
  if (!props.editable || saving.value) return
  saving.value = true
  fieldErrors.value = {}
  await httpRequest<IntegrationState | null>(`/api/warehouse/carrier/${props.carrierId}/integration`, {
    method: 'PUT',
    body: body(),
    onSuccess: (data) => {
      current.value = data && typeof data === 'object' && (data as any).adapter ? data : null
      resetForm(current.value?.adapter || '')
      showToast(t('carrier.integration.saved'), 'success')
      emit('saved', current.value ? { adapter: current.value.adapter, name: current.value.name, enabled: current.value.enabled } : null)
    },
    onError: (error) => {
      if (!showFieldError(error)) showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      saving.value = false
    },
  })
}

const remove = async () => {
  if (!props.editable || !current.value) return
  const confirmed = await showConfirm(
    t('carrier.integration.remove-confirm-title'),
    t('carrier.integration.remove-confirm', { name: current.value.name }),
    t('carrier.integration.remove'),
    t('button.cancel'),
  )
  if (!confirmed) return
  form.adapter = ''
  await save()
  // 没删掉（还有未结束的运单 16125 等）：表单回到原来的设置
  if (current.value) resetForm(current.value.adapter)
}

const test = async () => {
  if (!form.adapter || testing.value) return
  testing.value = true
  testResult.value = null
  fieldErrors.value = {}
  await httpRequest<any>(`/api/warehouse/carrier/${props.carrierId}/integration/test`, {
    method: 'POST',
    body: body(),
    onSuccess: (data) => {
      const ok = !!data?.ok
      const errors = Array.isArray(data?.errors) ? data.errors : []
      testResult.value = {
        ok,
        message: ok ? t('carrier.integration.test-ok', { name: plugin.value?.name || '' })
          : (data?.permission_denied ? t('carrier.integration.test-denied') : t('carrier.integration.test-failed')),
        detail: ok ? '' : (errors.map((e: any) => [e.code, e.message].filter(Boolean).join(': ')).join('; ') || data?.message || ''),
      }
    },
    onError: (error) => {
      if (!showFieldError(error)) showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      testing.value = false
    },
  })
}

const dirty = computed(() => {
  if ((current.value?.adapter || '') !== form.adapter) return true
  if (!current.value) return false
  if (current.value.enabled !== form.enabled) return true
  if (Object.values(form.secrets).some((v) => !!v)) return true
  return Object.entries(form.settings).some(([k, v]) => (current.value?.settings?.[k] ?? '') !== (v ?? ''))
})
</script>

<template>
  <div class="card custom-card">
    <div class="card-header justify-content-between">
      <div class="card-title">{{ t('carrier.integration.title') }}</div>
      <span class="badge" :class="badge.cls" v-if="!loading">{{ badge.text }}</span>
    </div>
    <div class="card-body">
      <div class="d-flex justify-content-center py-3" v-if="loading">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
      </div>
      <template v-else>
        <p class="fs-13 text-muted mb-3">{{ t('carrier.integration.intro') }}</p>

        <div class="row gy-3">
          <div class="col-xl-6">
            <label class="form-label" for="integration-adapter">{{ t('carrier.integration.adapter') }}</label>
            <select class="form-select" id="integration-adapter" :value="form.adapter" :disabled="!editable"
              @change="onAdapterChange">
              <option value="">{{ t('carrier.integration.none') }}</option>
              <option v-for="p in plugins" :key="p.code" :value="p.code">{{ p.name }}</option>
            </select>
          </div>
          <div class="col-xl-6 d-flex align-items-end" v-if="form.adapter">
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" role="switch" id="integration-enabled" v-model="form.enabled"
                :disabled="!editable">
              <label class="form-check-label" for="integration-enabled">{{ t('carrier.integration.enabled') }}</label>
              <div class="form-text mt-0">{{ t('carrier.integration.enabled-help') }}</div>
            </div>
          </div>
        </div>

        <template v-for="g in groups" :key="g.group">
          <h6 class="fs-13 text-muted fw-semibold mt-4 mb-2">{{ groupTitle(g.group) }}</h6>
          <div class="row gy-3">
            <div class="col-xl-6" v-for="field in g.fields" :key="field.key">
              <template v-if="field.kind === 'boolean'">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" role="switch" :id="`integration-${field.key}`"
                    v-model="form.settings[field.key]" :disabled="!editable">
                  <label class="form-check-label" :for="`integration-${field.key}`">{{ localized(field.label) }}</label>
                </div>
              </template>
              <template v-else>
                <label class="form-label" :for="`integration-${field.key}`">
                  {{ localized(field.label) }}<span class="text-danger ms-1" v-if="field.required">*</span>
                </label>
                <select class="form-select" :id="`integration-${field.key}`" v-model="form.settings[field.key]"
                  v-if="field.kind === 'select'" :disabled="!editable">
                  <option v-for="o in field.options || []" :key="o.value" :value="o.value">{{ localized(o.label) }}</option>
                </select>
                <input type="password" class="form-control" :id="`integration-${field.key}`" autocomplete="new-password"
                  v-model="form.secrets[field.key]" v-else-if="field.kind === 'secret'" :disabled="!editable"
                  :placeholder="current?.adapter === form.adapter && current?.secrets?.[field.key] ? t('carrier.integration.secret-saved') : ''">
                <input type="text" class="form-control" :id="`integration-${field.key}`" v-model="form.settings[field.key]" v-else
                  :disabled="!editable" :placeholder="localized(field.placeholder)">
              </template>
              <div class="form-text" v-if="field.help">{{ localized(field.help) }}</div>
              <div class="invalid-feedback d-block" v-if="fieldErrors[field.key]">{{ fieldErrors[field.key] }}</div>
            </div>
          </div>
        </template>

        <ul class="fs-13 text-warning mb-0 mt-3 ps-3" v-if="current && current.adapter === form.adapter && current.problems.length > 0">
          <li v-for="(p, i) in current.problems" :key="i">{{ problemText(p) }}</li>
        </ul>

        <div class="fs-13 mt-3" :class="testResult.ok ? 'text-success' : 'text-danger'" v-if="testResult">
          <i class="me-1" :class="testResult.ok ? 'ri-checkbox-circle-line' : 'ri-close-circle-line'"></i>{{ testResult.message }}
          <div class="fs-12 text-muted mt-1 text-break" v-if="testResult.detail">{{ testResult.detail }}</div>
        </div>
      </template>
    </div>
    <div class="card-footer d-flex flex-wrap align-items-center gap-2" v-if="!loading && editable">
      <button type="button" class="btn btn-sm btn-link text-danger px-0" v-if="current" :disabled="saving" @click="remove">
        {{ t('carrier.integration.remove') }}
      </button>
      <div class="ms-auto btn-list">
        <button type="button" class="btn btn-sm btn-light" :disabled="!form.adapter || testing" @click="test">
          <span v-if="testing" class="spinner-border spinner-border-sm me-1"></span>{{ t('carrier.integration.test') }}
        </button>
        <button type="button" class="btn btn-sm btn-primary" :disabled="saving || !dirty" @click="save">
          <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>{{ t('button.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
