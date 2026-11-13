<script setup lang="ts">
const props = defineProps<{ record: any; disabled?: boolean }>();
const emit = defineEmits<{ changed: []; recount: [id: number] }>();
const { locale,t } = useI18n(),
  { bizErrorMessage } = useBizError(),
  staff = useStaffStore();
const reason = ref(""),
  busy = ref(false),
  error = ref("");
const words = computed(() =>
  String(locale.value).startsWith("zh")
    ? {
        title: "盘点库存控制",
        active: "盘点范围已冻结。差异调整完成、取消盘点或转交复盘后释放。",
        draft: "开始盘点将冻结所选商品、库位和批次，请先结束正在进行的拣货。",
        settled: "本次盘点已结清。",
        legacy: "历史盘点未受冻结保护，请建立关联复盘后再调整。",
        cancelled: "本次盘点已取消。",
        superseded: "本次结果已由关联复盘替代。",
        reason: "取消或复盘原因",
        cancel: "取消盘点并释放",
        recount: "建立关联复盘",
        parent: "来源盘点",
      }
    : String(locale.value).startsWith("ja")
      ? {
          title: "棚卸在庫管理",
          active:
            "対象在庫は凍結中です。調整完了・取消・再棚卸への引継ぎで解除します。",
          draft:
            "開始すると対象商品・ロケーション・ロットを凍結します。先にピッキングを完了してください。",
          settled: "棚卸は精算済みです。",
          legacy: "過去の棚卸です。調整前に再棚卸を作成してください。",
          cancelled: "取消済みです。",
          superseded: "再棚卸に引き継ぎ済みです。",
          reason: "取消・再棚卸の理由",
          cancel: "取消して解除",
          recount: "再棚卸を作成",
          parent: "元の棚卸",
        }
      : {
          title: "Count stock control",
          active:
            "Stock is frozen until adjustment, cancellation or transfer to a linked recount.",
          draft:
            "Starting freezes the selected products, bins and lots. Finish active picking first.",
          settled: "This count is settled.",
          legacy:
            "This historical count was not protected. Create a linked recount before adjusting.",
          cancelled: "This count was cancelled.",
          superseded: "A linked recount replaces these results.",
          reason: "Cancellation or recount reason",
          cancel: "Cancel and release stock",
          recount: "Create linked recount",
          parent: "Original count",
        },
);
useUnsavedForm(()=>!!reason.value||busy.value,()=>busy.value);
const state = computed(() => props.record.control_state || "legacy");
const resolved = computed(() =>
  ["cancelled", "superseded"].includes(state.value),
);
async function act(action: string) {
  if (busy.value || props.disabled || !reason.value.trim()) return;
  busy.value = true;
  error.value = "";
  try {
    await httpRequest(
      `/api/warehouse/cyclecount/${props.record.id}/resolve/${action}`,
      {
        method: "POST",
        body: { reason: reason.value.trim() },
        onSuccess: (data: any) => {
          reason.value = "";
          action === "recount" ? emit("recount", data.id) : emit("changed");
        },
        onError: (e: any) => (error.value = bizErrorMessage(e)),
      },
    );
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <WCard
    ><h3>{{ words.title }}</h3>
    <p>{{ words[state as keyof typeof words] }}</p>
    <NuxtLink
      v-if="record.recount_of_id"
      :to="'/cyclecount/detail/' + record.recount_of_id"
      >{{ words.parent }} CC-{{ record.recount_of_id }}</NuxtLink
    >
    <p v-for="id in record.recount_ids||[]" :key="id"><NuxtLink :to="'/cyclecount/detail/'+id">{{t('stock-operations.linked-recounts')}} CC-{{id}}</NuxtLink></p>
    <p v-if="record.resolution_reason">{{ record.resolution_reason }}</p>
    <template v-if="!resolved && staff.hasPermission('cycle_count_edit')"
      ><WInput
        v-model="reason"
        :placeholder="words.reason"
        :maxlength="255"
        :disabled="busy || disabled"
      />
      <div class="actions">
        <WButton
          v-if="state !== 'settled'"
          :disabled="busy || disabled || !reason.trim()"
          @click="act('cancel')"
          >{{ words.cancel }}</WButton
        ><WButton
          :disabled="busy || disabled || !reason.trim()"
          @click="act('recount')"
          >{{ words.recount }}</WButton
        >
      </div></template
    ><WAlert v-if="error" tone="block" :title="error"
  /></WCard>
</template>
<style scoped>
h3 {
  margin: 0;
  font-size: 16px;
}
p {
  font-size: 13px;
  line-height: 1.6;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
</style>
