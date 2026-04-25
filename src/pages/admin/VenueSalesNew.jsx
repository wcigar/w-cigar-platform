// src/pages/admin/VenueSalesNew.jsx
// 酒店銷售 Key-in 容器：快速矩陣模式 | 進階明細模式
// AdminGuard 保護（只有員工可進，大使 session 被擋）
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LayoutGrid, ListChecks } from 'lucide-react'
import PageShell from '../../components/PageShell'
import VenueSalesMatrix from './VenueSalesMatrix'
import VenueSalesDetailed from './VenueSalesDetailed'

const MODE_KEY = 'venue_sales_last_mode'

export default function VenueSalesNew() {
  const navigate = useNavigate()
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(MODE_KEY) || 'matrix' } catch { return 'matrix' }
  })

  function switchMode(m) {
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch {}
  }

  return (
    <PageShell
      title="新增酒店銷售"
      subtitle="依現有 Excel 銷量表邏輯 · 快速輸入各店每日銷售"
      actions={
        <button onClick={() => navigate('/admin/venue-sales')} style={backBtn()}>
          <ArrowLeft size={14} /> 返回
        </button>
      }
    >
      {/* Mode tab */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, padding: 4, background: 'rgba(255,255,255,0.02)', border: '1px solid #2a2520', borderRadius: 8 }}>
        <ModeBtn active={mode === 'matrix'} onClick={() => switchMode('matrix')} icon={<LayoutGrid size={14} />}>
          快速矩陣模式
        </ModeBtn>
        <ModeBtn active={mode === 'detailed'} onClick={() => switchMode('detailed')} icon={<ListChecks size={14} />}>
          進階明細模式
        </ModeBtn>
      </div>

      {mode === 'matrix' ? <VenueSalesMatrix /> : <VenueSalesDetailed />}

      <div style={{ marginTop: 14, fontSize: 10, color: '#5a554e', textAlign: 'center' }}>
        MVP · USE_MOCK=true · 送出不會寫入 production DB
      </div>
    </PageShell>
  )
}

function ModeBtn({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 14px', borderRadius: 6, border: 'none',
      background: active ? 'linear-gradient(135deg, rgba(201,168,76,0.2) 0%, rgba(201,168,76,0.1) 100%)' : 'transparent',
      color: active ? '#c9a84c' : '#8a8278',
      fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      letterSpacing: 1,
      boxShadow: active ? 'inset 0 0 0 1px rgba(201,168,76,0.4)' : 'none',
    }}>
      {icon} {children}
    </button>
  )
}

function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }
}
