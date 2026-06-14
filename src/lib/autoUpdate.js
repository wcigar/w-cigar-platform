// 偵測新部署 → 提示一鍵更新，解決「長時間開著的分頁卡在舊版」問題。
// 手機把網站開著放背景、切回來不會重抓 index.html，導致看不到新功能。
// 此模組比對「目前執行中的 bundle hash」與「線上最新 index.html 的 bundle hash」，
// 不同就跳出一鍵更新橫幅（不強制 reload，避免打斷填表）。

function runningBundleHash() {
  const src = [...document.scripts].map(s => s.src).find(s => /\/assets\/index-[\w-]+\.js/.test(s))
  const m = src && src.match(/index-([\w-]+)\.js/)
  return m ? m[1] : null
}

async function latestBundleHash() {
  try {
    const res = await fetch('/?_v=' + Date.now(), { cache: 'no-store' })
    const html = await res.text()
    const m = html.match(/\/assets\/index-([\w-]+)\.js/)
    return m ? m[1] : null
  } catch { return null }
}

function showUpdateBanner() {
  if (document.getElementById('wcb-update-banner')) return
  const b = document.createElement('div')
  b.id = 'wcb-update-banner'
  b.textContent = '🔄 系統已更新，點此載入新版'
  Object.assign(b.style, {
    position: 'fixed', left: '50%', bottom: '84px', transform: 'translateX(-50%)',
    zIndex: '99999', background: '#c9a84c', color: '#0a0a0a', padding: '12px 22px',
    borderRadius: '24px', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(0,0,0,.5)', fontFamily: 'Noto Serif TC, serif',
    letterSpacing: '1px', maxWidth: '90vw', textAlign: 'center',
  })
  b.onclick = () => { b.textContent = '更新中…'; location.reload() }
  document.body.appendChild(b)
}

export function initAutoUpdate() {
  if (!import.meta.env.PROD) return
  const running = runningBundleHash()
  if (!running) return
  let done = false
  const check = async () => {
    if (done || document.visibilityState !== 'visible') return
    const latest = await latestBundleHash()
    if (latest && latest !== running) { done = true; showUpdateBanner() }
  }
  // 切回分頁時檢查（最常見：手機把站開著放背景、切回來）
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
  // 開著沒動時，每 10 分鐘背景檢查一次
  setInterval(check, 10 * 60 * 1000)
}
