// src/pages/boss/WarRoom.jsx
// 老闆戰情室（供應鏈版，與既有 Hub/CommandCenter 獨立）
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Package, Users, AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import { getBossWarRoomDaily } from '../../lib/services/warRoom'
import PageShell, { Card, Badge } from '../../components/PageShell'

export default function WarRoom() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const d = await getBossWarRoomDaily()
      setData(d)
    } catch (e) { console.error(e) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (loading) return <PageShell title="老闆戰情室"><div style={{ textAlign: 'center', padding: 40, color: '#6a655c' }}>載入中...</div></PageShell>
  const s = data?.summary || {}

  return (
    <PageShell
      title="老闆戰情室"
      subtitle="BOSS WAR ROOM · SUPPLY CHAIN"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/')} style={backBtn()}><ArrowLeft size={14} /> 主選單</button>
          <button onClick={load} style={backBtn()}><RefreshCw size={14} /></button>
        </div>
      }
    >
      {/* 核心營收 4 卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Metric label="今日總營收" value={`NT$ ${(s.total_amount || 0).toLocaleString()}`} accent="#ef4444" sub={`${s.total_qty || 0} 支`} />
        <Metric label="現金" value={`NT$ ${(s.cash || 0).toLocaleString()}`} accent="#10b981" />
        <Metric label="匯款" value={`NT$ ${(s.transfer || 0).toLocaleString()}`} accent="#14b8a6" />
        <Metric label="未收款" value={`NT$ ${(s.unpaid || 0).toLocaleString()}`} accent="#f87171" sub={`月結待收 NT$ ${(s.monthly_pending || 0).toLocaleString()}`} />
      </div>

      {/* 運營完成率 */}
      <SectionTitle>運營完成率</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Progress label="補貨完成" pct={s.replenishment_completion || 0} color="#14b8a6" />
        <Progress label="出貨完成" pct={s.shipment_completion || 0} color="#c9a84c" />
        <Progress label="大使簽收" pct={s.receipt_confirmation || 0} color="#f59e0b" />
        <Progress label="收帳完成" pct={s.collection_completion || 0} color="#10b981" />
      </div>

      {/* 排行榜區 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 18 }}>
        <RankingList title="酒店營收 Top" icon={<Package size={14} color="#c9a84c" />} items={data?.venue_ranking || []} valueKey="amount" fmt={v => `NT$ ${v.toLocaleString()}`} />
        <RankingList title="大使業績 Top" icon={<Users size={14} color="#c9a84c" />} items={data?.ambassador_ranking || []} valueKey="amount" fmt={v => `NT$ ${v.toLocaleString()}`} />
        <RankingList title="商品銷售 Top" icon={<TrendingUp size={14} color="#c9a84c" />} items={data?.product_ranking || []} valueKey="qty" fmt={v => `${v} 支`} />
      </div>

      {/* 異常 */}
      <SectionTitle>
        未處理異常
        <Badge color="#dc2626">{data?.exceptions?.length || 0}</Badge>
      </SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {(data?.exceptions || []).map(e => (
          <Card key={e.id} style={{ borderLeft: `3px solid ${e.severity === 'critical' ? '#dc2626' : '#f59e0b'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color={e.severity === 'critical' ? '#dc2626' : '#f59e0b'} />
              <div style={{ color: '#e8e0d0', fontSize: 13 }}>{e.title}</div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#5a554e', textAlign: 'center', marginTop: 12 }}>
        資料來源：mock · Phase 2 將接 get_boss_war_room_daily RPC
      </div>
    </PageShell>
  )
}

function Metric({ label, value, sub, accent }) {
  return (
    <Card style={{ borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, color: '#e8e0d0', fontWeight: 600, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#6a655c' }}>{sub}</div>}
    </Card>
  )
}
function Progress({ label, pct, color }) {
  const p = Math.round(pct * 100)
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#8a8278' }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 600 }}>{p}%</span>
      </div>
      <div style={{ height: 6, background: '#1a1714', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
    </Card>
  )
}
function RankingList({ title, icon, items, valueKey, fmt }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: '#8a8278', letterSpacing: 1 }}>
        {icon}{title}
      </div>
      {items.slice(0, 5).map((it, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid #2a2520' : 'none' }}>
          <span style={{ fontSize: 12, color: '#e8e0d0' }}>
            <span style={{ color: '#c9a84c', marginRight: 6 }}>#{i + 1}</span>
            {it.name || it.venue_name || it.product_name}
          </span>
          <span style={{ fontSize: 12, color: '#c9a84c' }}>{fmt(it[valueKey])}</span>
        </div>
      ))}
    </Card>
  )
}
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, margin: '14px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {children}
    </div>
  )
}
function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }
}
