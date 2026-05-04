import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, LayoutGrid, FileText, Search, User } from 'lucide-react'
import { supabase } from '../lib/supabase'

const fmt = (n) => (Number(n) || 0).toLocaleString()

const C = {
  bg: '#0a0a0a',
  card: '#1a1714',
  cardAlt: '#1a1a1a',
  gold: '#c9a84c',
  goldDim: '#8b7a3e',
  text: '#e8e0d0',
  textDim: '#8a8278',
  textMuted: '#5a554e',
  border: '#2a2520',
  red: '#c44d4d',
  green: '#4da86c',
  blue: '#4d8ac4',
  amber: '#d4a04e',
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '深夜好'
  if (h < 11) return '早安'
  if (h < 14) return '午安'
  if (h < 18) return '下午好'
  return '晚安'
}

export default function SimpleHome() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState([])
  const [liveCount, setLiveCount] = useState({})
  const [dashboard, setDashboard] = useState(null)
  const [working, setWorking] = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [gRes, fRes, dRes, sRes] = await Promise.all([
        supabase.from('hub_groups').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('hub_features').select('group_id, status').eq('is_active', true),
        supabase.rpc('boss_unified_dashboard'),
        supabase.from('schedules').select('shift').eq('date', todayStr()),
      ])
      setGroups(gRes.data || [])
      const counts = (fRes.data || []).reduce((acc, f) => {
        if (f.status === 'live') acc[f.group_id] = (acc[f.group_id] || 0) + 1
        return acc
      }, {})
      setLiveCount(counts)
      setDashboard(dRes.data || null)
      const wc = (sRes.data || []).filter(s => s.shift !== '休假' && s.shift !== '臨時請假').length
      setWorking(wc)
    } catch (err) {
      console.error('SimpleHome load error', err)
    } finally {
      setLoading(false)
    }
  }

  const todaySales = dashboard?.today?.total_sales || 0
  const monthSales = dashboard?.this_month?.total_sales || 0
  const monthExpenses = dashboard?.month_expenses?.total_expenses || 0
  const monthNet = monthSales - monthExpenses
  const lowStock = dashboard?.pending?.low_stock || 0
  const vipReceivable = dashboard?.pending?.vip_receivable || 0
  const dealerOrders = dashboard?.pending?.dealer_orders || 0
  const alertCount =
    (lowStock > 0 ? 1 : 0) + (vipReceivable > 0 ? 1 : 0) + (dealerOrders > 0 ? 1 : 0)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, paddingBottom: 96 }}>
      <style>{`
        .v2-group-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 768px) {
          .v2-group-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .v2-card-hover { transition: transform .25s, border-color .25s, box-shadow .25s; }
        .v2-card-hover:hover { transform: translateY(-1px); }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: '20px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: C.textDim }}>{greeting()}，老闆</div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: C.gold,
              marginTop: 2,
              letterSpacing: 1,
            }}
          >
            W Cigar Hub
          </div>
        </div>
        <div
          style={{ position: 'relative', padding: 8, cursor: 'pointer' }}
          title="通知（Phase 3 開發）"
        >
          <Bell size={22} color={C.textDim} />
          {alertCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 9,
                background: C.red,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {alertCount}
            </span>
          )}
        </div>
      </div>

      {/* 3 KPI cards */}
      <div
        style={{
          padding: '0 20px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        <KpiCard
          label="今日營收"
          value={`$${fmt(todaySales)}`}
          accent={C.gold}
          loading={loading}
        />
        <KpiCard
          label="月淨利"
          value={`$${fmt(monthNet)}`}
          accent={monthNet >= 0 ? C.green : C.red}
          loading={loading}
        />
        <KpiCard
          label="在班員工"
          value={`${working}`}
          accent={C.blue}
          loading={loading}
        />
      </div>

      {/* Alert band */}
      {alertCount > 0 && (
        <div
          style={{
            margin: '0 20px 16px',
            padding: '12px 14px',
            background: 'rgba(196,77,77,0.08)',
            border: '1px solid rgba(196,77,77,0.25)',
            borderRadius: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          <AlertItem label="低庫存" value={lowStock} />
          <AlertItem label="VIP 欠款" value={vipReceivable} />
          <AlertItem label="經銷商待審" value={dealerOrders} />
        </div>
      )}

      {/* 8 group cards */}
      <div style={{ padding: '0 20px 24px' }}>
        <div
          style={{
            fontSize: 11,
            color: C.textMuted,
            marginBottom: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          業務群組
        </div>
        <div className="v2-group-grid">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <GroupCardSkeleton key={i} />)
            : groups.map(g => (
                <GroupCard
                  key={g.id}
                  group={g}
                  liveCount={liveCount[g.id] || 0}
                  onClick={() => navigate(g.path)}
                />
              ))}
        </div>
        {!loading && groups.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: C.textDim,
              fontSize: 13,
            }}
          >
            尚未設定群組（請檢查 hub_groups.is_active）
          </div>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(14,12,10,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          justifyContent: 'space-around',
          padding: '8px 0 calc(8px + env(safe-area-inset-bottom))',
          zIndex: 100,
        }}
      >
        <TabItem icon={<LayoutGrid size={20} />} label="總覽" active />
        <TabItem icon={<FileText size={20} />} label="報表" />
        <TabItem icon={<Search size={20} />} label="搜尋" />
        <TabItem icon={<User size={20} />} label="我" />
      </div>
    </div>
  )
}

function KpiCard({ label, value, accent, loading }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        minHeight: 76,
      }}
    >
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: accent,
          opacity: loading ? 0.3 : 1,
          transition: 'opacity .3s',
          letterSpacing: 0.5,
        }}
      >
        {loading ? '—' : value}
      </div>
    </div>
  )
}

function AlertItem({ label, value }) {
  const active = value > 0
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: active ? C.red : C.textMuted,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function GroupCard({ group, liveCount, onClick }) {
  const accent = group.color || C.gold
  return (
    <div
      onClick={onClick}
      className="v2-card-hover"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '14px 14px 12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 110,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.boxShadow = `0 4px 24px ${accent}22`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.border
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}66, transparent)`,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 26, lineHeight: 1 }}>{group.icon || '◆'}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 10,
            background: 'rgba(77,168,108,0.12)',
            color: C.green,
            letterSpacing: 0.5,
          }}
        >
          {liveCount} live
        </span>
      </div>
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: C.text,
            marginBottom: 2,
          }}
        >
          {group.name}
        </div>
        {group.subtitle && (
          <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.4 }}>
            {group.subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupCardSkeleton() {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 14,
        minHeight: 110,
        opacity: 0.5,
      }}
    >
      <div
        style={{
          height: 26,
          width: 26,
          background: C.border,
          borderRadius: 4,
          marginBottom: 12,
        }}
      />
      <div
        style={{
          height: 12,
          width: '60%',
          background: C.border,
          borderRadius: 3,
          marginBottom: 6,
        }}
      />
      <div
        style={{
          height: 10,
          width: '90%',
          background: C.border,
          borderRadius: 3,
        }}
      />
    </div>
  )
}

function TabItem({ icon, label, active }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '4px 14px',
        color: active ? C.gold : C.textMuted,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            width: 14,
            height: 2,
            borderRadius: 1,
            background: C.gold,
            boxShadow: `0 0 8px ${C.gold}99`,
          }}
        />
      )}
      {icon}
      <div style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{label}</div>
    </div>
  )
}

export function V2Placeholder() {
  const navigate = useNavigate()
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div style={{ fontSize: 56 }}>🚧</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.gold }}>Coming in Phase 3</div>
      <div style={{ fontSize: 13, color: C.textDim, maxWidth: 320, lineHeight: 1.6 }}>
        群組詳細頁尚未實作。Phase 3 會把 8 個群組各自展開成完整功能列表。
      </div>
      <button
        onClick={() => navigate('/v2')}
        style={{
          padding: '10px 24px',
          background: C.gold,
          color: C.bg,
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: 1,
        }}
      >
        ← 返回 /v2
      </button>
    </div>
  )
}
