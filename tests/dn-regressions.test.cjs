const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

function load(file, globals = {}, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../app', file + '.ts'), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(code, {
    ...vue, ...globals, exports: mod.exports, module: mod,
    require: (id) => {
      if (Object.hasOwn(imports, id)) return imports[id]
      if (id.startsWith('~/')) return load(id.slice(2), globals, imports)
      return require(id)
    },
  }, { filename: file })
  return mod.exports
}

test('shipped orders cannot be cancelled, edited or have their address changed', () => {
  const { dnActionStates } = load('utils/dnActions')
  for (const status of ['delivered', 'completed', 'closed']) {
    assert.ok(dnActionStates(status, () => true).every((action) => !action.enabled))
  }
  assert.ok(dnActionStates('pending', () => false).every((action) => !action.allowed))
})

test('carrier file exports reject mixed or missing carriers', () => {
  const { dnExportCarrier } = load('utils/dnList')
  assert.equal(dnExportCarrier([{ id: 1, carrier_id: 7 }, { id: 2, carrier_id: 8 }]).mixed, true)
  assert.equal(dnExportCarrier([{ id: 1, carrier_id: 7 }, { id: 2 }]).carrierId, null)
  assert.equal(dnExportCarrier([{ id: 1, carrier_id: 7 }, { id: 2, shipping: { carrier_id: 7 } }]).carrierId, 7)
})

test('quantity differences are only shown after the respective warehouse operation', () => {
  const { goodsDifferences } = load('utils/dnFlowDisplay')
  const rows = [{ quantity: 5, picked_quantity: 5, packed_quantity: 0, delivered_quantity: 0 }]
  assert.equal(goodsDifferences(rows, 'in_progress'), null)
  assert.equal(goodsDifferences(rows, 'picked'), 0)
  assert.equal(goodsDifferences(rows, 'packed'), 1)
})

function actionHarness(status) {
  const messages = []
  const { useDnActions } = load('composables/dn/useDnActions', {
    useI18n: () => ({ t: (key) => key }),
    useBizError: () => ({ bizErrorMessage: () => 'failed' }),
    wConfirm: async () => true,
    wAlert: () => {},
    showToast: (...args) => messages.push(args),
    httpRequest: async (_, options) => options.onError({ status }),
  })
  return { actions: useDnActions(), messages }
}

test('start and close refresh a stale order on a 409 without reporting success', async () => {
  const { actions, messages } = actionHarness(409)
  assert.equal(await actions.start(1), true)
  assert.equal(await actions.close(1), true)
  assert.equal(actions.busy.value, null)
  assert.ok(messages.every(([, tone]) => tone === 'error'))
})

test('network failures do not report completion; failed deletion does not navigate away', async () => {
  const { actions } = actionHarness(-1)
  assert.equal(await actions.start(1), false)
  assert.equal(await actions.close(1), false)
  assert.equal(await actionHarness(409).actions.remove(1), false)
})

function flowHarness() {
  const requests = []
  const id = vue.ref(1)
  const { useShippingFlowView } = load('composables/shipping/useShippingFlowView', {
    useI18n: () => ({ t: (key) => key, te: () => false, localeProperties: vue.ref({ iso: 'en' }) }),
    useBizError: () => ({ bizErrorMessage: (error) => error.message }),
    useStaffStore: () => ({ hasPermission: () => true }),
    useRoute: () => ({ path: '/dn/detail/1' }),
    provideTimeZone: () => vue.ref('Asia/Tokyo'),
    httpRequest: (url, options) => new Promise((resolve) => requests.push({
      url,
      complete(data, error) {
        if (error) options.onError?.(error)
        else options.onSuccess?.(data)
        options.onFinally?.()
        resolve(data)
      },
    })),
  }, {
    '~/composables/customs/customsDocuments': { CUSTOMS_WORKFLOW_PROBLEMS: [], DN_LOCKED_STATUSES: [], DN_PACKAGE_EDITABLE_STATUSES: [] },
    '~/composables/customs/carrierShipment': {},
    '~/composables/customs/carrierPickup': {},
    '~/composables/shipping/carrierFile': {},
    '~/composables/shipping/shippingFlow': { normalizeShippingFlow: (data) => data, shippingFlowUrl: (id) => `/flow/${id}` },
  })
  return { id, requests, view: useShippingFlowView({ dnId: id }) }
}
const flow = (id, customs = false) => ({ id, dn_status: 'pending', route: { requires_customs: customs }, steps: [] })

test('shipping UI message references exist in Chinese, English and Japanese', () => {
  const dirs = ['dn', 'shipping', 'carrier', 'customs'].map((dir) => path.join(__dirname, '../app/components', dir))
  const files = dirs.flatMap((dir) => fs.readdirSync(dir).filter((file) => file.endsWith('.vue')).map((file) => path.join(dir, file)))
  const keys = new Set(files.flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1]).filter((key) => !key.endsWith('.'))))
  for (const phase of ['warehouse', 'prepare', 'handover']) keys.add(`dn.detail.phases.${phase}`)
  for (const state of ['done', 'current', 'todo', 'warn', 'skipped']) keys.add(`dn.detail.phase-states.${state}`)
  for (const step of ['picking', 'packing', 'handover', 'delivered']) keys.add(`dn.detail.task-links.${step}`)
  for (const doc of ['ci', 'pl']) keys.add(`dn.detail.aside.doc-${doc}`)
  for (const locale of ['zh-CN', 'en-US', 'ja-JP']) {
    const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../i18n/locales', locale + '.json'), 'utf8'))
    for (const key of keys) assert.equal(typeof key.split('.').reduce((value, part) => value?.[part], messages), 'string', `${locale}: ${key}`)
  }
})

test('late flow responses cannot overwrite a newly opened order', async () => {
  const { id, requests, view } = flowHarness()
  const old = view.load()
  id.value = 2
  view.reset()
  const current = view.load()
  requests[1].complete(flow(2))
  await current
  requests[0].complete(flow(1, true))
  await old
  assert.equal(view.flow.value.id, 2)
  assert.equal(requests.length, 2) // old response must not start a customs fetch
})

test('late customs responses and errors cannot leak between orders', async () => {
  const { id, requests, view } = flowHarness()
  const old = view.loadCustoms()
  id.value = 2
  view.reset()
  const current = view.loadCustoms()
  requests[1].complete({ dn_id: 2 })
  await current
  requests[0].complete(null, { message: 'old order failed' })
  await old
  assert.equal(view.customsView.value.dn_id, 2)
  assert.equal(view.customsError.value, null)
})

test('latest refresh wins and domestic orders clear obsolete customs data', async () => {
  const { requests, view } = flowHarness()
  view.customsView.value = { dn_id: 1 }
  const old = view.load()
  const current = view.load()
  requests[1].complete(flow(1))
  await current
  requests[0].complete(null, { message: 'old request failed' })
  await old
  assert.equal(view.loadError.value, null)
  assert.equal(view.customsView.value, null)
  assert.equal(view.loading.value, false)
})
