// src/pages/ambassador/AmbassadorReceiptDetail.jsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react'
import PageShell, { Card } from '../../components/PageShell'

const mockItems = [
  { id: 'i1', product_name: 'Cohiba Siglo VI', qty: 3 },
  { id: 'i2', product_name: 'Montecristo No.2', qty: 5 },
  { id: 'i3', product_name: '雪松木包', qty: 2 },
]

export default function AmbassadorReceiptDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState(null) // null | 'confirm' | 'report'
  const [discrepancies, setDiscrepancies] = useState({})

  function confirmAll() {
    alert('MVP: 將呼叫 ambassador_confirm_receipt RPC (目前 mock)')
    navigate('/ambassador/receipts')
  }

  function reportIssue() {
    alert('MVP: 將呼叫 ambassador_report_receipt_error，寫 exception_events (目前 mock)')
    navigate('/ambassador/receipts')
  }

  return (
    <PageShell
      title={`收貨單 #${id}`}
      subtitle="AMBASSADOR RECEIPT DETAIL"
      actions={
        <button onClick={() => navigate('/ambassador/receipts')} style={backBtn()}>
          <ArrowLeft size={14} /> 返回
        </button>
      }
    >
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 6 }}>出貨項目</div>
        {mockItems.map(it => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #2a2520' }}>
            <span style={{ color: '#e8e0d0', fontSize: 14 }}>{it.product_name}</span>
            <span style={{ color: '#c9a84c', fontSize: 14 }}>× {it.qty}</span>
          </div>
        ))}
      </Card>

      {mode === null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={confirmAll}
            style={primaryBtn('#10b981')}>
            <CheckCircle size={16} /> 全部收到
          </button>
          <button onClick={() => setMode('report')}
            style={primaryBtn('#f87171')}>
            <AlertTriangle size={16} /> 回報異常
          </button>
        </div>
      )}

      {mode === 'report' && (
        <Card>
          <div style={{ color: '#fecaca', fontSize: 13, marginBottom: 10 }}>請選擇異常項目與類型</div>
          <div style={{ color: '#8a8278', fontSize: 11, marginBottom: 10 }}>MVP：這裡會呼叫 ambassador_report_receipt_error，同時寫 exception_events</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setMode(null)} style={primaryBtn('#6b7280')}>取消</button>
            <button onClick={reportIssue} style={primaryBtn('#f87171')}>送出回報</button>
          </div>
        </Card>
      )}
    </PageShell>
  )
}

function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }
}
function primaryBtn(color) {
  return { flex: 1, background: `${color}22`, border: `1px solid ${color}66`, color, padding: '12px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 500 }
}
