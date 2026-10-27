<script lang="ts" setup>
/**
 * 平台管理 · 操作日志（后端 GET /api/system/logs/，见 Backend system/logs/views.py）
 * - 只记录写操作（POST / PUT / DELETE），GET 不记
 * - 筛选参数：method、status_code、created_at / created_at_end（起止时间，都含；created_at_end 只给日期时含那一整天）、
 *   keyword（搜操作人 / 接口路径）。界面按分钟选起止时间，结束时间提交为所选那一分钟的最后一秒（含这一分钟）
 * - 列表不带请求 / 响应正文，点开时读单条 GET /api/system/logs/<id>
 */

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();

const dataToPass = computed(() => ({
  current: t('admin.nav.logs'),
  list: [t('admin.title'), t('admin.nav.logs')]
}));

const router = useRouter();
const route = useRoute();
const loading = ref(true);
const pageData = ref<PaginationData | null>(null);

// 平台管理不在某个仓库里：时刻按浏览器时区显示 / 输入
const timeZone = browserTimeZone();

// ==================== 筛选 ====================
const LOGGED_METHODS = ['POST', 'PUT', 'DELETE'] as const;
const STATUS_CODES = ['200', '201', '204', '400', '401', '403', '404', '409', '422', '429', '500'];

const filters = reactive({
  method: '',
  status_code: '',
  since: '',      // <input type="datetime-local"> 的值（浏览器时区）
  until: '',
  keyword: '',
});

/** route.query → 表单（刷新 / 前进后退后保持筛选） */
const restoreFilters = () => {
  const q = route.query;
  filters.method = LOGGED_METHODS.includes(String(q.method || '') as any) ? String(q.method) : '';
  filters.status_code = q.status_code ? String(q.status_code) : '';
  const since = q.created_at ? parseDateTime(String(q.created_at), timeZone) : null;
  filters.since = since ? toDateTimeLocalValue(since, timeZone) : '';
  const until = q.created_at_end ? parseDateTime(String(q.created_at_end), timeZone) : null;
  filters.until = until ? toDateTimeLocalValue(until, timeZone) : '';
  filters.keyword = q.keyword ? String(q.keyword) : '';
};

/** 结束时间含所选那一分钟：提交该分钟的最后一秒（后端按「小于等于」筛） */
const END_OF_MINUTE_MS = 59 * 1000;

const applyFilters = async () => {
  const since = fromDateTimeLocalValue(filters.since, timeZone);
  const until = fromDateTimeLocalValue(filters.until, timeZone);
  if (since && until && until.getTime() < since.getTime()) {
    showToast(t('admin.logs.filters.range-invalid'), 'error');
    return;
  }
  const query: Record<string, any> = { ...route.query, page: '1' };
  const set = (key: string, value: string) => {
    if (value) query[key] = value;
    else delete query[key];
  };
  set('method', filters.method);
  set('status_code', /^\d{3}$/.test(filters.status_code) ? filters.status_code : '');
  set('created_at', since ? toOffsetIsoString(since, timeZone) : '');
  set('created_at_end', until ? toOffsetIsoString(new Date(until.getTime() + END_OF_MINUTE_MS), timeZone) : '');
  set('keyword', filters.keyword.trim());
  await router.push({ query });
};

const resetFilters = async () => {
  filters.method = '';
  filters.status_code = '';
  filters.since = '';
  filters.until = '';
  filters.keyword = '';
  const { method: _m, status_code: _s, created_at: _c, created_at_end: _e, keyword: _k, ...rest } = route.query;
  await router.push({ query: { ...rest, page: '1' } });
};

// ==================== 列表 ====================
const fetchData = async () => {
  loading.value = true;
  await httpRequest<PaginationData>('/api/system/logs/', {
    method: 'GET',
    params: { ...route.query },
    onSuccess: (data) => {
      pageData.value = data;
    },
    onError: (error) => {
      showToast(error.message, 'error');
    },
    onFinally: () => {
      loading.value = false;
    }
  });
};

watch(() => route.query, async () => {
  restoreFilters();
  await fetchData();
});

onMounted(() => {
  restoreFilters();
  fetchData();
});

// ==================== 显示 ====================
const formatTime = (value: string | null | undefined) =>
  value ? formatInTimeZone(value, 'YYYY-MM-DD HH:mm:ss', timeZone) || '—' : '—';

/** 操作人：后端记的是 User:<id> / System:<系统名> / Unknown */
const actorLabel = (actor: string | null | undefined) => {
  const text = String(actor || '').trim();
  if (!text || text === 'Unknown') return t('admin.logs.actor.unknown');
  const user = /^User:(.+)$/.exec(text);
  if (user) return t('common.users.user-ref', { id: user[1] });
  const system = /^System:(.+)$/.exec(text);
  if (system) return t('admin.logs.actor.system', { name: system[1] });
  return text;
};

const methodBadgeClass = (method: string) => {
  switch (method) {
    case 'POST': return 'bg-success-transparent';
    case 'PUT': return 'bg-info-transparent';
    case 'DELETE': return 'bg-danger-transparent';
    default: return 'bg-secondary-transparent';
  }
};

const statusBadgeClass = (code: number | null | undefined) => {
  const n = Number(code);
  if (n >= 500) return 'bg-danger-transparent';
  if (n >= 400) return 'bg-warning-transparent';
  if (n >= 300) return 'bg-info-transparent';
  if (n >= 200) return 'bg-success-transparent';
  return 'bg-secondary-transparent';
};

// ==================== 详情：请求 / 响应摘要 ====================
const SUMMARY_LIMIT = 4000;
const REDACTED = '[redacted]';

const showDetailModal = ref(false);
const detailLoading = ref(false);
const detailItem = ref<any>(null);

const openDetail = async (item: any) => {
  detailItem.value = item;
  showDetailModal.value = true;
  detailLoading.value = true;
  await httpRequest(`/api/system/logs/${item.id}`, {
    method: 'GET',
    onSuccess: (data) => {
      // 用户在等待期间关掉 / 换了一条：丢弃
      if (detailItem.value?.id === item.id) detailItem.value = { ...item, ...data };
    },
    onError: (error) => {
      showToast(error.message, 'error');
    },
    onFinally: () => {
      if(detailItem.value?.id===item.id)detailLoading.value = false;
    }
  });
};

interface BodySummary {
  kind: 'empty' | 'redacted' | 'stream' | 'file' | 'text'
  text: string
  truncated: boolean
}

/** 正文摘要：JSON 排版；敏感接口（[redacted]）、流式响应、另存为文件的大正文给说明；过长截断 */
const bodySummary = (raw: unknown): BodySummary => {
  const text = raw === null || raw === undefined ? '' : String(raw);
  if (!text.trim()) return { kind: 'empty', text: '', truncated: false };
  if (text === REDACTED) return { kind: 'redacted', text: '', truncated: false };
  if (text === '[stream]') return { kind: 'stream', text: '', truncated: false };
  // 超过 MAX_LOG_SIZE 的正文另存为服务器上的 .log 文件，库里只有路径
  if (/^[^\s{}[\]"]+\.log$/.test(text.trim())) return { kind: 'file', text: text.trim(), truncated: false };
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // 不是 JSON（表单 / 纯文本）：原样
  }
  return pretty.length > SUMMARY_LIMIT
    ? { kind: 'text', text: pretty.slice(0, SUMMARY_LIMIT), truncated: true }
    : { kind: 'text', text: pretty, truncated: false };
};

const requestSummary = computed(() => bodySummary(detailItem.value?.request_data));
const responseSummary = computed(() => bodySummary(detailItem.value?.response_data));

const columns=computed(()=>[{key:'time',label:t('admin.logs.fields.time')},{key:'actor',label:t('admin.logs.fields.actor')},{key:'method',label:t('admin.logs.fields.method')},{key:'endpoint',label:t('admin.logs.fields.endpoint'),wrap:true},{key:'status_code',label:t('admin.logs.fields.status-code')},{key:'ip_address',label:t('admin.logs.fields.ip')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
useHead({title:()=>t('admin.nav.logs')})
</script><template><div class="w-admin-logs w-scope"><header><h1>{{t('admin.nav.logs')}}</h1><span>{{pageData?.total}}</span><small>{{t('admin.logs.tips.only-write')}}</small></header><WCard flush><form class="filters" @submit.prevent="applyFilters"><WInput v-model="filters.keyword" type="search" :aria-label="t('common.search')" :placeholder="t('admin.logs.filters.keyword-placeholder')"/><WSelect v-model="filters.method" :aria-label="t('admin.logs.fields.method')" :options="[{value:'',label:t('admin.logs.filters.all-methods')},...LOGGED_METHODS.map(value=>({value,label:value}))]"/><WSelect v-model="filters.status_code" :aria-label="t('admin.logs.fields.status-code')" :options="[{value:'',label:t('admin.logs.filters.all-status')},...STATUS_CODES.map(value=>({value,label:value}))]"/><WField :label="t('admin.logs.filters.since')"><WInput v-model="filters.since" type="datetime-local"/></WField><WField :label="t('admin.logs.filters.until')"><WInput v-model="filters.until" type="datetime-local"/></WField><WButton type="submit">{{t('common.search')}}</WButton><WButton variant="text" @click="resetFilters">{{t('button.reset')}}</WButton></form><WTable :columns="columns" :rows="pageData?.items||[]" :loading="loading" inset><template #cell-time="{row}">{{formatTime(row.created_at)}}</template><template #cell-actor="{row}">{{actorLabel(row.actor)}}</template><template #cell-method="{row}"><code>{{row.method}}</code></template><template #cell-endpoint="{row}"><code>{{row.endpoint}}</code></template><template #cell-status_code="{row}"><WStatus :tone="row.status_code>=400?'bad':'ok'">{{row.status_code??'—'}}</WStatus></template><template #cell-actions="{row}"><WButton size="sm" @click="openDetail(row)">{{t('operations.ui.view')}}</WButton></template></WTable><footer><WPagination :page="pageData?.page||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/></footer></WCard><WDrawer v-model:open="showDetailModal" :title="t('admin.logs.title')" width="600px"><template v-if="detailItem"><dl class="details"><dt>{{t('admin.logs.fields.time')}}</dt><dd>{{formatTime(detailItem.created_at)}}</dd><dt>{{t('admin.logs.fields.actor')}}</dt><dd>{{actorLabel(detailItem.actor)}}</dd><dt>{{t('admin.logs.fields.method')}}</dt><dd>{{detailItem.method}}</dd><dt>{{t('admin.logs.fields.endpoint')}}</dt><dd><code>{{detailItem.endpoint}}</code></dd><dt>{{t('admin.logs.fields.status-code')}}</dt><dd>{{detailItem.status_code}}</dd><dt>{{t('admin.logs.fields.ip')}}</dt><dd>{{detailItem.ip_address||'—'}}</dd><dt>{{t('admin.logs.fields.processing-time')}}</dt><dd>{{detailItem.processing_time!=null?t('admin.logs.detail.ms',{n:detailItem.processing_time}):'—'}}</dd></dl><WEmptyState v-if="detailLoading" :title="t('common.status.loading')"/><template v-else><section v-for="(summary,index) in [requestSummary,responseSummary]" :key="index" class="body-summary"><h3>{{t(index===0?'admin.logs.detail.request':'admin.logs.detail.response')}}</h3><small v-if="summary.kind!=='text'">{{t('admin.logs.detail.'+summary.kind)}}</small><pre v-if="summary.text">{{summary.text}}</pre><small v-if="summary.truncated">{{t('admin.logs.detail.truncated',{n:SUMMARY_LIMIT})}}</small></section></template></template><template #footer><WButton @click="showDetailModal=false">{{t('button.close')}}</WButton></template></WDrawer></div></template><style scoped>.w-admin-logs{display:flex;flex-direction:column;gap:16px}header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}header>span{font-size:13px;color:var(--w-text-2)}header>small{margin-left:auto}small{font-size:12px;line-height:18px;color:var(--w-text-3)}.filters{display:flex;flex-wrap:wrap;align-items:end;gap:8px;padding:12px 20px;border-bottom:1px solid var(--w-line)}.filters>.w-input{width:260px;max-width:100%}.filters>.w-select{width:160px}.filters>.w-field{width:220px;max-width:100%}.w-admin-logs :deep(.w-table){min-width:1000px}.w-admin-logs :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}code{font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:18px;color:var(--w-text-2);overflow-wrap:anywhere}footer{padding:16px 20px;border-top:1px solid var(--w-border)}.details{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;font-size:13px;line-height:20px;margin:0 0 24px}.details dt{color:var(--w-text-3);font-weight:400}.details dd{margin:0;overflow-wrap:anywhere}.body-summary{border-top:1px solid var(--w-line);padding-top:16px;margin-top:16px}h3{font-size:14px;line-height:22px;font-weight:600;margin:0 0 12px}pre{padding:16px;max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#F6F7FA;border:1px solid var(--w-border);border-radius:6px;font-size:12px;line-height:18px}</style>