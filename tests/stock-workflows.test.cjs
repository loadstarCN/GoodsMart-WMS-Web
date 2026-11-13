const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { parse, compileTemplate } = require('@vue/compiler-sfc')

function component(file, exposed, overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../app/components', file), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file })
  assert.deepEqual(template.errors, [])
  const warehouse = vue.reactive({ currentWarehouse: { id: 1 }, warehouses: [{ id: 1, name: 'Source' }, { id: 2, name: 'Destination' }], fetchWarehouses: async () => {} })
  const route = { query: {} }
  let id = 0
  const sandbox = {
    ...vue, console, defineProps: () => ({ kind: 'transfers' }),
    useI18n: () => ({ t: key => key }),
    useStaffStore: () => ({ refreshed: true, hasPermission: () => true, getCurrentStaffInfo: async () => ({}) }),
    useWarehouseStore: () => warehouse,
    useBizError: () => ({ bizErrorMessage: e => e.message }),
    useRoute: () => route, useRouter: () => ({ replace: async value => { route.query = value.query } }),
    useUnsavedForm: () => {}, useHead: () => {}, onMounted: () => {}, onBeforeUnmount: () => {},
    warehouseHeaders: id => ({ 'X-WAREHOUSE-ID': String(id) }),
    crypto: { randomUUID: () => `stable-request-${++id}` },
    httpRequest: async () => ({ items: [], pages: 1 }),
    ...overrides,
  }
  const code = ts.transpileModule(descriptor.scriptSetup.content + `\nglobalThis.exposed = {${exposed}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, sandbox)
  return { ...sandbox.exposed, warehouse, route }
}

test('uncertain responses reuse the same operation ID; changed quantities use a new ID', async () => {
  const requests = []
  const ui = component('operations/StockOperations.vue', 'submit,busy', {
    httpRequest: async (url, options) => { requests.push({ url, ...options }); options.onError({ message: 'Connection interrupted' }); return null },
  })
  await ui.submit('/api/warehouse/transfer/orders/1/receive', { reason: 'Receive', lines: [{ id: 1, quantity: 2 }] }, 2)
  await ui.submit('/api/warehouse/transfer/orders/1/receive', { reason: 'Receive', lines: [{ id: 1, quantity: 2 }] }, 2)
  await ui.submit('/api/warehouse/transfer/orders/1/receive', { reason: 'Receive', lines: [{ id: 1, quantity: 3 }] }, 2)
  assert.equal(requests[0].body.request_id, requests[1].body.request_id)
  assert.notEqual(requests[1].body.request_id, requests[2].body.request_id)
  assert.equal(requests[0].headers['X-WAREHOUSE-ID'], '2')
  assert.equal(ui.busy.value, false)
})

test('source operators dispatch and destination operators receive', async () => {
  const ui = component('operations/StockOperations.vue', 'selected,canShip,canReceive')
  ui.selected.value = { source_warehouse_id: 1, destination_warehouse_id: 2 }
  assert.equal(ui.canShip.value, true)
  assert.equal(ui.canReceive.value, false)
  ui.warehouse.currentWarehouse.id = 2
  assert.equal(ui.canReceive.value, true)
  assert.equal(ui.canShip.value, false)
  await vue.nextTick()
})

test('a stale list response cannot replace the latest page', async () => {
  const pending = []
  const ui = component('operations/StockOperations.vue', 'load,docs,page,loading', {
    httpRequest: () => new Promise(resolve => pending.push(resolve)),
  })
  const first = ui.load()
  ui.page.value = 2
  const second = ui.load()
  pending[1]({ items: [{ id: 2 }], pages: 2 })
  await second
  pending[0]({ items: [{ id: 1 }], pages: 2 })
  await first
  assert.equal(ui.docs.value[0].id, 2)
  assert.equal(ui.loading.value, false)
})

test('stock ledger links can open an older document outside the current list page', async () => {
  const ui = component('operations/StockOperations.vue', 'load,selected,operation', {
    useRoute: () => ({ query: { id: '45' } }),
    httpRequest: async url => url.endsWith('/45') ? { id: 45, lines: [{ id: 90 }] } : { items: [], pages: 1 },
  })
  await ui.load()
  assert.equal(ui.selected.value.id, 45)
  assert.equal(ui.operation.line_id, 90)
})

test('closing lot control preserves the reason until the user confirms discarding it', async () => {
  let confirmed = false
  const model = vue.ref(true)
  const ui = component('goods/LotControl.vue', 'setOpen,reason,open', {
    defineProps: () => ({ goodsId: 1, lot: { id: 2 } }),
    defineModel: () => model, defineEmits: () => () => {},
    showConfirm: async () => confirmed,
  })
  ui.reason.value = 'Inspection note in progress'
  await ui.setOpen(false)
  assert.equal(ui.open.value, true)
  assert.equal(ui.reason.value, 'Inspection note in progress')
  confirmed = true
  await ui.setOpen(false)
  assert.equal(ui.open.value, false)
})
