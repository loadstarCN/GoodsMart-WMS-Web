<script setup lang="ts">
const props = defineProps<{ goodsId: number; lot: any }>(),
  emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>("open", { default: false });
const { t } = useI18n(),
  staff = useStaffStore(),
  { bizErrorMessage } = useBizError();
const data = ref<any>(null),
  reason = ref(""),
  busy = ref(false),
  loading = ref(false),
  error = ref("");
const url = computed(
  () => `/api/warehouse/goods/${props.goodsId}/lots/${props.lot.id}/control`,
);
let generation = 0;
async function setOpen(value: boolean) {
  if (!value && busy.value) return;
  if (!value && reason.value.trim() && !await showConfirm(t('unsaved-form.title'), t('unsaved-form.message'), t('unsaved-form.leave'), t('unsaved-form.stay'))) return;
  open.value = value;
}
async function load() {
  const seq = ++generation;
  loading.value = true;
  error.value = "";
  const next = await httpRequest<any>(url.value, {
    onError: (e) => {
      if (seq === generation) error.value = bizErrorMessage(e);
    },
  });
  if (seq === generation) {
    data.value = next;
    loading.value = false;
  }
}
async function save() {
  if (busy.value || loading.value || !data.value || !reason.value.trim())
    return;
  busy.value = true;
  try {
    const result = await httpRequest(url.value, {
      method: "POST",
      body: {
        status: data.value.status === "hold" ? "active" : "hold",
        revision: data.value.revision,
        reason: reason.value.trim(),
      },
      onError: (e) => (error.value = bizErrorMessage(e)),
    });
    if (result) {
      reason.value = "";
      await load();
      emit("saved");
    }
  } finally {
    busy.value = false;
  }
}
watch(open, (value) => {
  if (value) {
    data.value = null;
    reason.value = "";
    load();
  } else generation++;
});
onBeforeUnmount(() => generation++);
useUnsavedForm(
  () => !!reason.value.trim() || busy.value,
  () => busy.value,
);
</script>
<template>
  <WDrawer
    :open="open"
    @update:open="setOpen"
    :title="t('stock-operations.lot-control') + ' · ' + lot.lot_no"
    width="700px"
    :closable="!busy"
    :close-on-backdrop="!busy && !reason.trim()"
    ><p>{{ t("stock-operations.hold-help") }}</p>
    <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton :disabled="busy" @click="load">{{t('stock-operations.refresh')}}</WButton></template></WAlert><WEmptyState
      v-if="loading"
      :title="t('common.status.loading')"
    /><template v-else-if="data"
      ><WStatus :tone="data.status === 'hold' ? 'bad' : 'ok'">{{
        t("stock-operations." + data.status)
      }}</WStatus
      ><WField
        v-if="staff.hasPermission('inventory_edit')"
        :label="t('common.fields.reason')"
        ><WTextarea v-model="reason" :maxlength="255" :disabled="busy"
      /></WField>
      <h3>{{ t("stock-operations.affected-stock") }}</h3>
      <ul>
        <li v-for="bin in data.bins" :key="bin.location_id">
          {{ bin.location_code }} · {{ t('common.locations.'+bin.stock_type) }} · {{ bin.quantity }}
        </li>
        <li v-for="stage in data.stages" :key="stage.warehouse_id">
          {{ t("nav.warehouse") }} {{ stage.warehouse_id }} ·
          {{ t("inventory.fields.picked") }} {{ stage.picked }} ·
          {{ t("inventory.fields.packed") }} {{ stage.packed }} ·
          {{ t("inventory.fields.delivered") }} {{ stage.in_transit }}
        </li>
      </ul>
      <h3>{{ t("stock-operations.affected-orders") }}</h3>
      <ul>
        <li v-for="order in data.orders" :key="order.id">
          <NuxtLink :to="'/dn/detail/' + order.id">DN-{{ order.id }}</NuxtLink>
          · {{ t('dn.status.'+order.status) }} ·
          {{
            t(
              order.possible
                ? "stock-operations.possible"
                : "stock-operations.allocated",
            )
          }}
          ·
          {{
            t(
              order.blocked
                ? "stock-operations.sales-blocked"
                : "stock-operations.supplier-return-allowed",
            )
          }}
        </li>
      </ul>
      <h3>{{ t("stock-operations.history") }}</h3>
      <p v-for="entry in data.history" :key="entry.revision">
        {{ $dayjs(entry.created_at, "YYYY-MM-DD HH:mm") }} ·
        {{ t("stock-operations." + entry.status) }} · {{ entry.reason }} · #{{
          entry.operator_id
        }}
      </p></template
    ><template #footer
        ><WButton :disabled="busy" @click="setOpen(false)">{{
        t("button.close")
      }}</WButton
      ><WButton
        v-if="data && staff.hasPermission('inventory_edit')"
        :disabled="busy || loading || !reason.trim()"
        @click="save"
        >{{
          t(
            data.status === "hold"
              ? "stock-operations.release"
              : "stock-operations.hold",
          )
        }}</WButton
      ></template
    ></WDrawer
  >
</template>
<style scoped>
p,
li {
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
h3 {
  font-size: 15px;
  margin-top: 24px;
}
</style>
