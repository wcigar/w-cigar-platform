// src/pages/admin/CompensationRules.jsx
// 大使薪酬：每日門檻獎金（古巴/非古巴）+ 各位大使時薪 + 月薪試算
import { useEffect, useMemo, useState } from 'react'
import { Save, RotateCcw, Plus, Trash2, Calculator, Check, X } from 'lucide-react'
import {
  listThresholds, upsertThreshold, removeThreshold, resetDefaultThresholds,
  listAmbassadorsWithHourly, setAmbassadorHourly,
  calcDailyBonus, calcMonthlySalary,
} from '../../lib/services/compensationRules'
import PageShell, { Card } from '../../components/PageShell'

export default function CompensationRules() {
  const [thresholds, setThresholds] = useState([])
  const [ambs, setAmbs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const [simAmbId, setSimAmbId] = useState(null)

  async function reload() {
    setLoading(true)
    setThresholds(listThresholds())
    setAmbs(await listAmbassadorsWithHourly())
    setLoading(false)
  }
  useEffect(() => { reload() }, [refreshTick])

  function handleThresholdChange(id, patch) {
    const t = thresholds.find(x => x.id === id)
    if (!t) return
    upsertThreshold({ ...t, ...patch })
    setRefreshTick(n => n + 1)
  }

  function handleHourlyChange(ambId, value) {
    setAmbassadorHourly(ambId, value)
    setRefreshTick(n => n + 1)
  }

  function handleResetDefaults() {
    if (!window.confirm('還原預設門檻獎金？目前的設定會被覆蓋。')) return
    resetDefaultThresholds()
    setRefreshTick(n => n + 1)
  }

  return (
    <PageShell title="大使薪酬規則" subtitle="ADMIN · COMPENSATION" backTo="/admin/venue-hub" backLabel="酒店銷售管理">
      {loading ? <Card>載入中…</Card> : (
        <>
          <ThresholdSection
            thresholds={thresholds}
            onChange={handleThresholdChange}
            onReset={handleResetDefaults}
          />

          <HourlyRatesSection
            ambs={ambs}
            onChange={handleHourlyChange}
            onSimulate={(amb) => setSimAmbId(amb.id)}
          />

          {simAmbId && (
            <SalarySimulator
              ambassador={ambs.find(a => a.id === simAmbId)}
              thresholds={thresholds}
              onClose={() => setSimAmbId(null)}
            />
          )}
        </>
      )}
    </PageShell>
  )
}

function ThresholdSection({ thresholds, onChange, onReset }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#c9a84c' }}>📊 每日門檻獎金</div>
          <div style={{ fontSize: 11, color: '#8a8278', marginTop: 2 }}>
            單日該類雪茄賣超過門檻，每多賣 1 根多 NT$N。所有大使共用此規則。
          </div>
        </div>
        <button onClick={onReset} style={ghostBtn('#f59e0b')}>
          <RotateCcw size={12} /> 還原預設
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {thresholds.map(t => (
          <ThresholdRow key={t.id} threshold={t} onChange={p => onChange(t.id, p)} />
        ))}
      </div>

      <ThresholdPreview thresholds={thresholds} />
    </Card>
  )
}

function ThresholdRow({ threshold, onChange }) {
  const isCuban = threshold.category === 'cuban_cigar'
  const accent = isCuban ? '#a855f7' : '#3b82f6'
  return (
    <div style={{ background: '#1a1714', border: `1px solid ${accent}33`, borderRadius: 8, padding: 12, borderLeft: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: accent }}>
          {isCuban ? '🇨🇺 ' : '🌍 '}{threshold.name}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8a8278', cursor: 'pointer' }}>
          <input type="checkbox" checked={threshold.enabled !== false}
            onChange={e => onChange({ enabled: e.target.checked })} />
          啟用
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center', fontSize: 12, color: '#e8dcc8' }}>
        <div>
          <div style={{ fontSize: 10, color: '#6a655c', marginBottom: 3 }}>每日門檻（≥ 多少根才開始算）</div>
          <input type="number" min="0" value={threshold.threshold_qty}
            onChange={e => onChange({ threshold_qty: Math.max(0, parseInt(e.target.value) || 0) })}
            style={inputBox(accent)} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#6a655c', marginBottom: 3 }}>每多 1 根獎金 (NT$)</div>
          <input type="number" min="0" value={threshold.bonus_per_extra}
            onChange={e => onChange({ bonus_per_extra: Math.max(0, parseInt(e.target.value) || 0) })}
            style={inputBox(accent)} />
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: accent + 'cc' }}>
        例：今天賣 {threshold.threshold_qty + 5} 根 → 超出 5 根 × NT${threshold.bonus_per_extra} = <strong>NT${5 * threshold.bonus_per_extra}</strong> 獎金
      </div>
    </div>
  )
}

function ThresholdPreview({ thresholds }) {
  const samples = [
    { label: '單日表現一般', cuban: 2, non_cuban: 5 },
    { label: '單日表現中等', cuban: 4, non_cuban: 9 },
    { label: '單日爆表', cuban: 8, non_cuban: 15 },
  ]
  return (
    <div style={{ marginTop: 12, padding: 10, background: '#0a0a0a', borderRadius: 8, fontSize: 11 }}>
      <div style={{ color: '#8a8278', marginBottom: 6 }}>📈 不同表現對應的單日獎金</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2520' }}>
            <th style={{ textAlign: 'left', padding: 4, color: '#6a655c', fontSize: 10 }}>情境</th>
            <th style={{ textAlign: 'center', padding: 4, color: '#a855f7', fontSize: 10 }}>古巴</th>
            <th style={{ textAlign: 'center', padding: 4, color: '#3b82f6', fontSize: 10 }}>非古巴</th>
            <th style={{ textAlign: 'right', padding: 4, color: '#c9a84c', fontSize: 10 }}>當日獎金</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s, i) => {
            const r = calcDailyBonus({ cuban_cigar: s.cuban, non_cuban_cigar: s.non_cuban })
            return (
              <tr key={i} style={{ borderBottom: '1px solid #1a1714' }}>
                <td style={{ padding: 4, color: '#e8dcc8' }}>{s.label}</td>
                <td style={{ textAlign: 'center', padding: 4, color: '#a855f7' }}>{s.cuban} 根</td>
                <td style={{ textAlign: 'center', padding: 4, color: '#3b82f6' }}>{s.non_cuban} 根</td>
                <td style={{ textAlign: 'right', padding: 4, color: '#c9a84c', fontWeight: 500 }}>NT$ {r.total_bonus.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HourlyRatesSection({ ambs, onChange, onSimulate }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#c9a84c' }}>👥 大使時薪</div>
        <div style={{ fontSize: 11, color: '#8a8278', marginTop: 2 }}>
          每位大使可獨立設定時薪。月薪 = 時薪 × 上班時數 + 每日獎金累計。
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
        {ambs.map(a => (
          <div key={a.id} style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: '#e8e0d0', fontWeight: 500 }}>{a.displayName}</span>
              <button onClick={() => onSimulate(a)} title="月薪試算"
                style={{ background: 'transparent', border: '1px solid #2a2520', borderRadius: 4, color: '#8a8278', padding: '2px 6px', fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Calculator size={11} /> 試算
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8a8278' }}>
              <span>NT$</span>
              <input type="number" min="0" value={a.hourly_rate}
                onChange={e => onChange(a.id, e.target.value)}
                style={{ flex: 1, padding: '4px 6px', background: '#0a0a0a', border: '1px solid #c9a84c66', borderRadius: 4, color: '#c9a84c', fontSize: 13, fontWeight: 500, textAlign: 'right', outline: 'none' }} />
              <span>/小時</span>
            </div>
            {a.is_default && <div style={{ fontSize: 9, color: '#5a554e', marginTop: 4 }}>（預設值）</div>}
          </div>
        ))}
      </div>
    </Card>
  )
}

function SalarySimulator({ ambassador, thresholds, onClose }) {
  const [hours, setHours] = useState(160)              // 每月 8h × 20 天
  const [daysCuban, setDaysCuban] = useState(4)        // 平均每日古巴雪茄根數
  const [daysNonCuban, setDaysNonCuban] = useState(9)  // 平均每日非古巴
  const [workDays, setWorkDays] = useState(20)         // 每月工作天

  const dailySalesArr = Array.from({ length: workDays }, () => ({
    cuban_cigar: daysCuban, non_cuban_cigar: daysNonCuban,
  }))
  const result = calcMonthlySalary({
    ambassadorId: ambassador.id, monthlyHours: hours, dailySalesArr,
  })

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 12, width: '100%', maxWidth: 520, marginTop: 40, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ color: '#c9a84c', fontSize: 16, fontWeight: 500 }}>月薪試算 — {ambassador.displayName}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8a8278', cursor: 'pointer' }}><X size={14} /></button>
        </div>

        <div style={{ background: '#1a1714', borderLeft: '3px solid #3b82f6', padding: 10, marginBottom: 12, fontSize: 11, color: '#3b82f6' }}>
          時薪 NT${ambassador.hourly_rate} × 上班時數 + 每日獎金累計（{workDays} 天）
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="月工時 (h)">
            <input type="number" min="0" value={hours} onChange={e => setHours(Math.max(0, +e.target.value || 0))} style={inputStyle()} />
          </Field>
          <Field label="月工作天">
            <input type="number" min="0" max="31" value={workDays} onChange={e => setWorkDays(Math.max(0, Math.min(31, +e.target.value || 0)))} style={inputStyle()} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="每日均賣 古巴 (根)">
            <input type="number" min="0" value={daysCuban} onChange={e => setDaysCuban(Math.max(0, +e.target.value || 0))} style={inputStyle()} />
          </Field>
          <Field label="每日均賣 非古巴 (根)">
            <input type="number" min="0" value={daysNonCuban} onChange={e => setDaysNonCuban(Math.max(0, +e.target.value || 0))} style={inputStyle()} />
          </Field>
        </div>

        <div style={{ marginTop: 14, padding: 12, background: '#0a0a0a', borderRadius: 8 }}>
          <table style={{ width: '100%', fontSize: 13 }}>
            <tbody>
              <tr><td style={tdL()}>時薪 NT${ambassador.hourly_rate} × {hours}h</td><td style={tdR('#e8e0d0')}>NT$ {result.hourly_total.toLocaleString()}</td></tr>
              <tr><td style={tdL()}>+ 每日獎金 × {workDays} 天</td><td style={tdR('#c9a84c')}>NT$ {result.bonus_total.toLocaleString()}</td></tr>
              <tr style={{ borderTop: '2px solid #c9a84c' }}>
                <td style={{ ...tdL('#c9a84c', 14), fontWeight: 500, paddingTop: 8 }}>月薪合計</td>
                <td style={{ ...tdR('#c9a84c', 16), fontWeight: 600, paddingTop: 8 }}>NT$ {result.total_salary.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 10, color: '#5a655c' }}>
            單日獎金預覽：古巴 {daysCuban} 根、非古巴 {daysNonCuban} 根 → NT$ {result.daily_bonus_lines[0]?.total_bonus.toLocaleString() || 0}
          </div>
        </div>

        <button onClick={onClose} style={{ ...ghostBtn(), width: '100%', marginTop: 14, padding: 10, justifyContent: 'center' }}>關閉</button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
function inputStyle() {
  return {
    width: '100%', padding: '8px 10px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
}
function inputBox(color) {
  return { width: '100%', padding: '6px 8px', background: '#0a0a0a', border: `1px solid ${color}66`, borderRadius: 4, color, fontSize: 13, fontWeight: 500, textAlign: 'center', outline: 'none' }
}
function tdL(color, size) { return { padding: '4px 0', color: color || '#8a8278', fontSize: size || 12 } }
function tdR(color, size) { return { padding: '4px 0', textAlign: 'right', fontFamily: 'monospace', color: color || '#e8e0d0', fontSize: size || 12, fontWeight: 500 } }
function ghostBtn(color) {
  return {
    padding: '6px 10px', background: 'transparent',
    border: `1px solid ${color || '#2a2520'}`, borderRadius: 6,
    color: color || '#8a8278', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
