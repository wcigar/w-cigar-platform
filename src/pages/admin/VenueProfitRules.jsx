// src/pages/admin/VenueProfitRules.jsx
// 場域抽成規則 CRUD：每家店 active 規則新增/編輯 + 試算器
import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Calculator, X, Search, Check, AlertTriangle } from 'lucide-react'
import {
  listVenueProfitRules, upsertVenueProfitRule, deactivateVenueProfitRule,
  simulateProfit, SETTLEMENT_TYPES, COMMISSION_BASIS, SETTLEMENT_CYCLES,
} from '../../lib/services/venueProfitRules'
import PageShell, { Card, Badge } from '../../components/PageShell'

export default function VenueProfitRules() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ q: '', region: 'all', status: 'all' })
  const [editing, setEditing] = useState(null) // null | rule | { venue_id, venue }
  const [simulating, setSimulating] = useState(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    setLoading(true)
    const r = await listVenueProfitRules()
    setRules(r)
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => rules.filter(r => {
    if (filter.region !== 'all' && r.venue?.region !== filter.region) return false
    if (filter.status === 'set' && !r.has_rule) return false
    if (filter.status === 'unset' && r.has_rule) return false
    if (filter.q.trim()) {
      const q = filter.q.trim().toLowerCase()
      if (!r.venue?.name?.toLowerCase().includes(q)) return false
    }
    return true
  }), [rules, filter])

  const stats = useMemo(() => ({
    total: rules.length,
    set: rules.filter(r => r.has_rule).length,
    unset: rules.filter(r => !r.has_rule).length,
  }), [rules])

  const session = (() => {
    try { return JSON.parse(localStorage.getItem('w_cigar_user') || '{}') } catch { return {} }
  })()
  const actor = { id: session.id || 'unknown', name: session.name || '員工' }

  async function handleSave(payload) {
    setBusy(true)
    const res = await upsertVenueProfitRule(payload, actor)
    setBusy(false)
    if (res?.success === false) { alert(res.error || '儲存失敗'); return }
    setEditing(null)
    reload()
  }

  return (
    <PageShell title="場域抽成規則" subtitle="ADMIN · VENUE PROFIT RULES">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {kpi('店家總數', stats.total, '#e8e0d0')}
        {kpi('已設規則', stats.set, '#10b981')}
        {kpi('未設規則', stats.unset, '#f59e0b')}
      </div>

      <Card style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6a655c' }} />
          <input value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
            placeholder="搜尋店家"
            style={inputStyle({ paddingLeft: 30 })} />
        </div>
        <select value={filter.region} onChange={e => setFilter(f => ({ ...f, region: e.target.value }))} style={inputStyle({ width: 'auto' })}>
          <option value="all">全部地區</option>
          <option value="taipei">台北</option>
          <option value="taichung">台中</option>
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} style={inputStyle({ width: 'auto' })}>
          <option value="all">全部狀態</option>
          <option value="set">已設</option>
          <option value="unset">未設</option>
        </select>
      </Card>

      <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 8, padding: '0 4px' }}>
        每家店 1 筆 active 規則 · 月底結算自動套用
      </div>

      {loading ? (
        <Card>載入中…</Card>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', color: '#6a655c', padding: 30 }}>沒有符合條件的店家</Card>
      ) : (
        filtered.map(r => (
          <RuleRow key={r.venue_id} rule={r}
            onEdit={() => setEditing(r)}
            onSimulate={() => setSimulating(r)}
          />
        ))
      )}

      {editing && (
        <RuleEditModal rule={editing} actor={actor} busy={busy}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {simulating && (
        <SimulateModal rule={simulating} onClose={() => setSimulating(null)} />
      )}
    </PageShell>
  )
}

function kpi(label, value, color) {
  return (
    <div style={{ flex: 1, minWidth: 90, padding: 10, background: '#1a1714', border: `1px solid ${color}44`, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: color, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function RuleRow({ rule, onEdit, onSimulate }) {
  const set = rule.has_rule
  const borderColor = set ? '#10b981' : '#f59e0b'
  return (
    <div style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 12, marginBottom: 8, borderLeft: `3px solid ${borderColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#e8e0d0' }}>{rule.venue?.name}</span>
            <Badge color={rule.venue?.region === 'taipei' ? '#3b82f6' : '#a855f7'}>
              {rule.venue?.region === 'taipei' ? '台北' : '台中'}
            </Badge>
            {set ? (
              <Badge color="#10b981">{SETTLEMENT_TYPES[rule.settlement_type]?.label || rule.settlement_type}</Badge>
            ) : (
              <span style={{ fontSize: 10, color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={10} /> 尚未設定
              </span>
            )}
          </div>
          {set ? (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6, fontSize: 11 }}>
              <Mini label="規則名" value={rule.rule_name} />
              <Mini label="場域分潤" value={`${(rule.venue_share_rate*100).toFixed(0)}%`} color="#a855f7" />
              <Mini label="公司毛利" value={`${(rule.company_margin_rate*100).toFixed(0)}%`} color="#10b981" />
              <Mini label="大使抽" value={`${(rule.ambassador_commission_rate*100).toFixed(0)}% × ${COMMISSION_BASIS[rule.ambassador_commission_basis]?.label || ''}`} color="#c9a84c" />
              <Mini label="結算" value={`${SETTLEMENT_CYCLES[rule.settlement_cycle]?.label || ''} · T+${rule.payment_terms_days || 0}`} />
            </div>
          ) : (
            <div style={{ marginTop: 4, fontSize: 11, color: '#8a8278' }}>點右側「新增規則」設定此店條款</div>
          )}
          {rule.note && <div style={{ marginTop: 4, fontSize: 10, color: '#6a655c', fontStyle: 'italic' }}>{rule.note}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {set && <button onClick={onSimulate} style={ghostBtn('#3b82f6')}><Calculator size={12} /> 試算</button>}
          <button onClick={onEdit} style={ghostBtn(set ? '#c9a84c' : '#10b981')}>
            {set ? <><Pencil size={12} /> 編輯</> : <><Plus size={12} /> 新增規則</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#6a655c', fontSize: 10 }}>{label}</div>
      <div style={{ color: color || '#e8e0d0', fontSize: 11, marginTop: 1 }}>{value}</div>
    </div>
  )
}

function RuleEditModal({ rule, actor, busy, onClose, onSave }) {
  const [draft, setDraft] = useState({
    rule_name: rule.rule_name && rule.has_rule ? rule.rule_name : `${rule.venue?.name} 抽成規則`,
    settlement_type: rule.settlement_type || 'consignment',
    venue_share_rate: rule.venue_share_rate ?? 0.30,
    company_margin_rate: rule.company_margin_rate ?? 0.40,
    ambassador_commission_basis: rule.ambassador_commission_basis || 'gross_profit',
    ambassador_commission_rate: rule.ambassador_commission_rate ?? 0.10,
    settlement_cycle: rule.settlement_cycle || 'monthly',
    payment_terms_days: rule.payment_terms_days ?? 30,
    note: rule.note || '',
  })
  function set(k, v) { setDraft(d => ({ ...d, [k]: v })) }

  function submit() {
    onSave({ ...draft, venue_id: rule.venue_id })
  }

  // Real-time simulation preview
  const sim = simulateProfit(draft, { revenue: 100000, cost: 40000 })

  return (
    <Modal title={`${rule.has_rule ? '編輯' : '新增'} — ${rule.venue?.name}`} onClose={onClose} maxWidth={580}>
      <Field label="規則名（內部備註）">
        <input value={draft.rule_name} onChange={e => set('rule_name', e.target.value)} style={inputStyle()} />
      </Field>

      <Field label="結算類型">
        <select value={draft.settlement_type} onChange={e => set('settlement_type', e.target.value)} style={inputStyle()}>
          {Object.entries(SETTLEMENT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.label} — {v.desc}</option>
          ))}
        </select>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={`場域分潤 % (${(draft.venue_share_rate * 100).toFixed(0)}%)`}>
          <input type="range" min="0" max="100" step="1"
            value={Math.round(draft.venue_share_rate * 100)}
            onChange={e => set('venue_share_rate', Number(e.target.value) / 100)}
            style={{ width: '100%' }} />
        </Field>
        <Field label={`公司毛利 % (${(draft.company_margin_rate * 100).toFixed(0)}%)`}>
          <input type="range" min="0" max="100" step="1"
            value={Math.round(draft.company_margin_rate * 100)}
            onChange={e => set('company_margin_rate', Number(e.target.value) / 100)}
            style={{ width: '100%' }} />
        </Field>
      </div>

      <Field label="大使抽成基準">
        <select value={draft.ambassador_commission_basis} onChange={e => set('ambassador_commission_basis', e.target.value)} style={inputStyle()}>
          {Object.entries(COMMISSION_BASIS).map(([k, v]) => (
            <option key={k} value={k}>{v.label} — {v.desc}</option>
          ))}
        </select>
      </Field>

      <Field label={`大使抽成 % (${(draft.ambassador_commission_rate * 100).toFixed(0)}%)`}>
        <input type="range" min="0" max="50" step="1"
          value={Math.round(draft.ambassador_commission_rate * 100)}
          onChange={e => set('ambassador_commission_rate', Number(e.target.value) / 100)}
          style={{ width: '100%' }} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="結算週期">
          <select value={draft.settlement_cycle} onChange={e => set('settlement_cycle', e.target.value)} style={inputStyle()}>
            {Object.entries(SETTLEMENT_CYCLES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
        <Field label="付款條件 (T+N 天)">
          <input type="number" min="0" max="120" value={draft.payment_terms_days}
            onChange={e => set('payment_terms_days', Number(e.target.value))}
            style={inputStyle()} />
        </Field>
      </div>

      <Field label="備註（選填）">
        <input value={draft.note} onChange={e => set('note', e.target.value)} placeholder="例如：節日另計、首三個月優惠..." style={inputStyle()} />
      </Field>

      {/* 即時試算預覽 */}
      <div style={{ background: '#1a1714', border: '1px solid #c9a84c33', borderRadius: 8, padding: 10, marginTop: 12 }}>
        <div style={{ fontSize: 11, color: '#c9a84c', marginBottom: 6, fontWeight: 500 }}>📊 假設月營業額 NT$100,000 / 成本 NT$40,000</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}>
          <Mini label="毛利" value={`NT$ ${sim.gross_profit.toLocaleString()}`} color="#e8e0d0" />
          <Mini label="場域分潤" value={`NT$ ${sim.venue_share.toLocaleString()}`} color="#a855f7" />
          <Mini label="公司毛利" value={`NT$ ${sim.company_gross.toLocaleString()}`} color="#10b981" />
          <Mini label="大使抽成" value={`NT$ ${sim.ambassador_commission.toLocaleString()}`} color="#c9a84c" />
        </div>
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #2a2520', fontSize: 12, color: '#c9a84c', textAlign: 'right' }}>
          公司淨利 NT$ {sim.company_net.toLocaleString()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={{ ...ghostBtn(), flex: 1 }}>取消</button>
        <button onClick={submit} disabled={busy} style={{ ...primaryBtn(), flex: 2, opacity: busy ? 0.5 : 1 }}>
          <Check size={14} /> {busy ? '儲存中…' : '儲存規則'}
        </button>
      </div>
    </Modal>
  )
}

function SimulateModal({ rule, onClose }) {
  const [revenue, setRevenue] = useState(100000)
  const [cost, setCost] = useState(40000)
  const sim = simulateProfit(rule, { revenue, cost })
  return (
    <Modal title={`試算 — ${rule.venue?.name}`} onClose={onClose} maxWidth={500}>
      <div style={{ background: '#1a1714', borderLeft: '3px solid #3b82f6', padding: 10, marginBottom: 12, fontSize: 11, color: '#3b82f6', lineHeight: 1.5 }}>
        輸入假設的月營業額 + 進貨成本，立刻看到場域分潤、公司毛利、大使抽成、淨利
      </div>
      <Field label="月營業額 (NT$)">
        <input type="number" min="0" value={revenue} onChange={e => setRevenue(Number(e.target.value) || 0)} style={inputStyle()} />
      </Field>
      <Field label="進貨成本 (NT$)">
        <input type="number" min="0" value={cost} onChange={e => setCost(Number(e.target.value) || 0)} style={inputStyle()} />
      </Field>
      <div style={{ marginTop: 14, padding: 12, background: '#0a0a0a', borderRadius: 8 }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <tbody>
            <tr style={tr()}><td style={tdL()}>營業額</td><td style={tdR('#e8e0d0')}>NT$ {sim.revenue.toLocaleString()}</td></tr>
            <tr style={tr()}><td style={tdL()}>− 進貨成本</td><td style={tdR('#ef4444')}>NT$ {sim.cost.toLocaleString()}</td></tr>
            <tr style={tr(true)}><td style={tdL()}>毛利</td><td style={tdR('#e8e0d0')}>NT$ {sim.gross_profit.toLocaleString()}</td></tr>
            <tr style={tr()}><td style={tdL()}>− 場域分潤</td><td style={tdR('#a855f7')}>NT$ {sim.venue_share.toLocaleString()}</td></tr>
            <tr style={tr(true)}><td style={tdL()}>公司毛利</td><td style={tdR('#10b981')}>NT$ {sim.company_gross.toLocaleString()}</td></tr>
            <tr style={tr()}><td style={tdL()}>− 大使抽成（{COMMISSION_BASIS[rule.ambassador_commission_basis]?.label}）</td><td style={tdR('#c9a84c')}>NT$ {sim.ambassador_commission.toLocaleString()}</td></tr>
            <tr style={tr(true, '#c9a84c')}><td style={tdL('#c9a84c', 14)}>公司淨利</td><td style={tdR('#c9a84c', 14)}>NT$ {sim.company_net.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>
      <button onClick={onClose} style={{ ...ghostBtn(), marginTop: 14, width: '100%' }}>關閉</button>
    </Modal>
  )
}

function tr(emphasis, color) {
  return { borderTop: emphasis ? `1px solid ${color || '#2a2520'}` : 'none' }
}
function tdL(color, size) { return { padding: '6px 4px', color: color || '#8a8278', fontSize: size || 12 } }
function tdR(color, size) { return { padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace', color: color || '#e8e0d0', fontSize: size || 12, fontWeight: 500 } }

function Modal({ title, children, onClose, maxWidth }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#15110f', border: '1px solid #2a2520', borderRadius: 12,
        width: '100%', maxWidth: maxWidth || 520, marginTop: 40, padding: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ color: '#c9a84c', fontSize: 16, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8a8278', cursor: 'pointer', padding: 4 }}>
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4, letterSpacing: 1 }}>{label}</div>
      {children}
    </div>
  )
}

function inputStyle(extra = {}) {
  return {
    width: '100%', padding: '8px 10px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8',
    fontSize: 13, outline: 'none', boxSizing: 'border-box', ...extra,
  }
}
function primaryBtn() {
  return {
    padding: '10px 14px', background: '#c9a84c', border: 'none', borderRadius: 6,
    color: '#0a0a0a', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  }
}
function ghostBtn(color) {
  return {
    padding: '6px 10px', background: 'transparent',
    border: `1px solid ${color || '#2a2520'}`, borderRadius: 6,
    color: color || '#8a8278', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
