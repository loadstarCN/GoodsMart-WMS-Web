<script setup lang="ts">
/**
 * 选文件（导入运单号、批量添加商品）：没选时是一块可点、可拖放的区域（「选择文件」+ 支持的格式）；
 * 选了之后显示文件名、大小（及 #meta 插槽：工作表、行数），右边「更换文件」。v-model 是 File | null。
 * accept 照原生 input 的写法（.csv,.xlsx）；maxSize（字节）超出时不收，发 reject。
 */
const props = withDefaults(defineProps<{
  accept?: string
  /** 支持的格式等一句话（显示在选择区里） */
  hint?: string
  maxSize?: number
  disabled?: boolean
  id?: string
}>(), {
  disabled: false,
})

const model = defineModel<File | null>({ default: null })
const emit = defineEmits<{ reject: [reason: 'size' | 'type', file: File] }>()
const { t, locale } = useI18n()
const field = useWField()
const input = useTemplateRef<HTMLInputElement>('input')
const dragging = ref(false)

const inputId = computed(() => props.id || field?.id.value)

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(locale.value, { maximumFractionDigits: 1 })} KB`
  return `${(bytes / 1024 / 1024).toLocaleString(locale.value, { maximumFractionDigits: 1 })} MB`
}

const accepts = (file: File) => {
  if (!props.accept) return true
  const name = file.name.toLowerCase()
  return props.accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) =>
    (rule.startsWith('.') ? name.endsWith(rule) : rule.endsWith('/*') ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule))
}

const take = (file: File | null | undefined) => {
  if (!file) return
  if (!accepts(file)) {
    emit('reject', 'type', file)
    return
  }
  if (props.maxSize && file.size > props.maxSize) {
    emit('reject', 'size', file)
    return
  }
  model.value = file
}
const onChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  take(target.files?.[0])
  target.value = ''
}
const onDrop = (event: DragEvent) => {
  dragging.value = false
  if (props.disabled) return
  take(event.dataTransfer?.files?.[0])
}
const browse = () => {
  if (!props.disabled) input.value?.click()
}
</script>

<template>
  <div class="w-file" :class="{ 'is-dragging': dragging, 'is-disabled': disabled, 'has-file': model }"
    @dragover.prevent="dragging = !disabled" @dragleave="dragging = false" @drop.prevent="onDrop">
    <input ref="input" :id="inputId" class="w-sr-only" type="file" :accept="accept" :disabled="disabled"
      :aria-describedby="field?.describedBy.value" @change="onChange">
    <template v-if="model">
      <span class="w-file__icon" aria-hidden="true"><WIcon name="dn" :size="18" /></span>
      <span class="w-file__info">
        <span class="w-file__name">{{ model.name }}</span>
        <span class="w-file__meta"><slot name="meta">{{ formatSize(model.size) }}</slot></span>
      </span>
      <span class="w-file__actions"><slot name="actions" /></span>
      <WButton size="sm" :disabled="disabled" @click="browse">{{ t('w.file.change') }}</WButton>
    </template>
    <button v-else type="button" class="w-file__drop" :disabled="disabled" @click="browse">
      <WIcon name="asn" :size="18" />
      <span class="w-file__choose">{{ t('w.file.choose') }}</span>
      <span v-if="hint" class="w-file__hint">{{ hint }}</span>
    </button>
  </div>
</template>

<style scoped>
.w-file {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 10px 12px;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
  font-family: var(--w-font);
}
.w-file:not(.has-file) { padding: 0; border-style: dashed; border-color: var(--w-border-strong); }
.w-file.is-dragging { border-color: var(--w-sel); background: var(--w-sel-soft); }
.w-file__drop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 8px;
  width: 100%;
  min-height: 72px;
  padding: 12px;
  border: 0;
  border-radius: var(--w-radius-card);
  background: transparent;
  color: var(--w-text-2);
  font: inherit;
  cursor: pointer;
}
.w-file__drop:hover:not(:disabled) { background: var(--w-surface-2); }
.w-file__drop:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-file__drop:disabled { cursor: not-allowed; color: var(--w-text-3); }
.w-file__choose { color: var(--w-link); font-weight: var(--w-fw-semibold); font-size: var(--w-fs-14); }
.w-file__hint { width: 100%; text-align: center; font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-file__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: var(--w-radius-control);
  background: var(--w-surface-2);
  color: var(--w-text-2);
}
.w-file__info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.w-file__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-file__meta { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-file__actions { display: inline-flex; align-items: center; gap: 8px; }
</style>
