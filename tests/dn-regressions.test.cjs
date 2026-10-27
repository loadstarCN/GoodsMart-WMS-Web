const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

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
  const files = ['components/documents/CycleCountPrint.vue','components/reports/OperatorPhaseReport.vue','pages/reports/operator.vue','components/inventory/InventoryStockTrend.vue','components/inventory/LedgerOverview.vue','components/goods/LabelLotPicker.vue','components/goods/ProductLabel.vue','pages/goods/label/[id].vue','components/inventory/GoodsStockComposition.vue','components/inventory/GoodsAnalytics.vue','components/warehouse/WarehousePlans.vue','pages/location/label/[id].vue','components/warehouse/LocationMapPreview.vue','components/inventory/LocationActivity.vue','pages/warehouse/layout/[id].vue','components/reports/DocumentReport.vue','pages/reports/inventory.vue','pages/reports/stock-summary.vue','pages/dashboard/empty.vue','pages/admin/index.vue','components/documents/DocumentPrint.vue','pages/adjustment/add.vue','pages/authentication/reset-password.vue','components/auth/AuthFrame.vue','pages/auth/login.vue','pages/auth/forgot-password.vue','pages/admin/tenants/add.vue','pages/admin/tenants/[id].vue','components/admin/RoleManager.vue','pages/admin/permissions/index.vue','pages/admin/permissions/add.vue','pages/admin/permissions/[id].vue','pages/admin/tenants/index.vue','pages/admin/users/index.vue','pages/admin/settings/index.vue','pages/admin/logs/index.vue','pages/apikeys/index.vue','pages/webhook-logs/index.vue','pages/delivery/pickup.vue','pages/adjustment/detail/[id].vue','pages/delivery/index.vue','pages/delivery/detail/[id].vue','pages/cyclecount/add.vue','pages/cyclecount/detail/[id].vue','components/operations/InventoryTaskList.vue','pages/picking/detail/[id].vue','pages/packing/detail/[id].vue','components/operations/TaskList.vue','components/operations/CompactFlow.vue','pages/sorting/detail/[id].vue','components/carrier/CarrierForm.vue','components/carrier/CarrierMethodsCard.vue','components/carrier/CarrierIntegrationCard.vue','components/carrier/CarrierFileSettings.vue','pages/carrier/index.vue','pages/company/index.vue','components/staff/StaffForm.vue', 'pages/staff/index.vue', 'pages/department/index.vue', 'components/inventory/ThresholdEditor.vue', 'components/dn/DnForm.vue', 'components/documents/DocumentItemsImport.vue', 'components/asn/AsnForm.vue', 'pages/asn/index.vue', 'pages/asn/detail/[id].vue', 'pages/goods/index.vue', 'pages/goods/export.vue', 'pages/goods/upload.vue', 'components/goods/GoodsForm.vue', 'pages/inventory/index.vue', 'components/supplier/SupplierForm.vue', 'pages/supplier/index.vue', 'pages/goods/detail/[id].vue', 'components/recipient/RecipientForm.vue', 'pages/recipient/index.vue', 'pages/recipient/detail/[id].vue', 'components/common/StructuredAddressFields.vue', 'components/inventory/StockLedgerTable.vue', 'components/inventory/InventoryViewNav.vue', 'pages/inventory/ledger.vue', 'pages/inventory/by-location.vue', 'pages/inventory/history.vue', 'components/warehouse/WarehouseForm.vue', 'pages/warehouse/index.vue', 'pages/warehouse/detail/[id].vue', 'components/location/LocationForm.vue', 'pages/location/index.vue', 'pages/location/detail/[id].vue']
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
