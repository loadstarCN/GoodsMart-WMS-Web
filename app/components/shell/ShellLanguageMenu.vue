<script setup lang="ts">
/**
 * 界面语言：中文 / English / 日本語，切换后立即生效，记在 cookie（i18n_lang）里，下次沿用。
 * 逻辑同原来的页头（common/Header）：打开页面时按 cookie 设一次语言。
 */
type LangCode = 'en' | 'zh' | 'ja'
const LANGS: LangCode[] = ['zh', 'en', 'ja']

const { t, setLocale, locales } = useI18n()
const cookieLang = useCookie<string | null>('i18n_lang', { maxAge: 2592000 })
const current = ref<LangCode>((LANGS as string[]).includes(cookieLang.value || '') ? cookieLang.value as LangCode : 'en')
/** 语言名用各语言自己的写法（nuxt.config 的 i18n.locales[].name） */
const names = computed(() => Object.fromEntries(
  locales.value.map((l) => (typeof l === 'string' ? [l, l] : [l.code, l.name || l.code]))) as Record<string, string>)

const choose = async (lang: LangCode) => {
  try {
    await setLocale(lang)
    cookieLang.value = lang
    current.value = lang
  } catch (error) {
    console.error('Language switch failed:', error)
  }
}

onMounted(() => choose(current.value))
</script>

<template>
  <WDropdown :label="t('shell.language.menu')" placement="bottom-end" width="200px">
    <template #trigger="{ attrs }">
      <button v-bind="attrs" type="button" class="w-lang-btn" :aria-label="t('shell.language.label', { lang: names[current] })">
        <WIcon name="globe" :size="16" />
        <span class="w-lang-btn__name">{{ names[current] }}</span>
        <WIcon name="chevron-down" :size="12" :stroke-width="2" class="w-lang-btn__chevron" />
      </button>
    </template>
    <button v-for="lang in LANGS" :key="lang" type="button" class="w-menu-item" role="menuitemradio" :lang="lang"
      :aria-checked="lang === current" @click="choose(lang)">
      <span class="w-lang-mark" aria-hidden="true"><WIcon v-if="lang === current" name="check" :size="14" :stroke-width="2.4" /></span>
      <span class="w-menu-item__label">{{ names[lang] }}</span>
    </button>
  </WDropdown>
</template>

<style scoped>
.w-lang-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-2);
  font: inherit;
  font-size: var(--w-fs-13);
  line-height: 20px;
  font-weight: var(--w-fw-medium);
  cursor: pointer;
}
.w-lang-btn:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-lang-btn:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-lang-btn__chevron { color: var(--w-text-3); }
.w-lang-mark { display: grid; place-items: center; width: 20px; flex: none; color: var(--w-pri); }
@media (max-width: 767.98px) {
  .w-lang-btn__name, .w-lang-btn__chevron { display: none; }
}
</style>
