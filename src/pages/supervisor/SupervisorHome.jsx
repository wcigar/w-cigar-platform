// src/pages/supervisor/SupervisorHome.jsx
// 督導 Home 頁 — 5/10 凌晨外勤手機優先設計
//
// 上線目標：5 位督導凌晨打開，3 秒內看懂「今晚要做什麼、做了多少、還剩多少」
//
// 從上到下：
//   1. 頭部：W logo + 督導名 + 工號 + 登出
//   2. 標題：YYYY-MM 結帳
//   3. KPI 卡：本月應收總額 + 我管 X 家 + 三狀態統計
//   4. 店家清單：每家店 card（店名/地區/應收/狀態/順序按鈕/我約 XX:XX 備註）
//   5. 底部：今晚總計 + 「我已轉帳」按鈕（所有店收完才啟用）

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMyVenues, getMonthlyDue, getAuditedVenuesToday,
  venueStatus, STATUS_META, recordTransferLog, todayISO,
} from '../../lib/services/supervisorHome'
import { getDefaultPeriod } from '../../lib/services/collections'
import { getSupervisorSession, logoutSupervisor } from '../../lib/services/supervisorAuth'

// 排序 / 備註本地存 sessionStorage（按 brief 規格）
const ORDER_KEY = 'WCB_SUPERVISOR_ORDER'
const NOTE_KEY  = 'WCB_SUPERVISOR_NOTES'

export default function SupervisorHome() {
  const navigate = useNavigate()
  const session = getSupervisorSession()
  const [venues, setVenues] = useState([])
  const [period, setPeriod] = useState('')
  const [dueByVenue, setDueByVenue] = useState({})
  const [auditedSet, setAuditedSet] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [transferred, setTransferred] = useState(false)
  const [orderMap, setOrderMap] = useState({})  // venue_id -> sort order
  const [noteMap, setNoteMap] = useState({})    // venue_id -> "我約 22:00" 備註

  // 載入所有資料
  useEffect(() => {
    if (!session?.supervisor_id) {
      navigate('/supervisor/login', { replace: true })
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const p = await getDefaultPeriod()
        if (cancelled) return
        setPeriod(p)
        const myVenues = await getMyVenues(session.supervisor_id)
        if (cancelled) return
        setVenues(myVenues)
        if (myVenues.length === 0) { setLoading(false); return }
        const venueIds = myVenues.map(v => v.id)
        const [dues, audited] = await Promise.all([
          getMonthlyDue(p, venueIds),
          getAuditedVenuesToday(session.supervisor_id, todayISO()),
        ])
        if (cancelled) return
        const dueMap = {}
        dues.forEach(d => { dueMap[d.venue_id] = d })
        setDueByVenue(dueMap)
        setAuditedSet(audited)
      } catch (e) {
        if (!cancelled) setError('載入失敗，下拉重新整理或重新登入')
        console.error('[SupervisorHome]', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [session?.supervisor_id])

  // 從 sessionStorage 讀順序 + 備註
  useEffect(() => {
    try {
      const o = JSON.parse(sessionStorage.getItem(ORDER_KEY) || '{}')
      const n = JSON.parse(sessionStorage.getItem(NOTE_KEY) || '{}')
      setOrderMap(o)
      setNoteMap(n)
    } catch {}
  }, [])

  function persistOrder(next) {
    setOrderMap(next)
    try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(next)) } catch {}
  }
  function persistNote(venueId, value) {
    const next = { ...noteMap, [venueId]: value }
    setNoteMap(next)
    try { sessionStorage.setItem(NOTE_KEY, JSON.stringify(next)) } catch {}
  }

  // 排序的店家清單
  const sortedVenues = useMemo(() => {
    return [...venues].sort((a, b) => {
      const oa = orderMap[a.id] ?? 999
      const ob = orderMap[b.id] ?? 999
      if (oa !== ob) return oa - ob
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [venues, orderMap])

  // 計算 stats
  const stats = useMemo(() => {
    let due = 0, paid = 0, pending = 0, audited = 0, doneCount = 0
    sortedVenues.forEach(v => {
      const d = dueByVenue[v.id]
      due += d?.due_amount || 0
      paid += d?.paid_amount || 0
      const s = venueStatus(d, auditedSet.has(v.id))
      if (s === 'pending') pending++
      else if (s === 'audited') audited++
      else if (s === 'paid') doneCount++
    })
    return { due, paid, pending, audited, doneCount, total: sortedVenues.length }
  }, [sortedVenues, dueByVenue, auditedSet])

  const allDone = stats.total > 0 && stats.doneCount === stats.total

  function moveUp(venueId, currentIdx) {
    if (currentIdx <= 0) return
    const next = { ...orderMap }
    const aboveId = sortedVenues[currentIdx - 1].id
    next[venueId] = (orderMap[aboveId] ?? currentIdx - 1) - 1
    persistOrder(next)
  }
  function moveDown(venueId, currentIdx) {
    if (currentIdx >= sortedVenues.length - 1) return
    const next = { ...orderMap }
    const belowId = sortedVenues[currentIdx + 1].id
    next[venueId] = (orderMap[belowId] ?? currentIdx + 1) + 1
    persistOrder(next)
  }

  async function handleTransfer() {
    if (!allDone || transferring) return
    setTransferring(true)
    const res = await recordTransferLog({
      supervisor_id: session.supervisor_id,
      period,
      total_amount: stats.paid,
      notes: `督導 ${session.name} 凌晨轉帳 / 應收 NT$${Math.round(stats.due)} / 實收 NT$${Math.round(stats.paid)}`,
    })
    setTransferring(false)
    if (res.success) {
      setTransferred(true)
      // TODO: LINE 通知 hook 預留位
    } else {
      alert(res.error || '轉帳記錄失敗')
    }
  }

  function handleLogout() {
    logoutSupervisor()
    navigate('/supervisor/login', { replace: true })
  }

  function handleVisitVenue(venueId) {
    navigate(`/supervisor/visit/${venueId}`)
  }

  if (!session) return null

  // ========== Render ==========
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e8dcc8', paddingBottom: 120 }}>
      {/* 頭部 */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#0a0a0a',
        borderBottom: '1px solid #2a2520', padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#c9a84c', lineHeight: 1 }}>W</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#e8dcc8' }}>{session.name}</div>
            <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1 }}>工號 {session.login_code}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          padding: '6px 12px', background: 'transparent',
          border: '1px solid #2a2520', borderRadius: 6,
          color: '#8a8278', fontSize: 12, cursor: 'pointer',
        }}>登出</button>
      </header>

      <div style={{ padding: 18, maxWidth: 600, margin: '0 auto' }}>
        {/* 標題 + KPI */}
        <div style={{ marginTop: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 4 }}>MONTHLY COLLECTION</div>
          <div style={{ fontSize: 22, color: '#c9a84c', fontWeight: 500, letterSpacing: 1, marginTop: 4 }}>
            {period || '—'} 結帳
          </div>
        </div>

        {/* 應收總額大字 */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1714 0%, #15110f 100%)',
          border: '1px solid #c9a84c44', borderRadius: 12, padding: 18, marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: 6 }}>本月應收</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#c9a84c', letterSpacing: 1, lineHeight: 1.2 }}>
            NT$ {Math.round(stats.due).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#8a8278', marginTop: 6 }}>
            我管 {stats.total} 家店 · 已收 NT$ {Math.round(stats.paid).toLocaleString()}
          </div>
        </div>

        {/* 三狀態統計 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <StatusPill label="未到" count={stats.pending} color="#8a8278" />
          <StatusPill label="已打卡" count={stats.audited} color="#f59e0b" />
          <StatusPill label="已收款" count={stats.doneCount} color="#10b981" />
        </div>

        {/* Loading / Error / Empty / List */}
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#8a8278', fontSize: 13 }}>載入中…</div>
        ) : error ? (
          <div style={{
            padding: 14, background: 'rgba(231,76,60,0.12)',
            border: '1px solid rgba(231,76,60,0.35)', borderRadius: 8,
            color: '#f87171', fontSize: 13, textAlign: 'center',
          }}>{error}</div>
        ) : sortedVenues.length === 0 ? (
          <div style={{
            padding: 30, textAlign: 'center', color: '#8a8278', fontSize: 13,
            border: '1px dashed #2a2520', borderRadius: 8,
          }}>
            目前沒有負責店家 — 請聯絡 Wilson 指派
          </div>
        ) : (
          sortedVenues.map((v, idx) => {
            const d = dueByVenue[v.id]
            const status = venueStatus(d, auditedSet.has(v.id))
            const meta = STATUS_META[status]
            return (
              <VenueCard
                key={v.id}
                venue={v}
                due={d?.due_amount || 0}
                paid={d?.paid_amount || 0}
                status={status}
                meta={meta}
                idx={idx}
                total={sortedVenues.length}
                note={noteMap[v.id] || ''}
                onMoveUp={() => moveUp(v.id, idx)}
                onMoveDown={() => moveDown(v.id, idx)}
                onNoteChange={(val) => persistNote(v.id, val)}
                onClick={() => handleVisitVenue(v.id)}
              />
            )
          })
        )}
      </div>

      {/* 底部固定按鈕 */}
      {!loading && sortedVenues.length > 0 && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          background: '#0a0a0a', borderTop: '1px solid #2a2520', padding: 14,
        }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a8278', marginBottom: 8 }}>
              <span>今晚已收 NT$ {Math.round(stats.paid).toLocaleString()}</span>
              <span>應收 NT$ {Math.round(stats.due).toLocaleString()}</span>
            </div>
            <button
              onClick={handleTransfer}
              disabled={!allDone || transferring || transferred}
              style={{
                width: '100%', padding: 14, borderRadius: 10, border: 'none',
                background: transferred
                  ? '#10b98133'
                  : allDone
                    ? 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)'
                    : '#2a2520',
                color: transferred ? '#10b981' : allDone ? '#0a0a0a' : '#5a554e',
                fontSize: 15, fontWeight: 700, letterSpacing: 2,
                cursor: (allDone && !transferred) ? 'pointer' : 'not-allowed',
                boxShadow: allDone && !transferred ? '0 4px 16px rgba(201,168,76,0.25)' : 'none',
              }}
            >
              {transferred
                ? '✓ 已記錄轉帳'
                : transferring
                  ? '記錄中…'
                  : allDone
                    ? '我已陽信轉帳'
                    : `還剩 ${stats.total - stats.doneCount} 家未收齊`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ 狀態 pill ============
function StatusPill({ label, count, color }) {
  return (
    <div style={{
      flex: 1, padding: '10px 8px', background: '#1a1714',
      border: `1px solid ${color}33`, borderRadius: 8, textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color, letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 18, color, fontWeight: 700, marginTop: 2 }}>{count}</div>
    </div>
  )
}

// ============ 店家 card ============
function VenueCard({ venue, due, paid, status, meta, idx, total, note, onMoveUp, onMoveDown, onNoteChange, onClick }) {
  return (
    <div style={{
      background: '#15110f', border: '1px solid #2a2520', borderRadius: 10,
      padding: 14, marginBottom: 10, borderLeft: `3px solid ${meta.color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={onClick}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#e8e0d0' }}>{venue.name}</span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: meta.bg, color: meta.color, fontWeight: 500,
            }}>{meta.label}</span>
          </div>
          <div style={{ fontSize: 11, color: '#8a8278', marginTop: 4 }}>
            {regionLabel(venue.region)}{venue.address ? ` · ${venue.address}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={onMoveUp} disabled={idx === 0} style={iconBtn(idx === 0)}>↑</button>
          <button onClick={onMoveDown} disabled={idx === total - 1} style={iconBtn(idx === total - 1)}>↓</button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: '#8a8278' }}>應收</div>
          <div style={{ color: '#c9a84c', fontWeight: 600, marginTop: 2 }}>
            NT$ {Math.round(due).toLocaleString()}
          </div>
        </div>
        {paid > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#8a8278' }}>已收</div>
            <div style={{ color: '#10b981', fontWeight: 600, marginTop: 2 }}>
              NT$ {Math.round(paid).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <input
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="例：我約 22:00"
        style={{
          width: '100%', marginTop: 10, padding: '8px 10px',
          background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 6,
          color: '#e8dcc8', fontSize: 12, outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function iconBtn(disabled) {
  return {
    width: 28, height: 28, borderRadius: 6, border: '1px solid #2a2520',
    background: disabled ? '#1a1714' : '#15110f',
    color: disabled ? '#3a352e' : '#c9a84c',
    fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
    padding: 0,
  }
}

function regionLabel(r) {
  const map = { taipei: '台北', taoyuan: '桃園', hsinchu: '新竹', taichung: '台中', tainan: '台南', kaohsiung: '高雄' }
  return map[r] || r || ''
}
