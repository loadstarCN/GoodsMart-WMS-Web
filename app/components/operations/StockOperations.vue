<script setup lang="ts">
const props = defineProps<{ kind: "transfers" | "returns" }>();
const { t } = useI18n(),
  staff = useStaffStore(),
  warehouse = useWarehouseStore(),
  { bizErrorMessage } = useBizError();
const isTransfer = computed(() => props.kind === "transfers");
const base = computed(
  () =>
    "/api/warehouse/" + (isTransfer.value ? "transfer/orders" : "asn/returns"),
);
const docs = ref<any[]>([]),
  selected = ref<any>(null),
  loading = ref(true),
  busy = ref(false),
  error = ref(""),
  creating = ref(false);
const form = reactive<any>({
  warehouse_id: null,
  destination_warehouse_id: null,
  original_dn_id: null,
  recipient_id: null,
  reason: "",
  exception_reason: "",
});
const draft = ref<any[]>([]),
  line = reactive<any>({
    goods_id: null,
    lot_id: null,
    source_location_id: null,
    quantity: 1,
  });
const labels = reactive<any>({ goods: "", lot: "", location: "" });
const operation = reactive<any>({
  line_id: null,
  quantity: 1,
  location_id: null,
  target_location_id: null,
  action: "restock",
  supplier_id: null,
  supplier_recipient_id: null,
  reason: "",
});
const reviewReason = ref(""),
  requestIds = new Map<string, string>();
const page = ref(1),
  pages = ref(1),
  keyword = ref("");
const route=useRoute(),router=useRouter();
let generation = 0;
const canCreate = computed(
  () =>
    staff.refreshed &&
    staff.hasPermission(isTransfer.value ? "transfer_edit" : "asn_edit"),
);
const canInspect = computed(
  () =>
    staff.refreshed &&
    staff.hasPermission("inventory_edit") &&
    staff.hasPermission("asn_edit"),
);
const canReview = computed(
  () => staff.refreshed && staff.hasPermission("adjustment_approve"),
);
const warehouseOptions = computed(() =>
  warehouse.warehouses.map((w) => ({ value: w.id, label: w.name })),
);
const documentLines = computed(() =>
  (selected.value?.lines || []).map((r: any) => ({
    value: r.id,
    label: [r.goods_code, r.lot_no, r.source_location_code]
      .filter(Boolean)
      .join(" · "),
  })),
);
const selectedLine = computed(() =>
  selected.value?.lines.find((r: any) => r.id === Number(operation.line_id)),
);
const holdings = computed(() =>
  (selectedLine.value?.holdings || []).map((h: any) => ({
    value: h.location_id,
    label: `${h.location_code} · ${h.quantity}`,
  })),
);
const dispositionOptions = computed(() =>
  ["restock", "damaged", "repair", "scrap", "supplier_return"].map((value) => ({
    value,
    label: t("stock-operations." + value),
  })),
);
const active = computed(
  () =>
    selected.value &&
    !["completed", "cancelled"].includes(selected.value.status),
);
const currentId = computed(() =>
  Number(warehouse.currentWarehouse?.id || form.warehouse_id),
);
const canShip = computed(
  () =>
    canCreate.value && currentId.value === selected.value?.source_warehouse_id,
);
const canReceive = computed(
  () =>
    canCreate.value &&
    currentId.value ===
      (isTransfer.value
        ? selected.value?.destination_warehouse_id
        : selected.value?.warehouse_id),
);
const dirty = computed(
  () =>
    draft.value.length > 0 ||
    !!form.reason ||
    !!operation.reason ||
    !!reviewReason.value,
);
useUnsavedForm(
  () => dirty.value || busy.value,
  () => busy.value,
);
const field = (key: string) => t("stock-operations." + key);
async function search(
  kind: string,
  keyword: string,
  extra: Record<string, any> = {},
  wid = form.warehouse_id,
) {
  const result = await httpRequest<any>("/api/warehouse/" + kind + "/", {
    params: { keyword, per_page: 50, ...extra },
    headers: warehouseHeaders(wid),
    onError: (e) => (error.value = bizErrorMessage(e)),
  });
  return (result?.items || []).map((r: any) => ({
    value: r.id,
    label: r.code ? `${r.code} · ${r.name || ""}` : r.name || `DN-${r.id}`,
    description: r.address || "",
    record: r,
  }));
}
const goodsSearch = (q: string) => search("goods", q);
const locationSearch = (q: string, wid: number, type?: string) =>
  search("location", q, { code: q, location_type: type, is_active: true }, wid);
const lotSearch = async (q: string) => {
  if (!line.goods_id) return [];
  const res = await httpRequest<any>(
    `/api/warehouse/goods/${line.goods_id}/lots`,
    {
      params: { keyword: q },
      headers: warehouseHeaders(form.warehouse_id),
      onError: (e) => (error.value = bizErrorMessage(e)),
    },
  );
  return (res?.items || []).map((r: any) => ({
    value: r.id,
    label: r.lot_no,
    description: r.expiry_date || "",
  }));
};
const dnSearch = async (q: string) =>
  (await search("dn", q)).filter(
    (o: any) =>
      ["delivered", "completed"].includes(o.record.status) &&
      o.record.dn_type === "shipping",
  );
async function load() {
  const seq = ++generation;
  loading.value = true;
  error.value = "";
  const result = await httpRequest<any>(base.value, {
    params: { page: page.value, per_page: 25, keyword: keyword.value },
    onError: (e) => {
      if (seq === generation) error.value = bizErrorMessage(e);
    },
  });
  if (seq !== generation) return;
  docs.value = result?.items || [];
  pages.value = result?.pages || 1;
  const ident=selected.value?.id||Number(route.query.id);
  if(ident){const current=await httpRequest<any>(`${base.value}/${ident}`,{onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(seq!==generation)return;selected.value=current;if(!operation.line_id)operation.line_id=current?.lines[0]?.id??null;}
  loading.value = false;
}
async function choose(doc: any) {
  if (busy.value) return;
  if (
    dirty.value &&
    !(await wConfirm({
      title: t("unsaved-form.title"),
      message: t("unsaved-form.message"),
      confirmText: t("unsaved-form.leave"),
      cancelText: t("unsaved-form.stay"),
    }))
  )
    return;
  draft.value = [];
  form.reason = "";
  operation.reason = "";
  reviewReason.value = "";
  creating.value = false;
  selected.value = doc;
  await router.replace({query:{...route.query,id:String(doc.id)}});
  operation.line_id = doc.lines[0]?.id ?? null;
  operation.location_id = null;
  operation.target_location_id = null;
}
async function submit(path: string, payload: any, wid: number) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const key = path + JSON.stringify(payload);
  if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID());
  try {
    const result = await httpRequest<any>(path, {
      method: "POST",
      headers: warehouseHeaders(wid),
      body: { ...payload, request_id: requestIds.get(key) },
      onError: (e) => (error.value = bizErrorMessage(e)),
    });
    if (result) {
      requestIds.delete(key);
      selected.value = result;
      operation.reason = "";
      reviewReason.value = "";
      await load();
      return result;
    }
  } finally {
    busy.value = false;
  }
}
function addLine() {
  if (
    !line.goods_id ||
    !Number.isSafeInteger(Number(line.quantity)) ||
    Number(line.quantity) <= 0 ||
    (isTransfer.value && !line.source_location_id)
  ) {
    error.value = t("common.validation.quantity-invalid");
    return;
  }
  draft.value.push({
    ...line,
    quantity: Number(line.quantity),
    name: labels.goods,
    lot: labels.lot,
    location: labels.location,
  });
  Object.assign(line, {
    goods_id: null,
    lot_id: null,
    source_location_id: null,
    quantity: 1,
  });
  Object.assign(labels, { goods: "", lot: "", location: "" });
  error.value = "";
}
async function create() {
  if (!draft.value.length || !form.reason.trim()) return;
  const payload = isTransfer.value
    ? {
        source_warehouse_id: form.warehouse_id,
        destination_warehouse_id: form.destination_warehouse_id,
        reason: form.reason,
        lines: draft.value.map(
          ({ goods_id, lot_id, source_location_id, quantity }) => ({
            goods_id,
            lot_id,
            source_location_id,
            quantity,
          }),
        ),
      }
    : {
        warehouse_id: form.warehouse_id,
        original_dn_id: form.original_dn_id,
        recipient_id: form.recipient_id,
        reason: form.reason,
        exception_reason: form.exception_reason,
        lines: draft.value.map(({ goods_id, lot_id, quantity }) => ({
          goods_id,
          lot_id,
          quantity,
        })),
      };
  const result = await submit(base.value, payload, form.warehouse_id);
  if (result) {
    draft.value = [];
    form.reason = "";
    form.exception_reason = "";
    creating.value = false;
    operation.line_id = result.lines[0]?.id;
  }
}
async function act(action: string) {
  if (!selected.value || !operation.reason.trim()) return;
  let payload: any = { reason: operation.reason };
  if (action !== "cancel") {
    if (
      !operation.line_id ||
      !Number.isSafeInteger(Number(operation.quantity)) ||
      Number(operation.quantity) <= 0
    ) {
      error.value = t("common.validation.quantity-invalid");
      return;
    }
    payload.lines = [
      {
        id: operation.line_id,
        quantity: Number(operation.quantity),
        ...(action === "receive" ? { location_id: operation.location_id } : {}),
      },
    ];
  }
  const wid = isTransfer.value
    ? action === "receive"
      ? selected.value.destination_warehouse_id
      : selected.value.source_warehouse_id
    : selected.value.warehouse_id;
  await submit(`${base.value}/${selected.value.id}/${action}`, payload, wid);
}
async function propose() {
  if (!operation.reason.trim()) return;
  await submit(
    `${base.value}/${selected.value.id}/propose`,
    { ...operation, quantity: Number(operation.quantity) },
    selected.value.warehouse_id,
  );
}
async function review(decision: any, approve: boolean) {
  if (!reviewReason.value.trim()) return;
  await submit(
    `${base.value}/${selected.value.id}/dispositions/${decision.id}/review`,
    { approve, reason: reviewReason.value },
    selected.value.warehouse_id,
  );
}
watch(
  () => operation.line_id,
  () => {
    operation.location_id = null;
    operation.target_location_id = null;
  },
);
watch(
  () => line.goods_id,
  () => {
    line.lot_id = null;
    labels.lot = "";
  },
);
watch(
  () => warehouse.currentWarehouse?.id,
  () => {
    selected.value = null;
    page.value = 1;
    load();
  },
);
onMounted(async () => {
  await staff.getCurrentStaffInfo();
  await warehouse.fetchWarehouses();
  form.warehouse_id =
    warehouse.currentWarehouse?.id || warehouse.warehouses[0]?.id;
  await load();
});
onBeforeUnmount(() => generation++);
useHead({ title: () => field(props.kind) });
</script>
<template>
  <main class="stock-operations w-scope">
    <header>
      <h1>{{ field(kind) }}</h1>
      <WButton :disabled="loading || busy" @click="load">{{
        field("refresh")
      }}</WButton
      ><WButton
        v-if="canCreate"
        :disabled="busy"
        @click="creating = !creating"
        >{{ field("new") }}</WButton
      >
    </header>
    <p>{{ field(isTransfer ? "transfer-help" : "return-help") }}</p>
    <WAlert v-if="error" tone="block" :title="error" />
    <WCard v-if="creating && canCreate"
      ><h2>{{ field("new") }}</h2>
      <fieldset :disabled="busy">
        <WFormGrid
          ><WField :label="t('nav.warehouse')"
            ><WSelect
              v-model="form.warehouse_id"
              :options="warehouseOptions"
              :disabled="draft.length > 0" /></WField
          ><WField v-if="isTransfer" :label="field('destination')"
            ><WSelect
              v-model="form.destination_warehouse_id"
              :options="
                warehouseOptions.filter((w) => w.value !== form.warehouse_id)
              " /></WField
          ><template v-else
            ><WField :label="field('original-dn')" optional
              ><WCombobox
                v-model="form.original_dn_id" clearable
                :search="dnSearch" /></WField
            ><WField v-if="!form.original_dn_id" :label="t('nav.recipient')"
              ><WCombobox
                v-model="form.recipient_id"
                :search="(q) => search('recipient', q)" /></WField
            ><WField
              v-if="!form.original_dn_id"
              :label="field('exception-reason')"
              ><WInput
                v-model="form.exception_reason"
                :maxlength="255" /></WField></template
          ><WField :label="t('common.fields.reason')"
            ><WInput v-model="form.reason" :maxlength="255" /></WField
        ></WFormGrid>
        <WFormGrid
          ><WField :label="t('nav.goods')"
            ><WCombobox
              v-model="line.goods_id"
              :search="goodsSearch"
              :selected-label="labels.goods"
              @select="(o) => (labels.goods = o?.label || '')" /></WField
          ><WField :label="t('goods-label.lot')" optional
            ><WCombobox
              v-model="line.lot_id" clearable
              :search="lotSearch"
              :selected-label="labels.lot"
              :disabled="!line.goods_id"
              @select="(o) => (labels.lot = o?.label || '')" /></WField
          ><WField v-if="isTransfer" :label="field('source-location')"
            ><WCombobox
              v-model="line.source_location_id"
              :search="(q) => locationSearch(q, form.warehouse_id, 'standard')"
              :selected-label="labels.location"
              @select="(o) => (labels.location = o?.label || '')" /></WField
          ><WField :label="t('common.fields.quantity')"
            ><WInput
              v-model="line.quantity"
              type="number"
              min="1"
              step="1" /></WField></WFormGrid
        ><WButton @click="addLine">{{
          t("common.operations.add-item")
        }}</WButton>
        <ul>
          <li v-for="(row, index) in draft" :key="index">
            {{ row.name }} · {{ row.lot || "—" }} · {{ row.location }} ·
            {{ row.quantity }}
            <WButton variant="text" @click="draft.splice(index, 1)">{{
              t("button.delete")
            }}</WButton>
          </li>
        </ul>
        <WButton
          :disabled="!draft.length || !form.reason.trim()"
          @click="create"
          >{{ t("button.save") }}</WButton
        >
      </fieldset></WCard
    >
    <div class="layout">
      <WCard
        ><h2>{{ field("documents") }}</h2>
        <WInput
          v-model="keyword"
          :placeholder="field('search')"
          @keydown.enter="
            page = 1;
            load();
          "
        />
        <div class="actions">
          <WButton
            :disabled="busy || loading || page <= 1"
            @click="
              page--;
              load();
            "
            >{{ field("previous") }}</WButton
          ><span>{{ page }} / {{ pages }}</span
          ><WButton
            :disabled="busy || loading || page >= pages"
            @click="
              page++;
              load();
            "
            >{{ field("next") }}</WButton
          >
        </div>
        <WEmptyState
          v-if="loading"
          :title="t('common.status.loading')"
        /><WEmptyState
          v-else-if="!docs.length"
          :title="t('common.status.nothing-show')"
        /><button
          v-for="doc in docs"
          :key="doc.id"
          class="document"
          :class="{ selected: selected?.id === doc.id }"
          :disabled="busy"
          @click="choose(doc)"
        >
          <strong>{{ isTransfer ? "TR" : "RMA" }}-{{ doc.id }}</strong
          ><span>{{ field(doc.status) }}</span
          ><small v-if="isTransfer"
            >{{ doc.source_warehouse }} → {{ doc.destination_warehouse }}</small
          ><small>{{ doc.reason }}</small>
        </button></WCard
      >
      <section v-if="selected">
        <WCard
          ><h2>
            {{ isTransfer ? "TR" : "RMA" }}-{{ selected.id }} ·
            {{ field(selected.status) }}
          </h2>
          <p>{{ selected.reason }}</p>
          <p v-if="selected.exception_reason">
            {{ field("exception-reason") }}: {{ selected.exception_reason }}
          </p>
          <NuxtLink
            v-if="selected.original_dn_id"
            :to="'/dn/detail/' + selected.original_dn_id"
            >{{ field("original-dn") }} DN-{{
              selected.original_dn_id
            }}</NuxtLink
          >
          <p v-if="isTransfer && selected.status==='in_transit' && selected.first_shipped_at">
            {{ field("in-transit-age") }}: {{ selected.transit_days }}
            {{ field("days") }}
          </p>
          <div class="table">
            <table>
              <thead>
                <tr>
                  <th>{{ t("nav.goods") }}</th>
                  <th>{{ t("goods-label.lot") }}</th>
                  <th>{{ field("planned") }}</th>
                  <th>{{ field(isTransfer ? "shipped" : "received") }}</th>
                  <th>{{ field(isTransfer ? "received" : "disposed") }}</th>
                  <th>
                    {{ field(isTransfer ? "outstanding" : "quarantine") }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in selected.lines" :key="row.id">
                  <td>
                    {{ row.goods_code }}<small>{{ row.goods_name }}</small>
                  </td>
                  <td>{{ row.lot_no || "—" }}</td>
                  <td>
                    {{ row.quantity
                    }}<small v-if="row.cancelled"
                      >{{ field("cancelled") }}: {{ row.cancelled }}</small
                    >
                  </td>
                  <td>{{ isTransfer ? row.shipped : row.received }}</td>
                  <td>{{ isTransfer ? row.received : row.disposed }}</td>
                  <td>
                    {{
                      isTransfer
                        ? row.outstanding
                        : row.received - row.disposed
                    }}<small v-if="isTransfer && row.lost"
                      >{{ field("loss") }}: {{ row.lost }}</small
                    ><small
                      v-for="holding in row.holdings || []"
                      :key="holding.location_id"
                      >{{ holding.location_code }} ·
                      {{ holding.quantity }}</small
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div></WCard
        >
        <WCard v-if="active && (canShip || canReceive || canInspect)"
          ><h2>{{ field("actions") }}</h2>
          <fieldset :disabled="busy">
            <WFormGrid
              ><WField :label="t('nav.goods')"
                ><WSelect
                  v-model="operation.line_id"
                  :options="documentLines" /></WField
              ><WField :label="t('common.fields.quantity')"
                ><WInput
                  v-model="operation.quantity"
                  type="number"
                  min="1"
                  step="1" /></WField
              ><WField :label="field('receive-location')"
                ><WCombobox
                  v-model="operation.location_id"
                  :search="
                    (q) =>
                      locationSearch(
                        q,
                        isTransfer
                          ? selected.destination_warehouse_id
                          : selected.warehouse_id,
                        isTransfer ? undefined : 'return',
                      )
                  " /></WField
              ><WField :label="t('common.fields.reason')"
                ><WInput v-model="operation.reason" :maxlength="255" /></WField
            ></WFormGrid>
            <div class="actions">
              <WButton
                v-if="canShip"
                :disabled="!operation.reason.trim()"
                @click="act('ship')"
                >{{ field("ship") }}</WButton
              ><WButton
                v-if="canReceive"
                :disabled="!operation.reason.trim() || !operation.location_id"
                @click="act('receive')"
                >{{ field("receive") }}</WButton
              ><WButton
                v-if="isTransfer && canShip && canReview"
                :disabled="!operation.reason.trim()"
                @click="act('loss')"
                >{{ field("loss") }}</WButton
              ><WButton
                v-if="isTransfer ? canShip : canReceive"
                :disabled="!operation.reason.trim()"
                @click="act('cancel')"
                >{{ field("cancel-remainder") }}</WButton
              >
            </div>
            <template v-if="!isTransfer && canInspect"
              ><h3>{{ field("disposition") }}</h3>
              <WFormGrid
                ><WField :label="field('quarantine-location')"
                  ><WSelect
                    v-model="operation.location_id"
                    :options="holdings" /></WField
                ><WField :label="field('disposition')"
                  ><WSelect
                    v-model="operation.action"
                    :options="dispositionOptions" /></WField
                ><WField
                  v-if="
                    ['restock', 'damaged', 'repair'].includes(operation.action)
                  "
                  :label="field('target-location')"
                  ><WCombobox
                    v-model="operation.target_location_id"
                    :search="
                      (q) =>
                        locationSearch(
                          q,
                          selected.warehouse_id,
                          operation.action === 'restock'
                            ? 'standard'
                            : operation.action === 'damaged'
                              ? 'damaged'
                              : 'return',
                        )
                    " /></WField
                ><template v-if="operation.action === 'supplier_return'"
                  ><WField :label="t('nav.supplier')"
                    ><WCombobox
                      v-model="operation.supplier_id"
                      :search="
                        (q) => search('supplier', q, {}, selected.warehouse_id)
                      " /></WField
                  ><WField :label="field('supplier-recipient')"
                    ><WCombobox
                      v-model="operation.supplier_recipient_id"
                      :search="
                        (q) => search('recipient', q, {}, selected.warehouse_id)
                      " /></WField></template></WFormGrid
              ><WButton
                :disabled="!operation.location_id || !operation.reason.trim()"
                @click="propose"
                >{{ field("submit-review") }}</WButton
              ></template
            >
          </fieldset></WCard
        >
        <WCard v-if="!isTransfer && selected.dispositions.length"
          ><h2>{{ field("disposition") }}</h2>
          <WField v-if="canReview" :label="field('review-reason')"
            ><WInput v-model="reviewReason" :maxlength="255" :disabled="busy"
          /></WField>
          <article v-for="decision in selected.dispositions" :key="decision.id">
            <p>
              {{ field(decision.action) }} · {{ decision.quantity }} ·
              {{ field(decision.status) }} · {{ decision.reason }}
            </p>
            <p v-if="decision.restored_quantity">
              {{ field("restored") }}: {{ decision.restored_quantity }}
            </p>
            <p v-if="decision.review_reason">{{ decision.review_reason }}</p>
            <NuxtLink
              v-if="decision.linked_dn_id"
              :to="'/dn/detail/' + decision.linked_dn_id"
              >DN-{{ decision.linked_dn_id }}</NuxtLink
            >
            <div
              v-if="decision.status === 'pending' && canReview"
              class="actions"
            >
              <WButton
                :disabled="busy || !reviewReason.trim()"
                @click="review(decision, true)"
                >{{ field("approve") }}</WButton
              ><WButton
                :disabled="busy || !reviewReason.trim()"
                @click="review(decision, false)"
                >{{ field("reject") }}</WButton
              >
            </div>
          </article></WCard
        >
        <WCard
          ><h2>{{ field("history") }}</h2>
          <article v-for="event in selected.events" :key="event.id">
            <strong>{{
              field(
                event.action.startsWith("review-") ? "review" : event.action,
              )
            }}</strong>
            · {{ $dayjs(event.created_at, "YYYY-MM-DD HH:mm") }}
            <p>
              {{ event.payload.reason }} ·
              {{ event.operator_name || event.operator_id }}
            </p>
            <p
              v-for="row in event.payload.lines || []"
              :key="row.id || row.goods_id"
            >
              {{
                selected.lines.find(
                  (l: any) => l.id === row.id || l.goods_id === row.goods_id,
                )?.goods_code
              }}
              · {{ row.quantity }}
            </p>
          </article></WCard
        >
      </section>
    </div>
  </main>
</template>
<style scoped>
.stock-operations {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
header,
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
h1 {
  font-size: 24px;
  margin: 0 auto 0 0;
}
h2 {
  font-size: 17px;
  margin: 0 0 16px;
}
h3 {
  font-size: 15px;
  margin-top: 24px;
}
p,
li {
  font-size: 13px;
  line-height: 1.6;
}
fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.layout > section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.document {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  gap: 8px;
  padding: 14px;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--w-line);
  text-align: left;
  cursor: pointer;
}
.document.selected {
  background: var(--w-bg-2, #eef3fa);
}
.document small {
  width: 100%;
  overflow-wrap: anywhere;
}
small {
  display: block;
  color: var(--w-text-3);
  font-size: 12px;
}
.table {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 540px;
}
th,
td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--w-line);
  font-size: 13px;
}
article {
  padding: 12px 0;
  border-top: 1px solid var(--w-line);
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
