/**
 * VIP 結帳橋接組件
 * POS 結帳完成後，VIP 客戶的商品去向選擇 + 簽名 + 入櫃 + 列印標籤
 * 用法：結帳成功後 showVipBridge=true，傳入 customer, cartItems, staff, orderResult
 */
import { useState, useRef, useEffect } from 'react'
import { bridgePosToCellar } from '../utils/cellarBridge'
import { printCellarLabels, printCellarSummary } from '../utils/printer'

const DEST_OPTIONS = [
  { value: '入櫃', label: '🗄 入櫃', color: '#7c3aed' },
  { value: '外帶', label: '🚶 外帶', color: '#2563eb' },
  { value: '現場抽', label: '🔥 現場抽', color: '#ea580c' }
]

export default function VipCheckoutBridge({ customer, cartItems, staff, paymentMethod, totalAmount, onDone, onCancel }) {
  const [step, setStep] = useState(1) // 1=去向 2=簽名 3=處理中 4=完成
  const [items, setItems] = useState(
    cartItems.map(ci => ({ ...ci, destination: '入櫃', cabinet_no: customer.cabinet_no || 'A1' }))
  )
  const [signing, setSigning] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  const cabinetItems = items.filter(i => i.destination === '入櫃')
  const hasCabinet = cabinetItems.length > 0

  // 更新商品去向
  const setDest = (idx, dest) => {
    const next = [...items]
    next[idx] = { ...next[idx], destination: dest }
    setItems(next)
  }
  const setCabNo = (idx, no) => {
    const next = [...items]
    next[idx] = { ...next[idx], cabinet_no: no }
    setItems(next)
  }

  // 簽名 Canvas
  useEffect(() => {
    if (step !== 2 || !canvasRef.current) return
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'

    const getPos = e => {
      const r = cv.getBoundingClientRect()
      const t = e.touches ? e.touches[0] : e
      return [t.clientX - r.left, t.clientY - r.top]
    }
    const start = e => { e.preventDefault(); drawingRef.current = true; ctx.beginPath(); ctx.moveTo(...getPos(e)) }
    const move = e => { if (!drawingRef.current) return; e.preventDefault(); ctx.lineTo(...getPos(e)); ctx.stroke() }
    const end = () => { drawingRef.current = false }

    cv.addEventListener('mousedown', start)
    cv.addEventListener('mousemove', move)
    cv.addEventListener('mouseup', end)
    cv.addEventListener('touchstart', start, { passive: false })
    cv.addEventListener('touchmove', move, { passive: false })
    cv.addEventListener('touchend', end)
    return () => {
      cv.removeEventListener('mousedown', start)
      cv.removeEventListener('mousemove', move)
      cv.removeEventListener('mouseup', end)
      cv.removeEventListener('touchstart', start)
      cv.removeEventListener('touchmove', move)
      cv.removeEventListener('touchend', end)
    }
  }, [step])

  const confirmSignature = () => {
    if (canvasRef.current) {
      setSignatureUrl(canvasRef.current.toDataURL('image/jpeg', 0.6))
    }
    doProcess()
  }

  const doProcess = async () => {
    setStep(3)
    setProcessing(true)
    setError(null)
    try {
      const res = await bridgePosToCellar({
        customer,
        items,
        staff,
        signatureUrl: canvasRef.current?.toDataURL('image/jpeg', 0.6),
        paymentMethod,
        totalAmount
      })
      setResult(res)
      setStep(4)
    } catch (e) {
      setError(e.message)
      setStep(2)
    } finally {
      setProcessing(false)
    }
  }

  const handlePrintLabels = async () => {
    if (!result) return
    try {
      await printCellarLabels({
        customer: result.customer,
        items: result.cabinetItems,
        orderNo: result.orderNo,
        storedDate: result.storedDate
      })
    } catch (e) { console.warn('標籤列印失敗:', e) }
  }

  const handlePrintSummary = async () => {
    if (!result) return
    try {
      await printCellarSummary({
        customer: result.customer,
        items: result.cabinetItems,
        orderNo: result.orderNo,
        storedDate: result.storedDate,
        totalAmount
      })
    } catch (e) { console.warn('明細列印失敗:', e) }
  }

  const boxStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.85)', display: 'flex',
    alignItems: 'center', justifyContent: 'center'
  }
  const panelStyle = {
    background: '#1a1a2e', borderRadius: 16, padding: 24,
    width: '90vw', maxWidth: 600, maxHeight: '90vh',
    overflow: 'auto', color: '#e8dcc8'
  }
  const btnStyle = (bg) => ({
    padding: '10px 20px', borderRadius: 8, border: 'none',
    background: bg, color: '#fff', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', flex: 1
  })

  return (
    <div style={boxStyle}>
      <div style={panelStyle}>
        {/* STEP 1: 商品去向選擇 */}
        {step === 1 && (
          <>
            <h2 style={{ margin: '0 0 16px', color: '#f59e0b' }}>VIP 入櫃確認</h2>
            <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 12 }}>
              客戶: <strong style={{ color: '#e8dcc8' }}>{customer.name}</strong>
              {customer.cabinet_no && <> | 櫃號: <strong style={{ color: '#e8dcc8' }}>{customer.cabinet_no}</strong></>}
            </div>
            {items.map((item, idx) => (
              <div key={idx} style={{ padding: 12, marginBottom: 8, background: '#16213e', borderRadius: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{item.name} x{item.qty}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DEST_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDest(idx, opt.value)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, border: '2px solid',
                        borderColor: item.destination === opt.value ? opt.color : 'transparent',
                        background: item.destination === opt.value ? opt.color + '22' : '#0d1b3e',
                        color: item.destination === opt.value ? opt.color : '#8a7e6e',
                        fontSize: 13, cursor: 'pointer', fontWeight: 600
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
                {item.destination === '入櫃' && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8a7e6e' }}>櫃號:</span>
                    <input
                      value={item.cabinet_no}
                      onChange={e => setCabNo(idx, e.target.value)}
                      style={{
                        background: '#0d1b3e', border: '1px solid #2a2520', borderRadius: 6,
                        color: '#e8dcc8', padding: '4px 8px', width: 80, fontSize: 13
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={onCancel} style={btnStyle('#4a4540')}>取消</button>
              <button onClick={() => setStep(2)} style={btnStyle('#f59e0b')}>下一步: 客戶簽名</button>
            </div>
          </>
        )}

        {/* STEP 2: 客戶簽名 */}
        {step === 2 && (
          <>
            <h2 style={{ margin: '0 0 12px', color: '#f59e0b' }}>客戶簽名確認</h2>
            <p style={{ fontSize: 13, color: '#8a7e6e', margin: '0 0 12px' }}>
              {customer.name} 請在下方簽名確認入櫃商品
            </p>
            {error && <div style={{ color: '#ef4444', marginBottom: 8, fontSize: 13 }}>❌ {error}</div>}
            <canvas
              ref={canvasRef}
              width={520} height={200}
              style={{ width: '100%', height: 200, borderRadius: 10, border: '2px solid #2a2520', touchAction: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setStep(1)} style={btnStyle('#4a4540')}>上一步</button>
              <button onClick={confirmSignature} style={btnStyle('#22c55e')} disabled={processing}>
                {processing ? '處理中...' : '確認簽名並入櫃'}
              </button>
            </div>
          </>
        )}

        {/* STEP 3: 處理中 */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 24, marginBottom: 16 }}>⏳</div>
            <div>正在建立 VIP 訂單與入櫃記錄...</div>
          </div>
        )}

        {/* STEP 4: 完成 */}
        {step === 4 && result && (
          <>
            <h2 style={{ margin: '0 0 12px', color: '#22c55e' }}>✅ 入櫃完成</h2>
            <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 16 }}>
              單號: {result.orderNo}<br />
              {result.cabinetItems.length > 0 && <>入櫃: {result.cabinetItems.reduce((s, i) => s + i.qty, 0)} 支雪茄</>}
            </div>
            {result.cabinetItems.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <button onClick={handlePrintLabels} style={btnStyle('#7c3aed')}>🏷 列印櫃位標籤</button>
                <button onClick={handlePrintSummary} style={btnStyle('#2563eb')}>📄 列印入櫃明細</button>
              </div>
            )}
            <button onClick={() => onDone(result)} style={{ ...btnStyle('#f59e0b'), width: '100%' }}>完成</button>
          </>
        )}
      </div>
    </div>
  )
}
