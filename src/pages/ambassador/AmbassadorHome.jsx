// src/pages/ambassador/AmbassadorHome.jsx
// 大使首頁。已重構為新 supply-chain session（不再接收 props.user，改從 getAmbassadorSession）。
// 舊 props API 只在 AmbassadorPunch.jsx 使用，punch 頁已下架，不再衝突。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackageCheck, ShoppingBag, TrendingUp, Trophy, AlertCircle } from 'lucide-react'
import { getAmbassadorSession } from '../../lib/services/ambassadorAuth'
import { myPendingSupplyReceipts } from '../../lib/services/supplies'
import PageShell, { Card } from '../../components/PageShell'

export default function AmbassadorHome() {
  const navigate = useNavigate()
  const session = getAmbassadorSession()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!session?.ambassador_id) return
    myPendingSupplyReceipts(session.ambassador_id).then(list => setPendingCount(list.length)).catch(() => {})
  }, [session?.ambassador_id])

  return (
    <PageShell title={`早安，${session?.name || '大使'}`} subtitle="CIGAR AMBASSADOR">
      {pendingCount > 0 && (
        <Card style={{ marginBottom: 14, borderColor: 'rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={18} color="#f87171" />
            <div style={{ flex: 1, color: '#fecaca', fontSize: 14, fontWeight: 500 }}>
              有 {pendingCount} 筆耗材待簽收
            </div>
            <button onClick={() => navigate('/ambassador/supply-receipts')}
              style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              前往簽收
            </button>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Tile icon={<TrendingUp size={20} />} label="今日業績" value="NT$ --" color="#c9a84c" onClick={() => navigate('/ambassador/performance')} />
        <Tile icon={<PackageCheck size={20} />} label="待收商品" value="- 筆" color="#14b8a6" onClick={() => navigate('/ambassador/receipts')} />
        <Tile icon={<ShoppingBag size={20} />} label="耗材申請" value="進入" color="#ec4899" onClick={() => navigate('/ambassador/supplies')} />
        <Tile icon={<Trophy size={20} />} label="本月排行" value="查看" color="#f59e0b" onClick={() => navigate('/ambassador/ranking')} />
      </div>

      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, margin: '16px 0 8px' }}>今日提醒</div>
      <Card>
        <div style={{ color: '#8a8278', fontSize: 13, lineHeight: 1.8 }}>
          · 所有銷售由 HQ 統一 key-in，大使端僅做收貨確認與耗材申請<br/>
          · 收到商品後請立即確認、有異常立即回報<br/>
          · 高風險耗材（瓦斯 / 剪 / 鑽孔器 / 通針）需主管核准，請提前申請
        </div>
      </Card>

      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 10, color: '#5a554e', letterSpacing: 2 }}>
        W CIGAR BAR · 雪茄大使系統
      </div>
    </PageShell>
  )
}

function Tile({ icon, label, value, color, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '14px 12px',
        cursor: 'pointer', transition: 'all .2s',
      }}>
      <div style={{ color, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, color: '#e8e0d0', fontWeight: 600 }}>{value}</div>
    </div>
  )
}
