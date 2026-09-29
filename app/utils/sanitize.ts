import DOMPurify from 'dompurify'

// 富文本（Quill 编辑器）白名单：只保留排版类标签与安全属性
// 任何 <script>、on* 事件属性、javascript:/data: 链接都会被移除
const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'small',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height',
  'class', 'style',
  'colspan', 'rowspan',
]

let hooked = false

// 外链统一加 noopener，避免 target=_blank 反向劫持
const ensureHooks = () => {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

export const sanitizeHtml = (html: unknown): string => {
  if (html === null || html === undefined) return ''
  if (typeof window === 'undefined') return ''
  ensureHooks()
  return DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}
