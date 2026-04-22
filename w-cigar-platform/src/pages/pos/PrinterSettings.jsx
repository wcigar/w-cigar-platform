import { useState } from 'react'
import {
  checkPiStatus,
  savePrinterConfig,
  getPrinterConfig,
  openCashDrawer,
  printBarcodeLabel,
} from '../../utils/printer'

export default function PrinterSettings({ onClose }) {
  const [piIp,    setPiIp]    = useState(getPrinterConfig().piIp || '192.168.1.200')
  const [status,  setStatus]  = useState(null)
  const [testing, setTesting] = useState(false)
  const [saved,   setSaved]   = useState(false)

  async function testConnection() {
    setTesting(true)
    setStatus(null)
    savePrinterConfig(piIp)
    const s = await checkPiStatus()
    setStatus(s ? { ok: true, data: s } : { ok: false })
    setTesting(false)
  }

  function save() {
    savePrinterConfig(piIp)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1200)
  }

  const S = {
    overlay: {
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    },
    card: {
      background: '#1a1714',
      border: '1px solid rgba(201,168,76,.3)',
      borderRadius: 20,
      padding: 28,
      width: 380,
      maxWidth: '94vw',
    },
    title: {
      color: '#c9a84c', fontSize: 17, fontWeight: 700, marginBottom: 4,
    },
    sub: {
      color: '#555', fontSize: 12, marginBottom: 20,
    },
    label: {
      color: '#aaa', fontSize: 12, marginBottom: 6, marginTop: 14,
    },
    input: {
      width: '100%', padding: '11px 14px', borderRadius: 10,
      background: '#111', border: '1px solid #333',
      color: '#e8e0d0', fontSize: 14, fontFamily: 'monospace',
      outline: 'none',
    },
    row: {
      display: 'flex', gap: 8, marginTop: 14,
    },
    btnGold: {
      flex: 2, padding: '12px 0', borderRadius: 12, border: 'none',
      background: '#c9a84c', color: '#1a1410',
      fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    btnGray: {
      flex: 1, padding: '12px 0', borderRadius: 12,
      border: '1px solid #444', background: '#2a2520',
      color: '#888', fontSize: 14, cursor: 'pointer',
    },
    btnSmall: {
      flex: 1, padding: '9px 0', borderRadius: 10,
      border: '1px solid #333', background: '#1a1714',
      color: '#888', fontSize: 12, cursor: 'pointer',
    },
    hint: {
      marginTop: 14, padding: '10px 14px',
      background: '#111', borderRadius: 10,
      fontSize: 11, color: '#444', lineHeight: 1.8,
    },
  }

  return (
    <div style={S.overlay}>
      <div style={S.card}>

        {/* 標題 */}
        <div style={S.title}>🖨️ 列印橋接設定</div>
        <div style={S.sub}>設定 Raspberry Pi 橋接機 IP 位址</div>

        {/* IP 輸入 */}
        <div style={S.label}>Pi 橋接機 IP</div>
        <input
          value={piIp}
          onChange={e => setPiIp(e.target.value)}
          placeholder="192.168.1.200"
          style={S.input}
        />

        {/* 測試按鈕 */}
        <button
          onClick={testConnection}
          disabled={testing}
          style={{ ...S.btnGold, width: '100%', marginTop: 12, opacity: testing ? 0.6 : 1 }}
        >
          {testing ? '測試中...' : '🔍 測試連線'}
        </button>

        {/* 連線狀態 */}
        {status && (
          <div style={{
            borderRadius: 10, padding: '10px 14px', marginTop: 10, fontSize: 12,
            background: status.ok ? 'rgba(90,180,100,.08)' : 'rgba(200,60,60,.08)',
            border: `1px solid ${status.ok ? 'rgba(90,180,100,.3)' : 'rgba(200,60,60,.3)'}`,
            color: status.ok ? '#5ab464' : '#e06060',
          }}>
            {status.ok ? (
              <>
                ✅ 連線成功！{status.data?.store}
                <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
                  收據機：{status.data?.printers?.receipt?.host}<br />
                  廚房機：{status.data?.printers?.kitchen?.host}
                </div>
              </>
            ) : (
              '❌ 無法連線，請確認 Pi 已開機且連上同一 WiFi'
            )}
          </div>
        )}

        {/* 連線成功後顯示測試按鈕 */}
        {status?.ok && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={openCashDrawer} style={S.btnSmall}>
              🗄️ 測試開抽屜
            </button>
            <button
              onClick={() => printBarcodeLabel({
                id: 'TEST-001', name: 'W Cigar Bar 測試標籤', price: 8888
              })}
              style={S.btnSmall}
            >
              🏷️ 測試標籤
            </button>
          </div>
        )}

        {/* 儲存 / 取消 */}
        <div style={S.row}>
          <button onClick={onClose} style={S.btnGray}>取消</button>
          <button
            onClick={save}
            style={{ ...S.btnGold, background: saved ? '#5a9a64' : '#c9a84c' }}
          >
            {saved ? '✅ 已儲存' : '儲存設定'}
          </button>
        </div>

        {/* 說明 */}
        <div style={S.hint}>
          📡 Pi 橋接機設定指南：<br />
          1. Raspberry Pi Zero 2W 插電開機<br />
          2. 查 IP：路由器管理介面或 <code>ping raspberrypi.local</code><br />
          3. 輸入 IP → 點「測試連線」→ 儲存<br />
          4. 之後結帳會自動列印收據並開收銀抽屜
        </div>

      </div>
    </div>
  )
}
