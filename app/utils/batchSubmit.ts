/********************
 * 作业批次（分拣 / 拣货 / 打包）提交的幂等键
 ********************/
import type { HttpRequestError } from '~/utils/http'

/**
 * 同一个 client_batch_id 但内容不同（409）：多半是上次提交其实已经成功（响应没收到），之后又改了数量再提交
 */
export const BATCH_REPLAY_MISMATCH_CODE = 16121

/** 生成 UUID v4：优先 crypto.randomUUID（只在安全上下文可用），否则用 getRandomValues 拼 */
const randomUuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // 非安全上下文（http）等：走下面的兜底
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * 批次提交的 client_batch_id（POST /warehouse/{sorting|picking|packing}/<id>/batches/）：
 * - 一次「提交意图」一个 UUID：提交失败（断网、超时、5xx 等）后重试沿用同一个——
 *   上次其实已经建好时后端返回 200 + 已有批次，不会重复记账；
 * - 提交成功（201 新建 / 200 重放）后清掉，下一次提交生成新的；
 * - 409 16121（同一个 id 内容不同）：清掉，由调用方重新读取任务，让用户核对后再录
 */
export const useBatchSubmitKey = () => {
  let current: string | null = null

  /** 本次提交用的 client_batch_id：上次失败时留下的沿用，否则生成新的 */
  const take = (): string => {
    if (!current) current = randomUuid()
    return current
  }

  /** 提交成功后清掉：下一次提交生成新的 */
  const clear = () => {
    current = null
  }

  /** 是否「同一个 id 内容不同」（16121） */
  const isReplayMismatch = (error: HttpRequestError | null | undefined): boolean =>
    error?.code === BATCH_REPLAY_MISMATCH_CODE

  return { take, clear, isReplayMismatch }
}
