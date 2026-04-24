// src/lib/services/idempotency.js
// 前端 idempotency key 產生器 + in-flight 去重
// 避免員工/大使連點 submit/confirm/ship 造成重複送出

const IN_FLIGHT = new Map() // scope+key → Promise

/**
 * 生成新 idempotency key (UUID v4)。一筆業務動作在 UI 裡要固定一把 key，
 * 重試時重複用同一把 key，後端才能去重。
 */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // 後備實作（極舊瀏覽器）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

/**
 * 包 async fn，確保同 scope+key 同時只有 1 個 in-flight，其他呼叫等同個 Promise。
 * usage:
 *   const key = newIdempotencyKey()
 *   await withIdempotency('submit_sale', key, () => submitVenueSales(payload, key))
 */
export function withIdempotency(scope, key, fn) {
  const composite = `${scope}::${key}`
  if (IN_FLIGHT.has(composite)) return IN_FLIGHT.get(composite)
  const p = Promise.resolve().then(fn).finally(() => {
    // 300ms 後才釋放，避免使用者狂點在 1 tick 內重複產生
    setTimeout(() => IN_FLIGHT.delete(composite), 300)
  })
  IN_FLIGHT.set(composite, p)
  return p
}

/**
 * React hook wrapper：綁定一個按鈕，避免點擊期間重複觸發
 * 使用範例：
 *   const { run, pending } = useOneShot()
 *   <button disabled={pending} onClick={() => run(() => submit())}>送出</button>
 */
export function createOneShot() {
  let locked = false
  return {
    async run(fn) {
      if (locked) return
      locked = true
      try { return await fn() } finally { setTimeout(() => { locked = false }, 500) }
    },
    get locked() { return locked },
  }
}
