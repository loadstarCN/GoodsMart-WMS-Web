const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

test('anonymous recovery bypasses session refresh while ordinary requests still authenticate', async () => {
  let protectedCalls = 0, publicCalls = 0, error, finished = 0
  const response = { ok: false, status: 429, json: async () => ({ message: 'Try later', code: 10010 }) }
  const api = load('utils/http', {
    URLSearchParams, FormData,
    fetch: async (url, init) => {
      publicCalls++
      assert.equal(init.credentials, 'omit')
      assert.equal(init.headers.Authorization, undefined)
      assert.equal(url, '/api/system/user/forgot-password')
      return response
    },
  }, { '~/composables/auth/authFetch': { authFetch: async () => { protectedCalls++; return { ok: true, json: async () => ({ ok: true }) } } } })
  await api.httpRequest('/api/system/user/forgot-password', {
    authenticated: false, method: 'POST', body: { email: 'qa@example.invalid' },
    onError: value => { error = value }, onFinally: () => { finished++ },
  })
  assert.equal(publicCalls, 1)
  assert.equal(protectedCalls, 0)
  assert.equal(error.status, 429)
  assert.equal(error.code, 10010)
  assert.equal(finished, 1)
  await api.httpRequest('/api/warehouse/inventory/')
  assert.equal(protectedCalls, 1)
})

test('threshold preview preserves an existing half-configured pair and escapes spreadsheet formulas', () => {
  const { thresholdPreviewRow, thresholdPreviewCsv } = load('utils/thresholdPreview')
  const row = { goods: { id: 1 }, current_low: 20, current_high: -1, suggested_low: 3, suggested_high: 30 }
  const kept = thresholdPreviewRow(row, { mode: 'suggest', low: '', high: '', keepExisting: true })
  assert.equal(kept.low, 20)
  assert.equal(kept.high, -1)
  assert.equal(kept.retained, true)
  const replaced = thresholdPreviewRow(row, { mode: 'suggest', low: '', high: '', keepExisting: false })
  assert.equal(replaced.low, 3)
  assert.equal(replaced.high, 30)
  const csv = thresholdPreviewCsv(['Code', 'Name', 'Threshold'], [['=2+3', 'A,"B"\nC', -1]])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"\'=2+3"'))
  assert.ok(csv.includes('"A,""B""\nC"'))
  assert.ok(csv.endsWith('"-1"'))
})

test('warehouse reload respects pending saves and cancelled drafts before allowing one confirmed unload', async () => {
  const listeners = new Set(), cleanup = [], routeGuards = []
  let saving = true, answer = false, prompts = 0
  const api = load('composables/useUnsavedForm', {
    useI18n: () => ({ t: key => key }), showToast: () => {},
    showConfirm: async () => { prompts++; return answer },
    onMounted: fn => fn(), onBeforeUnmount: fn => cleanup.push(fn),
    window: { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) },
  }, { 'vue-router': { onBeforeRouteLeave: fn => routeGuards.push(fn), onBeforeRouteUpdate: () => {} } })
  api.useUnsavedForm(() => true, () => saving)
  const unloadBlocked = () => {
    let blocked = false
    for (const listener of listeners) listener({ preventDefault: () => { blocked = true } })
    return blocked
  }
  assert.equal(await api.confirmUnsavedFormsForReload(), false)
  assert.equal(prompts, 0)
  saving = false
  assert.equal(await api.confirmUnsavedFormsForReload(), false)
  assert.equal(unloadBlocked(), true)
  answer = true
  assert.equal(await api.confirmUnsavedFormsForReload(), true)
  assert.equal(unloadBlocked(), false)
  const confirmedPrompts = prompts
  assert.equal(await routeGuards[0](), true)
  assert.equal(prompts, confirmedPrompts, 'logout navigation does not ask twice after confirmation')
  cleanup.forEach(fn => fn())
  assert.equal(listeners.size, 0)
  const previousPrompts = prompts
  assert.equal(await api.confirmUnsavedFormsForReload(), true)
  assert.equal(prompts, previousPrompts)
})

test('layout validation blocks invalid dimensions, rotated bounds and incomplete connector times', () => {
  const { layoutGeometryIssue } = load('utils/layoutValidation')
  const shape = { name: 'Rack', x: 8, y: 0, width: 2, height: 3, rotation: 0 }
  const floor = { name: '1F', width: 10, height: 10, objects: [shape] }
  assert.equal(layoutGeometryIssue([floor]), null)
  shape.width = 3; shape.height = 2; shape.rotation = 90
  assert.equal(layoutGeometryIssue([floor]).reason, 'bounds')
  shape.x = 7
  assert.equal(layoutGeometryIssue([floor]), null)
  for (const width of [0, -1, Infinity, NaN, '', 2001]) {
    assert.equal(layoutGeometryIssue([{ ...floor, width }]).reason, 'size')
  }
  assert.equal(layoutGeometryIssue([{ ...floor, name: ' ' }]).reason, 'name')
  shape.target_id = 'lift'
  assert.equal(layoutGeometryIssue([floor]).reason, 'connector')
  shape.travel_seconds = 0
  assert.equal(layoutGeometryIssue([floor]), null)
})

test('rack definitions reject duplicate codes and invalid dimensions across floors', () => {
  const { layoutGeometryIssue } = load('utils/layoutValidation')
  const rack = { type: 'rack', name: 'Rack', code: 'A', x: 0, y: 0, width: 2, height: 3, rotation: 0, columns: null, levels: 5 }
  const floor = { name: '1F', width: 10, height: 10, objects: [rack] }
  assert.equal(layoutGeometryIssue([floor]), null)
  for (const levels of [0, -1, 1.5, 1001, '', Infinity]) {
    assert.equal(layoutGeometryIssue([{ ...floor, objects: [{ ...rack, levels }] }]).reason, 'size')
  }
  assert.equal(layoutGeometryIssue([floor, { ...floor, name: '2F', objects: [{ ...rack, code: ' A ' }] }]).reason, 'name')
})

test('duplicate document lines share one available stock limit', () => {
  const { goodsExceedingStock } = load('utils/documentItems')
  const rows = [{ goods_id: 7, quantity: 20, max_qty: 40 }, { goods_id: 7, quantity: 21, max_qty: 40 }, { goods_id: 8, quantity: 30, max_qty: 30 }]
  assert.deepEqual(Array.from(goodsExceedingStock(rows)), [7])
  rows[1].quantity = 20
  assert.equal(goodsExceedingStock(rows).size, 0)
  rows[0].max_qty = 0
  assert.deepEqual(Array.from(goodsExceedingStock(rows)), [7])
  assert.equal(goodsExceedingStock([{ goods_id: 9, quantity: 3 }]).size, 0)
})

test('split putaway shares receipt capacity and reserves damaged stock correctly', () => {
  const { putawaySplitLimit } = load('composables/inventory/putawayStock')
  const pending = { total: 10, good: 6, damaged: 4 }
  assert.equal(putawaySplitLimit(pending, 'standard', [{quantity:4,locationType:'standard'}]),2)
  assert.equal(putawaySplitLimit(pending, 'standard', [{quantity:4,locationType:'damaged'}]),6)
  assert.equal(putawaySplitLimit(pending, 'standard', [{quantity:7,locationType:'damaged'}]),3)
  assert.equal(putawaySplitLimit(pending, 'damaged', [{quantity:6,locationType:'standard'}]),4)
  assert.equal(putawaySplitLimit(pending, 'return', [{quantity:5,locationType:'standard'},{quantity:5,locationType:'damaged'}]),0)
  assert.equal(putawaySplitLimit(pending, 'standard', [{quantity:20,locationType:'standard'}]),0)
})

test('picking paper preserves lots and shared stops, and falls back without losing unmapped stock', () => {
  const { pickingPrintPlan } = load('utils/pickingPrint')
  const row = (location_id, location, lot_id) => ({ location_id, location, lot_id, goods_id: 1, quantity: 2 })
  const source = { mode: 'suggestion', version: 3, issue: null, unmapped: [], shortages: [],
    station_id: 's', stations: [{ id: 's', name: 'Packing' }],
    stops: [{ id: 1, floor_name: '1F', items: [row(1, 'A', 1), row(1, 'A', 2)] },
      { id: 2, floor_name: '2F', items: [row(2, 'B', 1)] }],
    route: { legs: [{ stop_id: 2, distance: 10 }, { stop_id: 1, distance: 12 }],
      returning: { distance: 8 }, distance: 30, transfers: 2, unreachable: [] } }
  const plan = pickingPrintPlan(source)
  assert.equal(plan.routed, true)
  assert.deepEqual(Array.from(plan.rows, row => row.location), ['B', 'A', 'A'])
  assert.deepEqual(Array.from(plan.rows, row => row.stop), [1, 2, 2])
  assert.deepEqual(Array.from(plan.rows, row => row.next_distance), [12, 8, 8])
  assert.equal(plan.rows.reduce((sum, row) => sum + row.quantity, 0), 6)
  for (const patch of [{ unmapped: [row(3, 'C', 3)] }, { issue: 'no_return_path' },
    { route: { ...source.route, unreachable: [2] } }, { mode: 'record' }]) {
    const fallback = pickingPrintPlan({ ...source, ...patch })
    assert.equal(fallback.routed, false)
    assert.equal(fallback.distance, null)
    assert.equal(fallback.rows.length, patch.unmapped ? 4 : 3)
    assert.equal(fallback.rows[0].location, 'A')
    assert.equal(fallback.rows[0].stop, fallback.rows[1].stop)
  }
})

test('shipping actions distinguish packing, delivery and read-only roles', () => {
  const { shippingActionAllowed } = load('utils/shippingPermissions')
  const allowed = (role, action) => shippingActionAllowed(action, (...permissions) => permissions.includes(role))
  for (const action of ['edit_packages', 'create_waybill', 'issue_documents', 'record_pickup', 'complete_shipping', 'sign', 'refresh_tracking']) {
    assert.equal(allowed('delivery_read', action), false, action)
  }
  assert.equal(allowed('packing_edit', 'edit_packages'), true)
  assert.equal(allowed('delivery_edit', 'edit_packages'), false)
  assert.equal(allowed('packing_edit', 'complete_shipping'), false)
  assert.equal(allowed('delivery_edit', 'complete_shipping'), true)
  assert.equal(allowed('packing_edit', 'create_waybill'), true)
  assert.equal(allowed('delivery_edit', 'create_waybill'), true)
  assert.equal(allowed('dn_edit', 'create_waybill'), false)
  assert.equal(allowed('delivery_read', 'print_label'), true)
  assert.equal(allowed('delivery_read', 'unknown_action'), false)
})

test('bulk items preserve detail identity, merge remarks and restore this order reservation', () => {
  const { mergeDocumentItems, itemExceedsStock, invalidItemQuantity } = load('utils/documentItems')
  const existing = [{ id: 91, goods_id: 7, quantity: 3, remark: 'old' }]
  const preview = [{ lines: [1], code: 'G', quantity: 2, remark: 'new', error: null,
    goods: { goods_id: 7, code: 'G', name: 'Goods', available_stock_for_sale: 1 } }]
  const merged = mergeDocumentItems(existing, preview, 'add', { 7: 3 })
  assert.equal(merged[0].id, 91)
  assert.equal(merged[0].quantity, 5)
  assert.equal(merged[0].max_qty, 4)
  assert.equal(merged[0].remark, 'old；new')
  assert.equal(itemExceedsStock(merged[0]), true)
  assert.equal(existing[0].quantity, 3)
  assert.equal(mergeDocumentItems(existing, preview, 'keep')[0].quantity, 3)
  assert.equal(mergeDocumentItems([], [{ ...preview[0], error: 'INACTIVE' }], 'add').length, 0)
  for (const quantity of [0, -1, 1.5, NaN, 2147483648]) assert.equal(invalidItemQuantity({ quantity }), true)
})

test('document form and bulk import literal messages exist in all languages', () => {
  const files = ['components/warehouse/LocationWarehouseMap.vue','components/asn/AsnSpecCapture.vue','components/documents/CycleCountPrint.vue','components/reports/OperatorPhaseReport.vue','pages/reports/operator.vue','components/inventory/InventoryStockTrend.vue','components/inventory/LedgerOverview.vue','components/goods/LabelLotPicker.vue','components/goods/ProductLabel.vue','pages/goods/label/[id].vue','components/inventory/GoodsStockComposition.vue','components/inventory/GoodsAnalytics.vue','components/warehouse/WarehousePlans.vue','pages/location/label/[id].vue','components/warehouse/LocationMapPreview.vue','components/inventory/LocationActivity.vue','pages/warehouse/layout/[id].vue','components/reports/DocumentReport.vue','pages/reports/inventory.vue','pages/reports/stock-summary.vue','pages/dashboard/empty.vue','pages/admin/index.vue','components/documents/DocumentPrint.vue','pages/adjustment/add.vue','pages/authentication/reset-password.vue','components/auth/AuthFrame.vue','pages/auth/login.vue','pages/auth/forgot-password.vue','pages/admin/tenants/add.vue','pages/admin/tenants/[id].vue','components/admin/RoleManager.vue','pages/admin/permissions/index.vue','pages/admin/permissions/add.vue','pages/admin/permissions/[id].vue','pages/admin/tenants/index.vue','pages/admin/users/index.vue','pages/admin/settings/index.vue','pages/admin/logs/index.vue','pages/apikeys/index.vue','pages/webhook-logs/index.vue','pages/delivery/pickup.vue','pages/adjustment/detail/[id].vue','pages/delivery/index.vue','pages/delivery/detail/[id].vue','pages/cyclecount/add.vue','pages/cyclecount/detail/[id].vue','components/operations/InventoryTaskList.vue','pages/picking/detail/[id].vue','pages/packing/detail/[id].vue','components/operations/TaskList.vue','components/operations/CompactFlow.vue','pages/sorting/detail/[id].vue','components/carrier/CarrierForm.vue','components/carrier/CarrierMethodsCard.vue','components/carrier/CarrierIntegrationCard.vue','components/carrier/CarrierFileSettings.vue','pages/carrier/index.vue','pages/company/index.vue','components/staff/StaffForm.vue', 'pages/staff/index.vue', 'pages/department/index.vue', 'components/inventory/ThresholdEditor.vue', 'components/dn/DnForm.vue', 'components/documents/DocumentItemsImport.vue', 'components/asn/AsnForm.vue', 'pages/asn/index.vue', 'pages/asn/detail/[id].vue', 'pages/goods/index.vue', 'pages/goods/export.vue', 'pages/goods/upload.vue', 'components/goods/GoodsForm.vue', 'pages/inventory/index.vue', 'components/supplier/SupplierForm.vue', 'pages/supplier/index.vue', 'pages/goods/detail/[id].vue', 'components/recipient/RecipientForm.vue', 'pages/recipient/index.vue', 'pages/recipient/detail/[id].vue', 'components/common/StructuredAddressFields.vue', 'components/inventory/StockLedgerTable.vue', 'components/inventory/InventoryViewNav.vue', 'pages/inventory/ledger.vue', 'pages/inventory/by-location.vue', 'pages/inventory/history.vue', 'components/warehouse/WarehouseForm.vue', 'pages/warehouse/index.vue', 'pages/warehouse/detail/[id].vue', 'components/location/LocationForm.vue', 'pages/location/index.vue', 'pages/location/detail/[id].vue']
  for (const locale of ['zh-CN', 'en-US', 'ja-JP']) {
    const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../i18n/locales', locale + '.json')))
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, '../app', file), 'utf8')
      for (const [, key] of source.matchAll(/\bt\('([^']+)'\s*[,)]/g)) {
        assert.equal(typeof key.split('.').reduce((value, part) => value?.[part], messages), 'string', `${locale}: ${key}`)
      }
    }
  }
})

function load(file, globals = {}, imports = {}) {
  const tsPath = path.join(__dirname, '../app', file + '.ts')
  const source = fs.readFileSync(fs.existsSync(tsPath) ? tsPath : path.join(__dirname, '../app', file + '.js'), 'utf8')
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

test('task entries reject invalid rows before filtering and prevent completion with unsaved invalid input', () => {
  const {invalidTaskEntries, hasTaskEntry} = load('utils/taskQuantities')
  for (const kind of ['sorting', 'picking', 'packing']) {
    const field = {sorting:'new_sorted_quantity',picking:'new_picked_quantity',packing:'new_packed_quantity'}[kind]
    const base = kind === 'packing' ? {picked_quantity:10,old_packed_quantity:2} : {quantity:10}
    for (const value of [-1, 0.5, Infinity, NaN, 'invalid', 2147483648]) {
      assert.equal(invalidTaskEntries(kind, [{...base,[field]:1},{...base,[field]:value}]),true,`${kind}: ${value}`)
      assert.equal(hasTaskEntry([{[field]:value}],[field]),true)
    }
    assert.equal(invalidTaskEntries(kind,[{...base,[field]:2}]),false)
    assert.equal(hasTaskEntry([{[field]:''},{[field]:0}],[field]),false)
  }
  assert.equal(invalidTaskEntries('sorting',[{quantity:10,old_sorted_quantity:4,old_damage_quantity:2,new_sorted_quantity:3,new_damage_quantity:2}]),true)
  assert.equal(invalidTaskEntries('sorting',[{quantity:10,old_sorted_quantity:4,old_damage_quantity:2,new_sorted_quantity:3,new_damage_quantity:1}]),false)
  assert.equal(invalidTaskEntries('sorting',[{quantity:10,old_sorted_quantity:4,old_rejected_quantity:2,new_sorted_quantity:3,new_rejected_quantity:2}]),true)
  assert.equal(invalidTaskEntries('sorting',[{quantity:10,old_sorted_quantity:4,old_rejected_quantity:2,new_sorted_quantity:3,new_rejected_quantity:1}]),false)
  assert.equal(invalidTaskEntries('sorting',[{quantity:10,new_rejected_quantity:-1}]),true)
  assert.equal(invalidTaskEntries('picking',[{quantity:10,picked_quantity:2,old_picked_quantity:3,new_picked_quantity:6}]),true)
})

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

function flowHarness(getCurrentStaffInfo = async () => ({})) {
  const requests = []
  let dispose
  const id = vue.ref(1)
  const { useShippingFlowView } = load('composables/shipping/useShippingFlowView', {
    useI18n: () => ({ t: (key) => key, te: () => false, localeProperties: vue.ref({ iso: 'en' }) }),
    useBizError: () => ({ bizErrorMessage: (error) => error.message }),
    useStaffStore: () => ({ refreshed: true, staffInfo: {}, hasPermission: () => true, getCurrentStaffInfo }),
    onBeforeUnmount: (callback) => { dispose = callback },
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
  const view = useShippingFlowView({ dnId: id })
  return { id, requests, view, dispose }
}
const flow = (id, customs = false) => ({ id, dn_status: 'pending', route: { requires_customs: customs }, steps: [] })

test('failed refresh removes stale shipping and customs data; unmount ignores pending responses', async () => {
  const { requests, view, dispose } = flowHarness()
  const first = view.load()
  await new Promise(setImmediate)
  requests[0].complete(flow(1))
  await first
  assert.equal(view.flow.value.id, 1)
  const failed = view.load()
  await new Promise(setImmediate)
  requests[1].complete(null, { message: 'temporarily unavailable' })
  await failed
  assert.equal(view.flow.value, null)
  assert.equal(view.loadError.value, 'temporarily unavailable')
  view.customsView.value = { dn_id: 1 }
  const customs = view.loadCustoms()
  requests[2].complete(null, { message: 'customs unavailable' })
  await customs
  assert.equal(view.customsView.value, null)
  const pending = view.load()
  await new Promise(setImmediate)
  dispose()
  requests[3].complete(flow(1, true))
  await pending
  assert.equal(view.flow.value, null)
  assert.equal(requests.length, 4)
})

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
  await new Promise(setImmediate)
  id.value = 2
  view.reset()
  const current = view.load()
  await new Promise(setImmediate)
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
  await new Promise(setImmediate)
  const current = view.load()
  await new Promise(setImmediate)
  requests[1].complete(flow(1))
  await current
  requests[0].complete(null, { message: 'old request failed' })
  await old
  assert.equal(view.loadError.value, null)
  assert.equal(view.customsView.value, null)
  assert.equal(view.loading.value, false)
})


test('address patches preserve manual local and Latin addresses when structured fields change', () => {
  const { preserveAddressPatch } = load('utils/addressPatch')
  const record = { address: 'Manual address', address_en: 'Manual Latin address' }
  const changed = preserveAddressPatch({ address_line1: 'New street', latin: { locality: 'Tokyo' } }, record)
  assert.equal(changed.address, record.address)
  assert.equal(changed.address_en, record.address_en)
  assert.equal(changed.address_line1, 'New street')
  const phoneOnly = preserveAddressPatch({ phone: '123' }, record)
  assert.equal(Object.hasOwn(phoneOnly, 'address'), false)
  const taxOnly = preserveAddressPatch({ tax_id: 'DE123' }, record)
  assert.equal(Object.hasOwn(taxOnly, 'address'), false)
})


test('goods labels use EAN check digits and preserve non-Latin codes', () => {
  const { goodsBarcodeFormat } = load('utils/goodsBarcode')
  assert.equal(goodsBarcodeFormat('4912345678904'), 'EAN13')
  assert.equal(goodsBarcodeFormat('4900000000205'), 'CODE128')
  assert.equal(goodsBarcodeFormat('000123456789'), 'CODE128')
  assert.equal(goodsBarcodeFormat('G001'), 'CODE128')
  assert.equal(goodsBarcodeFormat('棚-甲-A1'), 'QR')
})


test('reference label barcode geometry agrees with the independent encoder', () => {
 const {referenceGoodsBarcode}=load('utils/referenceGoodsBarcode')
 const JsBarcode=require('jsbarcode')
 for(const code of ['G001','4900000000205','4912345678904','12345678']) {
  const result=referenceGoodsBarcode(code),ean=result.format==='EAN13'
  const total=ean?113:Math.round(parseFloat(result.w)/2.42)
  const ranges=[...result.d.matchAll(/M([\d.]+) 0h([\d.]+)/g)].map(m=>[Number(m[1]),Number(m[1])+Number(m[2])])
  const bits=Array.from({length:total},(_,i)=>ranges.some(([a,b])=>1000*(i+.5)/total>a&&1000*(i+.5)/total<b)?'1':'0').join('')
  const output={};JsBarcode(output,code,{format:ean?'EAN13':'CODE128'})
  const encoded=output.encodings.map(row=>row.data).join('')
  const payload=bits.slice(ean?11:10,total-(ean?7:10))
  if(ean) assert.equal(payload,encoded.replace(/^0+/,'').replace(/0+$/,''))
  else {
   const patterns=require('jsbarcode/bin/barcodes/CODE128/constants').BARS.map(String)
   assert.equal(payload.slice(-13),patterns[106])
   const symbols=payload.slice(0,-13).match(/.{11}/g).map(part=>patterns.indexOf(part))
   assert.ok(symbols.every(value=>value>=0))
   const checksum=symbols.pop()
   assert.equal(symbols.reduce((sum,value,i)=>sum+value*(i||1),0)%103,checksum)
   let set=symbols.shift()===105?'C':'B',decoded=''
   for(const value of symbols){if(value===100){set='B';continue}if(value===99){set='C';continue}decoded+=set==='C'?String(value).padStart(2,'0'):String.fromCharCode(value+32)}
   assert.equal(decoded,code)
  }
 }
})


test('ledger ranges follow warehouse midnight, month boundaries and leap years', () => {
  const { ledgerDateRange } = load('utils/ledgerDateRange')
  const instant = new Date('2026-01-01T00:30:00Z')
  assert.equal(ledgerDateRange('today', 'America/Los_Angeles', instant).start_time, '2025-12-31')
  assert.equal(ledgerDateRange('today', 'Asia/Tokyo', instant).start_time, '2026-01-01')
  assert.deepEqual(JSON.parse(JSON.stringify(ledgerDateRange('previous', 'UTC', new Date('2024-03-15T00:00:00Z')))), {start_time:'2024-02-01',end_time:'2024-02-29'})
  assert.equal(ledgerDateRange('week','UTC',instant).start_time,'2025-12-26')
})


test('arrival timeline tick dates and marker coordinates share bounds across months', () => {
  const { reportTimeline } = load('utils/reportTimeline')
  const timeline = reportTimeline('2026-01-01', '2026-01-31', '2026-03-01', [{planned:'2026-01-31',actual_date:'2026-02-10'}])
  assert.equal(timeline.ticks[0].date, '2025-12-31')
  assert.equal(timeline.ticks.at(-1).date, '2026-03-02')
  assert.ok(timeline.ticks.length <= 7)
  for (const tick of timeline.ticks) {
    const day = Date.parse(tick.date + 'T00:00:00Z') / 86400000
    assert.equal(tick.percent, (day - timeline.min) / (timeline.max - timeline.min) * 100)
  }
  const leap = reportTimeline('2024-02-29','2024-02-29','2024-02-29',[])
  assert.deepEqual(Array.from(leap.ticks, t => t.date), ['2024-02-28','2024-02-29','2024-03-01'])
  assert.equal(reportTimeline('bad','bad','bad',[{planned:null}]),null)
})


test('stock trend preserves known zeros and breaks lines across unavailable history', () => {
  const {stockTrendChart} = load('utils/stockTrendChart')
  const result=stockTrendChart([{date:'1',total:0,coverage:'none'},{date:'2',total:0,coverage:'full'},
    {date:'3',total:99,coverage:'none'},{date:'4',total:5,coverage:'on_shelf_only'}])
  assert.equal(result.max,5)
  assert.equal(result.points.length,2)
  assert.equal(result.points[0].x,200)
  assert.equal(result.points[0].y,160)
  assert.equal(result.line.trim(),'M200 160  M600 20')
  assert.equal(result.last,5)
  assert.equal(stockTrendChart([{date:'1',total:0,coverage:'none'}]),null)
})


test('outbound calendar includes empty dates and uses UTC weekends across leap days', () => {
  const {outboundDays} = load('utils/outboundDays')
  const days = outboundDays('2024-02-28', '2024-03-03', [{date:'2024-03-01',documents:2,actual:8,units:[{id:4}]}])
  assert.equal(days.length,5)
  assert.equal(days[1].date,'2024-02-29')
  assert.equal(days[0].documents,0)
  assert.equal(days[2].actual,8)
  assert.equal(days[2].weekend,false)
  assert.equal(days[3].weekend,true)
  assert.equal(days[4].weekend,true)
  assert.equal(outboundDays('invalid','2024-03-01',[]).length,0)
})


test('lead chart leaves incomplete stages unpainted and retains whole-cohort references', () => {
  const {leadTimeChart}=load('utils/leadTimeChart')
  const chart=leadTimeChart([{id:1,lead_hours:{pick:12,pack:0,handover:12,total:24}},{id:2,lead_hours:{pick:null,pack:2,handover:3,total:30}},{id:3,lead_hours:{pick:1,pack:2,handover:3,total:20}}],{median_hours:48,p90_hours:96})
  assert.equal(chart.maximum,96)
  assert.equal(chart.rows[0].complete,true)
  assert.equal(chart.rows[1].segments.length,0)
  assert.equal(chart.rows[2].segments.length,0)
  assert.equal(chart.references[0].percent,50)
  assert.equal(chart.references[1].percent,100)
  assert.equal(chart.ticks[4].hours,96)
})

test('webhook references accept known payloads and never turn arbitrary payload values into URLs', () => {
  const {webhookReference} = load('utils/webhookReference')
  for (const kind of ['asn', 'dn', 'goods']) {
    assert.deepEqual({...webhookReference({event_type:kind+'.completed',payload:{[kind+'_id']:12}})},
      {label:kind.toUpperCase()+'-12',to:'/'+kind+'/detail/12',permission:kind+'_read'})
  }
  for (const id of [null, true, 0, -1, 1.5, '../1', 'https://example.com', '9007199254740993']) {
    assert.equal(webhookReference({event_type:'dn.delivered',payload:{dn_id:id}}),null)
  }
  assert.equal(webhookReference({event_type:'unknown',payload:{dn_id:1}}),null)
  assert.equal(webhookReference({event_type:'dn.delivered',payload:null}),null)
  assert.equal(webhookReference({event_type:'dn.delivered',payload:{asn_id:1}}),null)
})

test('operator charts keep zero quantity, omit untimed tasks and align UTC dates', () => {
  const {operatorChart}=load('utils/operatorChart')
  const chart=operatorChart({start_date:'2024-02-28',end_date:'2024-03-01',items:[{operator_id:2,daily:[{date:'2024-02-29',quantity:7}]}],task_chart:{median_per_hour:30,items:[{id:1,quantity:0,seconds:60,operators:[{id:2,name:'A'}]},{id:2,quantity:20,seconds:1200,operators:[{id:2,name:'A'},{id:3,name:'B'}]},{id:3,quantity:4,seconds:null,operators:[]}]}})
  assert.equal(chart.points.length,2)
  assert.equal(chart.points[0].x,0)
  assert.equal(chart.days[1],'2024-02-29')
  assert.equal(chart.daily[2]['2024-02-29'],7)
  assert.equal(chart.operators.length,2)
  assert.ok(chart.median.x>=0&&chart.median.x<=100&&chart.median.y>=0&&chart.median.y<=100)
  assert.ok(chart.points.every(p=>p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100))
  assert.equal(operatorChart({start_date:'bad',end_date:'bad',items:[],task_chart:{items:[],median_per_hour:0}}).median,null)
})


test('printed carton totals preserve unknown assignments and dimensions', () => {
  const { packagePrintSummary } = load('utils/packagePrint')
  const a={contents:[{quantity:2}],gross_weight_kg:1.5,length_mm:100,width_mm:200,height_mm:300}
  const b={...a,contents:null,gross_weight_kg:null,length_mm:null}
  const mixed=packagePrintSummary([a,b])
  assert.equal(mixed.quantity,null)
  assert.equal(mixed.grossWeight,null)
  assert.equal(mixed.volume,null)
  const known=packagePrintSummary([a,a])
  assert.equal(known.quantity,4)
  assert.equal(known.grossWeight,3)
  assert.equal(known.volume,0.012)
  assert.equal(packagePrintSummary([]).quantity,null)
})


test('PDA manifest reads only release metadata and validates URL, dates, numbers and hash', () => {
  const api = load('utils/pdaManifest', { URL })
  assert.equal(api.pdaManifestUrl('https://download.example/apps/gm_wms.apk?token=abc', 'https://wms.example'), 'https://download.example/apps/gm_wms.json')
  assert.equal(api.pdaManifestUrl('/downloads/pda.apk', 'https://wms.example'), 'https://wms.example/downloads/gm_wms.json')
  for (const url of ['javascript:alert(1)', '//evil.test/a.apk', 'https://user:pass@example.test/a.apk', 'relative.apk']) assert.throws(() => api.pdaManifestUrl(url, 'https://wms.example'))
  const result = api.parsePdaManifest({versionName:'v1.4.2',versionCode:14,releasedAt:'2026-10-31T13:21:00+09:00',sizeBytes:1234,sha256:'AB'.repeat(32),url:'https://evil.test/replace.apk',minimumVersion:'999.0'})
  assert.equal(result.version, '1.4.2')
  assert.equal(result.versionCode, 14)
  assert.equal(result.releaseDate, '2026-10-31')
  assert.equal(result.sha256, 'ab'.repeat(32))
  assert.equal(result.url, undefined)
  assert.equal(result.minimumVersion, undefined)
  assert.equal(api.parsePdaManifest({version:'1.5'}).sha256, '')
  for (const patch of [{version:'bad'},{versionCode:true},{sizeBytes:1.5},{sizeBytes:10737418241},{sha256:'bad'},{releaseDate:'2026-02-30'},{releasedAt:'2026-02-30T01:00:00Z'},{releasedAt:'2026-10-31T13:21:00'}]) assert.throws(() => api.parsePdaManifest({version:'1.4.2',...patch}))
})


test('picking print fallback respects manual sequence and natural code ties without losing rows', () => {
  const {pickingPrintPlan}=load('utils/pickingPrint')
  const source={mode:'suggestion',issue:'route_disabled',picking_sort:'manual',stops:[],unmapped:[
    {location:'A-2',location_id:2,goods_id:1,quantity:1},
    {location:'A-10',location_id:10,goods_id:1,quantity:1,picking_order:1},
    {location:'A-3',location_id:3,goods_id:1,quantity:1,picking_order:1},
  ]}
  assert.equal(pickingPrintPlan(source).rows.map(row=>row.location).join(','),'A-3,A-10,A-2')
  assert.equal(pickingPrintPlan({...source,picking_sort:'code'}).rows.map(row=>row.location).join(','),'A-2,A-3,A-10')
})


test('location code hints use longest published rack code and reject ambiguous or out-of-range matches', () => {
  const { locationRackMatch } = load('utils/locationRackMatch')
  const a={id:'a',code:'A',name:'A',floor_name:'1F',levels:20}, b={id:'b',code:'A-01',name:'B',floor_name:'1F',levels:5}
  assert.equal(locationRackMatch([a,b],{code:'A-01-3'}).rack.id,'b')
  assert.equal(locationRackMatch([a,b],{code:'A-01-6'}),null)
  assert.equal(locationRackMatch([b,{...b,id:'c'}],{code:'A-01-3'}),null)
  assert.equal(locationRackMatch([a,b],{code:'A-01-3',map_rack_id:'missing'}),null)
  assert.equal(locationRackMatch([a,b],{code:'A-01-3',map_rack_id:'a'}).rack.id,'a')
})


test('fresh permission failure blocks shipping reads and clears cached data', async () => {
  const { requests, view } = flowHarness(async () => null)
  view.customsView.value = { dn_id: 1 }
  await view.load()
  assert.equal(requests.length, 0)
  assert.equal(view.flow.value, null)
  assert.equal(view.customsView.value, null)
  assert.equal(view.loading.value, false)
  assert.ok(view.loadError.value)
})

test('leaving during permission refresh prevents a late shipping request', async () => {
  let finish
  const { requests, view, dispose } = flowHarness(() => new Promise(resolve => { finish = resolve }))
  const pending = view.load()
  dispose()
  finish({})
  await pending
  assert.equal(requests.length, 0)
})
