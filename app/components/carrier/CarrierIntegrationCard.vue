<script lang="ts" setup>
/**
 * 承运商的在线对接（自动建运单）：选对接插件 → 按插件声明的设置项生成表单 → 测试连接 / 保存。
 *
 * GET  /warehouse/carrier/integrations              可选的插件与各自的设置项（label / help 按语言给）、能力声明
 *                                                   （scopes、supports_waybill / customs / pickup / tracking、tracks_any_number）
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
  /** 能承运的范围：domestic / international */
  scopes?: string[]
  supports_waybill?: boolean
  supports_customs?: boolean
  supports_pickup?: boolean
  supports_tracking?: boolean
  /** 能查不是本插件建的运单号（手填的号码也能跟踪） */
  tracks_any_number?: boolean
  tracking_url_template?: string | null
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
/** 插件能做的事（徽章）；旧后端没有这些声明时不显示 */
const capabilities = computed(() => {
  const p = plugin.value
  if (!p) return []
  const caps: string[] = []
  for (const scope of p.scopes || []) {
    caps.push(te(`carrier.integration.capabilities.scope-${scope}`) ? t(`carrier.integration.capabilities.scope-${scope}`) : scope)
  }
  const flags: [keyof IntegrationPlugin, string][] = [
    ['supports_waybill', 'waybill'], ['supports_customs', 'customs'], ['supports_pickup', 'pickup'],
    ['supports_tracking', 'tracking'], ['tracks_any_number', 'tracks-any-number'],
  ]
  for (const [flag, key] of flags) {
    if (p[flag]) caps.push(t(`carrier.integration.capabilities.${key}`))
  }
  return caps
})
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
 <WFormSection class="w-carrier-integration" :title="t('carrier.integration.title')"><div class="w-integration-body"><WEmptyState v-if="loading" :title="t('common.status.loading')" /><template v-else><WStatus :tone="current?.enabled?(current?.ready?'ok':'warn'):'none'">{{badge.text}}</WStatus><p>{{t('carrier.integration.intro')}}</p><WFormGrid><WField :span="6" :label="t('carrier.integration.adapter')"><WSelect :model-value="form.adapter" :options="[{value:'',label:t('carrier.integration.none')},...plugins.map(p=>({value:p.code,label:p.name}))]" :disabled="!editable||saving||testing" @update:model-value="value=>resetForm(String(value||''))" /></WField><div v-if="form.adapter" class="w-span-6 w-integration-enabled"><WSwitch v-model="form.enabled" :label="t('carrier.integration.enabled')" :disabled="!editable||saving||testing" /></div></WFormGrid><div v-if="capabilities.length" class="w-integration-caps"><span>{{t('carrier.integration.capabilities.title')}}</span><WStatus v-for="cap in capabilities" :key="cap" tone="ok">{{cap}}</WStatus></div>
 <section v-for="g in groups" :key="g.group" class="w-integration-group"><h3>{{groupTitle(g.group)}}</h3><WFormGrid><WField v-for="field in g.fields" :key="field.key" :label="localized(field.label)" :span="6" :optional="!field.required" :hint="localized(field.help)" :error="fieldErrors[field.key]"><WSwitch v-if="field.kind==='boolean'" v-model="form.settings[field.key]" :label="localized(field.label)" :disabled="!editable||saving||testing" /><WSelect v-else-if="field.kind==='select'" v-model="form.settings[field.key]" :options="(field.options||[]).map(o=>({value:o.value,label:localized(o.label)}))" :disabled="!editable||saving||testing" /><WInput v-else-if="field.kind==='secret'" v-model="form.secrets[field.key]" type="password" autocomplete="new-password" :disabled="!editable||saving||testing" :placeholder="current?.adapter===form.adapter&&current?.secrets?.[field.key]?t('carrier.integration.secret-saved'):''" /><WInput v-else v-model="form.settings[field.key]" :disabled="!editable||saving||testing" :placeholder="localized(field.placeholder)" /></WField></WFormGrid></section>
 <WAlert v-for="(problem,index) in current&&current.adapter===form.adapter?current.problems:[]" :key="index" tone="warn" :title="problemText(problem)" /><WAlert v-if="testResult" :tone="testResult.ok?'ok':'block'" :title="testResult.message">{{testResult.detail}}</WAlert><footer v-if="editable"><WButton v-if="current" variant="danger" :disabled="saving||testing" @click="remove">{{t('carrier.integration.remove')}}</WButton><span /><WButton :disabled="!form.adapter||saving" :loading="testing" @click="test">{{t('carrier.integration.test')}}</WButton><WButton variant="primary" :disabled="!dirty||testing" :loading="saving" @click="save">{{t('button.save')}}</WButton></footer></template></div></WFormSection>
</template>
<style scoped>
.w-carrier-integration{border-top:1px solid var(--w-line)}.w-integration-body{display:flex;flex-direction:column;gap:16px}.w-integration-body>p{margin:0;color:var(--w-text-3);font-size:13px;line-height:20px}.w-integration-enabled{display:flex;align-items:center}.w-integration-caps{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px}.w-integration-group{border-top:1px solid var(--w-line);padding-top:16px}.w-integration-group h3{margin:0 0 12px;font-size:13px;line-height:20px;font-weight:600;color:var(--w-text-2)}.w-integration-body footer{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.w-integration-body footer>span{flex:1}
</style>
