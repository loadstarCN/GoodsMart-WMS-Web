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
      detailLoading.value = false;
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
</script>

<template>
  <PageHeader :propData="dataToPass" />

  <div class="row">
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-header justify-content-between">
          <div class="card-title">
            {{ t('admin.logs.title') }}
            <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle" v-if="pageData">{{ pageData.total }}</span>
          </div>
          <span class="fs-12 text-muted"><i class="ri-information-line me-1"></i>{{ t('admin.logs.tips.only-write') }}</span>
        </div>
        <div class="card-body">
          <!-- 筛选 -->
          <form class="row g-2 align-items-end mb-3" @submit.prevent="applyFilters">
            <div class="col-sm-6 col-lg-3 col-xxl-2">
              <label class="form-label fs-12 mb-1" for="log-filter-method">{{ t('admin.logs.fields.method') }}</label>
              <select id="log-filter-method" class="form-select form-select-sm" v-model="filters.method">
                <option value="">{{ t('admin.logs.filters.all-methods') }}</option>
                <option v-for="m in LOGGED_METHODS" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div class="col-sm-6 col-lg-3 col-xxl-2">
              <label class="form-label fs-12 mb-1" for="log-filter-status">{{ t('admin.logs.fields.status-code') }}</label>
              <select id="log-filter-status" class="form-select form-select-sm" v-model="filters.status_code">
                <option value="">{{ t('admin.logs.filters.all-status') }}</option>
                <option v-for="code in STATUS_CODES" :key="code" :value="code">{{ code }}</option>
              </select>
            </div>
            <div class="col-sm-6 col-lg-3 col-xxl-2">
              <label class="form-label fs-12 mb-1" for="log-filter-since">{{ t('admin.logs.filters.since') }}</label>
              <input id="log-filter-since" type="datetime-local" class="form-control form-control-sm" v-model="filters.since"
                :title="t('admin.logs.filters.since-hint')">
            </div>
            <div class="col-sm-6 col-lg-3 col-xxl-2">
              <label class="form-label fs-12 mb-1" for="log-filter-until">{{ t('admin.logs.filters.until') }}</label>
              <input id="log-filter-until" type="datetime-local" class="form-control form-control-sm" v-model="filters.until"
                :title="t('admin.logs.filters.until-hint')">
            </div>
            <div class="col-sm-6 col-lg-6 col-xxl-2">
              <label class="form-label fs-12 mb-1" for="log-filter-keyword">{{ t('common.search') }}</label>
              <input id="log-filter-keyword" type="search" class="form-control form-control-sm" v-model="filters.keyword"
                :placeholder="t('admin.logs.filters.keyword-placeholder')">
            </div>
            <div class="col-sm-6 col-lg-6 col-xxl-2 d-flex gap-2">
              <button type="submit" class="btn btn-sm btn-primary flex-fill">{{ t('common.search') }}</button>
              <button type="button" class="btn btn-sm btn-light flex-fill" @click="resetFilters">{{ t('button.reset') }}</button>
            </div>
          </form>

          <div class="d-flex justify-content-center my-4" v-if="loading">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
            </div>
          </div>
          <div class="table-responsive" v-else>
            <table class="table text-nowrap table-bordered table-hover">
              <thead>
                <tr>
                  <th scope="col">{{ t('admin.logs.fields.time') }}</th>
                  <th scope="col" class="d-none d-md-table-cell">{{ t('admin.logs.fields.actor') }}</th>
                  <th scope="col">{{ t('admin.logs.fields.method') }}</th>
                  <th scope="col">{{ t('admin.logs.fields.endpoint') }}</th>
                  <th scope="col">{{ t('admin.logs.fields.status-code') }}</th>
                  <th scope="col" class="d-none d-lg-table-cell">{{ t('admin.logs.fields.ip') }}</th>
                  <th scope="col">{{ t('common.fields.action') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pageData?.items" :key="item.id">
                  <td class="fs-12">{{ formatTime(item.created_at) }}</td>
                  <td class="d-none d-md-table-cell" :title="item.actor">{{ actorLabel(item.actor) }}</td>
                  <td><span class="badge" :class="methodBadgeClass(item.method)">{{ item.method }}</span></td>
                  <td class="font-monospace fs-12 text-truncate log-endpoint" :title="item.endpoint">{{ item.endpoint }}</td>
                  <td><span class="badge" :class="statusBadgeClass(item.status_code)">{{ item.status_code }}</span></td>
                  <td class="d-none d-lg-table-cell font-monospace fs-12">{{ item.ip_address || '—' }}</td>
                  <td>
                    <button type="button" class="btn btn-icon btn-sm btn-info-light product-btn" @click="openDetail(item)"
                      :title="t('admin.logs.detail.title')" :aria-label="t('admin.logs.detail.title')">
                      <i class="ri-eye-line"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-center p-5 border border-top-0" v-if="pageData?.items?.length == 0">{{ t('admin.logs.tips.no-logs') }}</div>
          </div>
        </div>
        <div class="card-footer border-top-0">
          <div class="d-flex align-items-center justify-content-between flex-wrap">
            <template v-if="pageData">
              <Pagination :page-size="pageData?.per_page" :current-page="pageData?.page" :total="pageData?.total"
                :params="$route.query" v-if="pageData.pages > 1" />
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== 详情 ==================== -->
  <Teleport to="body">
    <div class="modal fade" :class="{ show: showDetailModal }" :style="{ display: showDetailModal ? 'block' : 'none' }"
      tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ t('admin.logs.detail.title') }}</h6>
            <button type="button" class="btn-close" @click="showDetailModal = false"></button>
          </div>
          <div class="modal-body" v-if="detailItem">
            <div class="row g-3 mb-3 fs-13">
              <div class="col-md-6">
                <div class="text-muted fs-12">{{ t('admin.logs.fields.time') }}</div>
                <div>{{ formatTime(detailItem.created_at) }}</div>
              </div>
              <div class="col-md-6">
                <div class="text-muted fs-12">{{ t('admin.logs.fields.actor') }}</div>
                <div>{{ actorLabel(detailItem.actor) }} <code class="fs-11 ms-1" v-if="detailItem.actor">{{ detailItem.actor }}</code></div>
              </div>
              <div class="col-md-6">
                <div class="text-muted fs-12">{{ t('admin.logs.fields.endpoint') }}</div>
                <div>
                  <span class="badge me-1" :class="methodBadgeClass(detailItem.method)">{{ detailItem.method }}</span>
                  <span class="font-monospace fs-12 text-break">{{ detailItem.endpoint }}</span>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-muted fs-12">{{ t('admin.logs.fields.status-code') }}</div>
                <div><span class="badge" :class="statusBadgeClass(detailItem.status_code)">{{ detailItem.status_code }}</span></div>
              </div>
              <div class="col-md-3">
                <div class="text-muted fs-12">{{ t('admin.logs.fields.processing-time') }}</div>
                <div>{{ detailItem.processing_time !== null && detailItem.processing_time !== undefined ? t('admin.logs.detail.ms', { n: detailItem.processing_time }) : '—' }}</div>
              </div>
              <div class="col-md-6">
                <div class="text-muted fs-12">{{ t('admin.logs.fields.ip') }}</div>
                <div class="font-monospace fs-12">{{ detailItem.ip_address || '—' }}</div>
              </div>
            </div>

            <div class="d-flex justify-content-center my-3" v-if="detailLoading">
              <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
            </div>
            <template v-else>
              <div class="mb-3" v-for="(summary, idx) in [requestSummary, responseSummary]" :key="idx">
                <label class="form-label fw-semibold mb-1">{{ idx === 0 ? t('admin.logs.detail.request') : t('admin.logs.detail.response') }}</label>
                <p class="text-muted fs-12 mb-0" v-if="summary.kind === 'empty'">{{ t('admin.logs.detail.empty') }}</p>
                <p class="text-muted fs-12 mb-0" v-else-if="summary.kind === 'redacted'">
                  <i class="ri-lock-line me-1"></i>{{ t('admin.logs.detail.redacted') }}
                </p>
                <p class="text-muted fs-12 mb-0" v-else-if="summary.kind === 'stream'">{{ t('admin.logs.detail.stream') }}</p>
                <p class="text-muted fs-12 mb-0" v-else-if="summary.kind === 'file'">
                  {{ t('admin.logs.detail.file') }} <code class="fs-11">{{ summary.text }}</code>
                </p>
                <template v-else>
                  <pre class="bg-light p-3 rounded fs-12 mb-1 log-body">{{ summary.text }}</pre>
                  <p class="text-muted fs-11 mb-0" v-if="summary.truncated">{{ t('admin.logs.detail.truncated', { n: SUMMARY_LIMIT }) }}</p>
                </template>
              </div>
            </template>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" @click="showDetailModal = false">{{ t('button.close') }}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showDetailModal" @click="showDetailModal = false"></div>
  </Teleport>
</template>

<style scoped>
.log-endpoint {
  max-width: 360px;
}
.log-body {
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
