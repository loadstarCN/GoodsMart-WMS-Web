<script setup lang="ts" generic="T extends string | number">
/**
 * 可搜索下拉（combobox）：输入文字筛选，上下键选、Enter 确定、Esc 收起（恢复原来的选择）。
 * - 本地：传 options，按 label / description / keywords 筛选（不分大小写）
 * - 远程：传 search(query) → Promise<选项[]>，输入停 250ms 后请求（打开时先按空关键词请求一次，minChars 可改）；
 *   只用最后一次请求的结果
 * - v-model 是选中项的 value；选项里没有当前值时（编辑页、远程还没搜过）用 selectedLabel / selectedOption 显示
 * - twoLine：没在输入时把选中项的 description 显示在第二行（收货方：名称 + 地址）
 * - 选中后发 select（完整的选项对象）；clearable 时可清空（发 null）
 * 放在 WField 里时自动接上 id / aria-describedby / aria-invalid。读屏：role="combobox" + listbox + aria-activedescendant。
 */
export interface WComboboxOption<V = string | number> {
  value: V
  label: string
  /** 第二行灰字（地址、编码……） */
  description?: string
  /** 另外参与本地筛选的文字（代码、英文名） */
  keywords?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  options?: WComboboxOption<T>[]
  search?: ((query: string) => Promise<WComboboxOption<T>[]>) | null
  /** 当前值不在 options 里时显示的文字 */
  selectedLabel?: string
  /** 当前值不在 options 里时的完整选项（twoLine 时显示第二行） */
  selectedOption?: WComboboxOption<T> | null
  placeholder?: string
  emptyText?: string
  /** 远程搜索至少输入几个字才请求（0 = 打开就请求） */
  minChars?: number
  /** 最多显示几项（本地筛选） */
  limit?: number
  clearable?: boolean
  twoLine?: boolean
  size?: 'md' | 'sm'
  invalid?: boolean
  disabled?: boolean
  id?: string
}>(), {
  options: () => [],
  search: null,
  selectedLabel: '',
  selectedOption: null,
  minChars: 0,
  limit: 200,
  clearable: false,
  twoLine: false,
  size: 'md',
  invalid: false,
  disabled: false,
})

const model = defineModel<T | null | undefined>()
const emit = defineEmits<{ select: [option: WComboboxOption<T> | null] }>()
const { t } = useI18n()
const field = useWField()
const uid = useId()
const listId = `${uid}-list`
const root = useTemplateRef<HTMLElement>('root')
const input = useTemplateRef<HTMLInputElement>('input')
const list = useTemplateRef<HTMLElement>('list')

const inputId = computed(() => props.id || field?.id.value)
const isInvalid = computed(() => props.invalid || !!field?.invalid.value)

const open = ref(false)
const focused = ref(false)
const query = ref('')
/** 用户正在输入（显示 query 而不是选中项的文字） */
const typing = ref(false)
const active = ref(-1)
const loading = ref(false)
const remoteOptions = shallowRef<WComboboxOption<T>[]>([])
/** 选过的项（远程结果换了之后仍能显示） */
const remembered = shallowRef<WComboboxOption<T> | null>(null)
let searchSeq = 0
let timer: ReturnType<typeof setTimeout> | null = null

const allOptions = computed(() => (props.search ? remoteOptions.value : props.options))
const selected = computed<WComboboxOption<T> | null>(() => {
  const value = model.value
  if (value === null || value === undefined || (value as unknown) === '') return null
  const hit = [...props.options, ...remoteOptions.value].find((o) => o.value === value)
    || (remembered.value?.value === value ? remembered.value : null)
    || (props.selectedOption?.value === value ? props.selectedOption : null)
  if (hit) return hit
  return props.selectedLabel ? { value, label: props.selectedLabel } as WComboboxOption<T> : { value, label: String(value) } as WComboboxOption<T>
})

const normalize = (text: string) => text.trim().toLowerCase()
const filtered = computed(() => {
  if (props.search) return remoteOptions.value
  const q = normalize(query.value)
  const list = q && typing.value
    ? props.options.filter((o) => [o.label, o.description, o.keywords].some((s) => s && s.toLowerCase().includes(q)))
    : props.options
  return list.slice(0, props.limit)
})

const displayValue = computed(() => (typing.value ? query.value : (selected.value?.label ?? '')))
const showSecondLine = computed(() => props.twoLine && !typing.value && !!selected.value?.description)

const runSearch = (q: string) => {
  if (!props.search) return
  if (timer) clearTimeout(timer)
  if (q.trim().length < props.minChars) {
    remoteOptions.value = []
    loading.value = false
    return
  }
  loading.value = true
  timer = setTimeout(async () => {
    const seq = ++searchSeq
    try {
      const result = await props.search!(q.trim())
      if (seq === searchSeq) remoteOptions.value = result
    } catch {
      if (seq === searchSeq) remoteOptions.value = []
    } finally {
      if (seq === searchSeq) loading.value = false
    }
  }, 250)
}

const firstEnabled = (from = 0, step = 1) => {
  const items = filtered.value
  for (let i = from; i >= 0 && i < items.length; i += step) if (!items[i]?.disabled) return i
  return -1
}

// 远程结果到了（或筛选变了）：高亮落在第一项，扫码枪输完直接回车也能选上
watch(filtered, (items) => {
  if (open.value && (active.value < 0 || active.value >= items.length || items[active.value]?.disabled)) active.value = firstEnabled()
})

const openList = () => {
  if (props.disabled || open.value) return
  open.value = true
  const index = filtered.value.findIndex((o) => o.value === model.value)
  active.value = index >= 0 ? index : firstEnabled()
  if (props.search) runSearch(typing.value ? query.value : '')
}
const closeList = (restore = true) => {
  open.value = false
  active.value = -1
  if (restore) {
    typing.value = false
    query.value = ''
  }
}

const choose = (option: WComboboxOption<T> | null) => {
  if (option?.disabled) return
  remembered.value = option
  model.value = option ? option.value : null
  emit('select', option)
  closeList()
}
const clear = () => {
  choose(null)
  input.value?.focus()
}

const onInput = (event: Event) => {
  query.value = (event.target as HTMLInputElement).value
  typing.value = true
  if (!open.value) openList()
  else if (props.search) runSearch(query.value)
  nextTick(() => { active.value = firstEnabled() })
}
const scrollActive = () => nextTick(() => {
  list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
})
const move = (step: number) => {
  if (!open.value) {
    openList()
    return
  }
  const items = filtered.value
  if (!items.length) return
  let next = active.value
  for (let n = 0; n < items.length; n++) {
    next = (next + step + items.length) % items.length
    if (!items[next]?.disabled) break
  }
  active.value = next
  scrollActive()
}
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
  else if (event.key === 'Enter') {
    if (!open.value) return
    event.preventDefault()
    const option = filtered.value[active.value]
    if (option) choose(option)
  } else if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault()
      event.stopPropagation()
      closeList()
    }
  } else if (event.key === 'Tab') closeList()
}
const onFocus = () => {
  focused.value = true
}
const onBlur = (event: FocusEvent) => {
  focused.value = false
  if (root.value?.contains(event.relatedTarget as Node)) return
  closeList()
}
const onDocumentPointer = (event: PointerEvent) => {
  if (open.value && root.value && !root.value.contains(event.target as Node)) closeList()
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointer))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  if (timer) clearTimeout(timer)
})

const optionId = (index: number) => `${uid}-opt-${index}`
const emptyMessage = computed(() => {
  if (props.search && query.value.trim().length < props.minChars) return t('w.combobox.type-more', { n: props.minChars })
  return props.emptyText || t('w.combobox.empty')
})

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div ref="root" class="w-combo" :class="[`w-combo--${size}`, { 'is-open': open, 'is-invalid': isInvalid,
    'is-disabled': disabled, 'is-two-line': showSecondLine }]">
    <div class="w-combo__box" @mousedown.prevent="input?.focus(); openList()">
      <input ref="input" :id="inputId" class="w-combo__input" type="text" role="combobox" autocomplete="off"
        :value="displayValue" :placeholder="placeholder" :disabled="disabled" :aria-expanded="open"
        :aria-controls="listId" aria-autocomplete="list" :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
        :aria-invalid="isInvalid || undefined" :aria-describedby="field?.describedBy.value"
        :aria-required="field?.required.value || undefined" @input="onInput" @keydown="onKeydown" @focus="onFocus"
        @blur="onBlur" @click="openList">
      <span v-if="showSecondLine" class="w-combo__second" aria-hidden="true">{{ selected?.description }}</span>
      <span v-if="loading && open" class="w-combo__spinner" aria-hidden="true" />
      <button v-if="clearable && selected && !disabled" type="button" class="w-combo__clear" tabindex="-1"
        :aria-label="t('w.input.clear')" @mousedown.stop.prevent="clear">
        <WIcon name="close" :size="12" :stroke-width="2.4" />
      </button>
      <WIcon class="w-combo__chevron" name="chevron-down" :size="14" :stroke-width="2" />
    </div>
    <ul v-show="open" :id="listId" ref="list" class="w-combo__list w-scope" role="listbox" :aria-label="placeholder"
      @mousedown.prevent>
      <li v-for="(option, index) in filtered" :id="optionId(index)" :key="String(option.value)" role="option"
        class="w-combo__option" :class="{ 'is-active': index === active, 'is-selected': option.value === model, 'is-disabled': option.disabled }"
        :aria-selected="option.value === model" :aria-disabled="option.disabled || undefined" :data-index="index"
        @mouseenter="active = index" @click="choose(option)">
        <span class="w-combo__label">{{ option.label }}</span>
        <span v-if="option.description" class="w-combo__desc">{{ option.description }}</span>
      </li>
      <li v-if="!filtered.length && !loading" class="w-combo__empty" role="presentation">{{ emptyMessage }}</li>
      <li v-if="!filtered.length && loading" class="w-combo__empty" role="presentation">{{ t('w.combobox.loading') }}</li>
    </ul>
  </div>
</template>

<style scoped>
.w-combo {
  position: relative;
  width: 100%;
  font-family: var(--w-font);
}
.w-combo__box {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: var(--w-control-h);
  padding: 0 52px 0 12px;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  cursor: text;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.w-combo--sm .w-combo__box { min-height: var(--w-control-h-inline); padding: 0 46px 0 8px; }
.w-combo.is-two-line .w-combo__box { padding-top: 5px; padding-bottom: 5px; }
.w-combo__box:focus-within {
  border-color: var(--w-sel);
  box-shadow: var(--w-focus-ring);
}
.w-combo.is-invalid .w-combo__box { border-color: var(--w-bad-dot); }
.w-combo.is-disabled .w-combo__box { background: var(--w-surface-2); cursor: not-allowed; }
.w-combo__input {
  width: 100%;
  min-width: 0;
  height: calc(var(--w-control-h) - 2px);
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--w-text-1);
  font: inherit;
  font-size: var(--w-fs-14);
  text-overflow: ellipsis;
}
.w-combo--sm .w-combo__input { height: calc(var(--w-control-h-inline) - 2px); font-size: var(--w-fs-13); }
.w-combo.is-two-line .w-combo__input { height: 20px; font-weight: var(--w-fw-medium); }
.w-combo__input::placeholder { color: var(--w-text-3); opacity: 1; }
.w-combo__input:disabled { cursor: not-allowed; color: var(--w-text-2); }
.w-combo__second {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-combo__chevron {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  color: var(--w-text-3);
  pointer-events: none;
}
.w-combo__clear,
.w-combo__spinner {
  position: absolute;
  top: 50%;
  right: 28px;
  transform: translateY(-50%);
}
.w-combo__clear {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-3);
  cursor: pointer;
}
.w-combo__clear:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-combo__spinner {
  width: 14px;
  height: 14px;
  border-radius: var(--w-radius-pill);
  border: 2px solid var(--w-text-3);
  border-right-color: transparent;
  animation: w-combo-spin 0.7s linear infinite;
}
.w-combo__clear + .w-combo__chevron,
.w-combo__spinner + .w-combo__clear { right: 10px; }
@keyframes w-combo-spin { to { transform: translateY(-50%) rotate(360deg); } }

.w-combo__list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: var(--w-z-dropdown);
  max-height: 280px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-raised);
  box-shadow: var(--w-shadow-raised);
}
.w-combo__option {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 7px 10px;
  border-radius: var(--w-radius-control);
  color: var(--w-text-1);
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  cursor: pointer;
}
.w-combo--sm .w-combo__option { font-size: var(--w-fs-13); line-height: var(--w-lh-13); padding: 5px 8px; }
.w-combo__option.is-active { background: var(--w-surface-2); }
.w-combo__option.is-selected { background: var(--w-sel-soft); font-weight: var(--w-fw-medium); }
.w-combo__option.is-selected.is-active { box-shadow: inset 0 0 0 1px var(--w-sel-line); }
.w-combo__option.is-disabled { color: var(--w-text-3); cursor: not-allowed; }
.w-combo__desc {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
  font-weight: var(--w-fw-regular);
}
.w-combo__empty {
  padding: 8px 10px;
  font-size: var(--w-fs-13);
  color: var(--w-text-3);
}
@media (prefers-reduced-motion: reduce) {
  .w-combo__spinner { animation-duration: 2s; }
}
</style>
