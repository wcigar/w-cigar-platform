// src/pages/admin/ReplenishmentPrint.jsx
// 每店一頁 packing slip — 紙本附在貨裡給大使。內含 QR code 直連大使端確認頁。
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { getReplenishmentRun, buildPackingSlips } from '../../lib/services/replenishment'

export default function ReplenishmentPrint() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getReplenishmentRun(id).then(r => { setRun(r); setLoading(false) })
  }, [id])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8278' }}>載入中…</div>
  if (!run) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>找不到補貨單</div>

  const slips = buildPackingSlips(run)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .slip { page-break-after: always; }
          .slip:last-child { page-break-after: auto; }
          body { background: #fff !important; color: #000 !important; }
        }
        .slip {
          background: #fff; color: #000;
          padding: 24px 32px; margin-bottom: 16px;
          border-radius: 8px; max-width: 720px; margin-left: auto; margin-right: auto;
          font-family: -apple-system, 'Helvetica Neue', sans-serif;
        }
        .slip h1 { margin: 0; font-size: 22px; font-weight: 600; }
        .slip h2 { margin: 0 0 12px; font-size: 18px; font-weight: 500; }
        .slip table { width: 100%; border-collapse: collapse; }
        .slip th, .slip td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #ddd; font-size: 13px; }
        .slip th { background: #f5f5f0; font-weight: 600; }
        .slip td.center { text-align: center; }
        .slip td.right { text-align: right; }
        .qr-cell { display: flex; align-items: center; gap: 12px; }
      `}</style>

      <div className="no-print" style={{ background: '#0a0a0a', padding: '16px 20px', borderBottom: '1px solid #2a2520', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(`/admin/replenishment/${run.id}`)}
          style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #2a2520', borderRadius: 6, color: '#8a8278', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={13} /> 返回詳情
        </button>
        <div style={{ color: '#c9a84c', fontSize: 14 }}>
          補貨單 {run.run_no} · 共 {slips.length} 張出貨單
        </div>
        <button onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#c9a84c', border: 'none', borderRadius: 6, color: '#0a0a0a', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Printer size={14} /> 列印
        </button>
      </div>

      <div style={{ padding: '20px 16px', background: '#1a1714', minHeight: '100vh' }}>
        {slips.map(s => (
          <div key={s.venue_id} className="slip">
            <div style={{ borderBottom: '2px solid #c9a84c', paddingBottom: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h1>W Cigar Bar 補貨出貨單</h1>
                <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>PACKING SLIP · 大使收貨確認用</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div style={{ color: '#999' }}>補貨單號</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#c9a84c' }}>{run.run_no}</div>
                <div style={{ marginTop: 4, color: '#999', fontSize: 11 }}>{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, marginBottom: 14, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>送達店家</div>
                <h2>{s.venue_name} <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>· {s.region === 'taipei' ? '台北' : '台中'}</span></h2>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.6 }}>
                  <strong>大使收貨步驟：</strong><br />
                  1. 拆箱清點，依下表逐項核對數量<br />
                  2. 全部一致 → 掃 QR Code 進系統按「全部簽收」<br />
                  3. 有差異 → 進系統填「異常上報」（少了/破損 X 支）
                </div>
              </div>
              <QRCode text={`${baseUrl}/ambassador/receipts/${run.id}?venue=${s.venue_id}`} />
            </div>

            <table>
              <thead>
                <tr>
                  <th style={{ width: 30, textAlign: 'center' }}>#</th>
                  <th>商品</th>
                  <th style={{ width: 80, textAlign: 'center' }}>應收數量</th>
                  <th style={{ width: 90, textAlign: 'center' }}>實收（核對）</th>
                  <th style={{ width: 60, textAlign: 'center' }}>OK</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="center">{i + 1}</td>
                    <td>
                      {it.product_name}
                      <div style={{ fontSize: 10, color: '#999' }}>NT$ {it.product_price?.toLocaleString()}/支</div>
                    </td>
                    <td className="center" style={{ fontSize: 16, fontWeight: 600 }}>{it.final_qty}</td>
                    <td className="center" style={{ borderBottom: '1px solid #999', minWidth: 60 }}>&nbsp;</td>
                    <td className="center" style={{ fontSize: 18 }}>□</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #c9a84c' }}>
                  <td colSpan={2} style={{ textAlign: 'right', paddingTop: 10, fontWeight: 600 }}>合計</td>
                  <td className="center" style={{ paddingTop: 10, fontWeight: 600 }}>{s.items.reduce((sum, it) => sum + it.final_qty, 0)} 支</td>
                  <td colSpan={2} className="right" style={{ paddingTop: 10, color: '#c9a84c', fontWeight: 600 }}>NT$ {Math.round(s.subtotal).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px dashed #ccc', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
              <div>
                出貨：__________ &nbsp; 簽收大使：__________ <br />
                <span style={{ fontSize: 10 }}>（任何異常請於系統「異常上報」回報）</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                建立 {run.created_by_name || '?'} · 確認 {run.confirmed_by_name || '?'}
                {run.single_user_mode && <div style={{ color: '#f59e0b', fontSize: 10 }}>單人模式 · {run.single_user_reason}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// 簡易 QR：用 Google Chart API 的舊版 backup（無外部 lib）
// 改用簡單的 SVG-encoded fallback 圖（無真 QR）— production 應接 qrcode lib
function QRCode({ text }) {
  // 使用 server-side QR generator URL（實際 production 改用 qrcode library 內建生成）
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(text)}`
  return (
    <div style={{ textAlign: 'center', fontSize: 9, color: '#666' }}>
      <img src={url} alt="QR" style={{ width: 110, height: 110, border: '1px solid #ddd', borderRadius: 4 }} />
      <div style={{ marginTop: 4 }}>掃 QR 進收貨確認</div>
    </div>
  )
}
