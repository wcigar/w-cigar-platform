// src/pages/admin/VenueHub.jsx
// 酒店銷售管理 hub — 7 個快捷一頁集中
import { useNavigate } from 'react-router-dom'
import {
  Wine, BarChart3, Building2, Coins, Package, Truck, Users, Receipt,
} from 'lucide-react'
import PageShell, { Card } from '../../components/PageShell'

const HUB_ITEMS = [
  { icon: BarChart3, label: 'KEY 銷量',   sub: '員工每天輸入',         color: '#c9a84c', path: '/admin/venue-sales/new' },
  { icon: Building2, label: '店家管理',   sub: '27 家店 + 大使綁定',   color: '#3b82f6', path: '/admin/venues' },
  { icon: Coins,     label: '場域定價',   sub: '每店每品成本/利潤',    color: '#10b981', path: '/admin/venue-profit-rules' },
  { icon: Package,   label: '庫存矩陣',   sub: '警示 + 一鍵補貨',      color: '#f59e0b', path: '/admin/inventory' },
  { icon: Truck,     label: '補貨單',     sub: '雙人確認 + 列印',       color: '#a855f7', path: '/admin/replenishment' },
  { icon: Users,     label: '大使薪酬',   sub: '時薪 + 門檻獎金',      color: '#ef4444', path: '/admin/compensation-rules' },
  { icon: Receipt,   label: '督導結帳',   sub: '4 督導 · 每月10號前',  color: '#06b6d4', path: '/admin/collections' },
]

export default function VenueHub() {
  const navigate = useNavigate()
  return (
    <PageShell title="酒店銷售管理" subtitle="ADMIN · VENUE HUB">
      <Card style={{ marginBottom: 12, fontSize: 12, color: '#8a8278', lineHeight: 1.6 }}>
        <span style={{ color: '#c9a84c', fontWeight: 500 }}><Wine size={13} style={{ verticalAlign: 'middle' }} /> 完整銷售閉環：</span>
        員工 KEY 銷量 → 自動扣庫存 → 警示 → 一鍵補貨 → 雙人確認 → 列印 packing slip → 大使簽收 → 月底督導結帳 → 對帳單 LINE
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {HUB_ITEMS.map(item => (
          <HubBtn key={item.path} item={item} onClick={() => navigate(item.path)} />
        ))}
      </div>
    </PageShell>
  )
}

function HubBtn({ item, onClick }) {
  const { icon: Icon, label, sub, color } = item
  return (
    <div onClick={onClick} className="card" style={{
      padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
      transition: 'transform 0.1s, border-color 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
      <div style={{ color: '#5a554e', fontSize: 16 }}>›</div>
    </div>
  )
}
