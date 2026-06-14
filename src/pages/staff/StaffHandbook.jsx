import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Search, BookOpen, ChevronDown, ExternalLink, X, CheckCircle2, ArrowRight, Clock, RotateCcw } from 'lucide-react'

// 章節 → 系統內原生流程（取代 Google 表單）
const NATIVE_ACTIONS = {
  'sop-chapter-09': [{ label: '線上辦理離職交接', route: '/resign' }],
  'sop-chapter-10': [{ label: '新人入職建檔', route: '/onboarding' }, { label: '離職交接單', route: '/resign' }],
  'sop-chapter-13': [{ label: '客戶存酒領取單（填寫列印）', route: '/liquor-pickup' }],
  'sop-chapter-15': [{ label: '職災事故通報單', route: '/injury-report' }],
}

// 4 大分類（沿用 Legacy Elite 原系統）
const CATS = [
  { id: 'all',      name: '全部',         color: '#c9a84c' },
  { id: 'admin',    name: '管理規章',     color: '#c9a84c' },
  { id: 'benefit',  name: '激勵回饋',     color: '#c89b5a' },
  { id: 'training', name: '教育訓練 ↗',   color: '#7faa7f' },
  { id: 'download', name: '表單合約',     color: '#7fa0bd' },
]
const CAT_MAP = Object.fromEntries(CATS.map(c => [c.id, c]))
const GOLD = '#c9a84c'

// 閱讀分層：避免新人被一長串「未確認」嚇到，依緊急度分三層
const TIERS = {
  1: { name: '入職前必讀', short: '必讀',   color: '#d68c46', hint: '正式上班前完成' },
  2: { name: '到職一週內', short: '一週內', color: '#c9a84c', hint: '報到後一週內讀完' },
  3: { name: '遇到情況再查', short: '查閱',  color: '#7fa0bd', hint: '需要時再翻閱即可' },
}
const READ_CPM = 200 // 中文每分鐘約略閱讀字數（保守估、不催促）
const readMin = (content) => Math.max(1, Math.round((content?.length || 0) / READ_CPM))
const fmtMin = (m) => m >= 60 ? `約 ${(m / 60).toFixed(1)} 小時` : `約 ${m} 分鐘`

// 把內文的 https 連結轉成可點按鈕
function renderContent(text) {
  const urlRe = /(https?:\/\/[^\s]+)/g
  return text.split(urlRe).map((part, i) => {
    if (part.match(urlRe)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '4px 0', padding: '8px 12px', borderRadius: 8, background: 'rgba(201,168,76,.08)', border: '1px solid rgba(201,168,76,.22)', color: '#c9a84c', fontSize: 12.5, textDecoration: 'none', wordBreak: 'break-all', maxWidth: '100%' }}>
          <ExternalLink size={13} style={{ flexShrink: 0 }} /> 開啟連結
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default function StaffHandbook() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [reads, setReads] = useState({})   // { chapter_id: ack_at }
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [tierFilter, setTierFilter] = useState(null) // null=全部，1/2/3=只看該層
  const [openId, setOpenId] = useState(null)
  const [acking, setAcking] = useState(null)

  useEffect(() => {
    (async () => {
      const [hbRes, rdRes] = await Promise.all([
        supabase.from('staff_handbook').select('id, chapter_no, category, title, content, tags, read_tier').eq('enabled', true).order('chapter_no', { ascending: true }),
        user?.employee_id
          ? supabase.from('staff_handbook_reads').select('chapter_id, ack_at').eq('employee_id', user.employee_id)
          : Promise.resolve({ data: [] }),
      ])
      setRows(hbRes.data || [])
      const map = {}
      ;(rdRes.data || []).forEach(r => { map[r.chapter_id] = r.ack_at })
      setReads(map)
      setLoading(false)
    })()
  }, [user?.employee_id])

  async function ack(chapterId, e) {
    e?.stopPropagation()
    if (!user?.employee_id || reads[chapterId]) return
    setAcking(chapterId)
    const ackAt = new Date().toISOString()
    const { error } = await supabase.from('staff_handbook_reads').upsert(
      { employee_id: user.employee_id, chapter_id: chapterId, ack_at: ackAt },
      { onConflict: 'employee_id,chapter_id', ignoreDuplicates: true }
    )
    if (!error) setReads(prev => ({ ...prev, [chapterId]: ackAt }))
    setAcking(null)
  }

  async function unack(chapterId, e) {
    e?.stopPropagation()
    if (!user?.employee_id || !reads[chapterId]) return
    if (!confirm('撤銷此章的閱讀確認？撤銷後此章會重新標為「未確認」。')) return
    setAcking(chapterId)
    const { data } = await supabase.rpc('handbook_unack', { p_employee_id: user.employee_id, p_chapter_id: chapterId })
    if (data?.ok) setReads(prev => { const n = { ...prev }; delete n[chapterId]; return n })
    setAcking(null)
  }

  // 各分層進度與預估時間
  const tierStats = useMemo(() => {
    const s = { 1: { done: 0, total: 0, leftMin: 0, totalMin: 0 }, 2: { done: 0, total: 0, leftMin: 0, totalMin: 0 }, 3: { done: 0, total: 0, leftMin: 0, totalMin: 0 } }
    rows.forEach(r => {
      const t = s[r.read_tier] ? r.read_tier : 2
      const m = readMin(r.content)
      s[t].total++; s[t].totalMin += m
      if (reads[r.id]) s[t].done++; else s[t].leftMin += m
    })
    return s
  }, [rows, reads])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return rows.filter(r => {
      const okCat = cat === 'all' || r.category === cat
      const okTier = !tierFilter || (r.read_tier || 2) === tierFilter
      const okKw = !kw || r.title.toLowerCase().includes(kw) || r.content.toLowerCase().includes(kw)
      return okCat && okTier && okKw
    })
  }, [rows, q, cat, tierFilter])

  const ackedCount = rows.filter(r => reads[r.id]).length
  const total = rows.length
  const allDone = total > 0 && ackedCount === total

  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '40px 0 20px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', marginBottom: 12 }}>
          <BookOpen size={22} color="#c9a84c" />
        </div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>員工手冊 · 規章中心</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: 'rgba(201,168,76,.45)', letterSpacing: 3, marginTop: 4 }}>STAFF HANDBOOK</div>
      </div>

      {/* 分層閱讀進度：先必讀、再一週內、最後查閱，降低新人壓力 */}
      {!loading && total > 0 && (
        <div style={{ marginBottom: 14, padding: 14, borderRadius: 13, background: allDone ? 'rgba(100,170,100,.06)' : 'rgba(22,18,14,.7)', border: `1px solid ${allDone ? 'rgba(100,170,100,.25)' : 'rgba(201,168,76,.18)'}` }}>
          {allDone ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Noto Serif TC,serif', fontSize: 14, color: '#7faa7f' }}>
              <CheckCircle2 size={17} /> 已完成全部 {total} 章規章確認，感謝！
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <span style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 13.5, color: '#f0e8d8' }}>閱讀進度</span>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#888078' }}>共 {total} 章 · {fmtMin(tierStats[1].totalMin + tierStats[2].totalMin + tierStats[3].totalMin)}</span>
              </div>
              {[1, 2, 3].map(t => {
                const st = tierStats[t]; if (!st.total) return null
                const T = TIERS[t]; const done = st.done === st.total
                const p = Math.round(st.done / st.total * 100)
                const on = tierFilter === t
                return (
                  <div key={t} onClick={() => setTierFilter(on ? null : t)}
                    style={{ cursor: 'pointer', padding: '8px 9px', margin: '0 -3px 6px', borderRadius: 9, background: on ? `${T.color}14` : 'transparent', border: `1px solid ${on ? `${T.color}55` : 'transparent'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 12, background: `${T.color}1f`, color: T.color, border: `1px solid ${T.color}44`, flexShrink: 0, letterSpacing: 1 }}>{T.short}</span>
                      <span style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 12.5, color: done ? '#7faa7f' : '#e0d8c8' }}>{T.name}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: done ? '#7faa7f' : T.color }}>
                        {done ? '✓ 完成' : t === 3 ? `${st.done}/${st.total} · 參考用` : `${st.done}/${st.total} · 剩${fmtMin(st.leftMin)}`}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p}%`, borderRadius: 2, background: done ? '#7faa7f' : T.color, transition: 'width .5s' }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 11, color: 'rgba(201,168,76,.7)', marginTop: 6, lineHeight: 1.7 }}>
                💡 別緊張：先把「{TIERS[1].name}」{tierStats[1].total} 章讀完就能安心上工（約 {tierStats[1].totalMin} 分鐘），其餘到職後再陸續完成。點上方任一層可只看該層。
              </div>
            </>
          )}
        </div>
      )}

      {/* 搜尋 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(201,168,76,.05)', border: '1px solid rgba(201,168,76,.18)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
        <Search size={16} color="#888078" style={{ flexShrink: 0 }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="搜尋條文… 加班、特休、打卡、獎金"
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#e8dcc8', fontSize: 14, fontFamily: 'Noto Serif TC,serif' }}
        />
        {q && <X size={15} color="#888078" style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => setQ('')} />}
      </div>

      {/* 分類 chips */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18 }}>
        {CATS.map(c => {
          const active = cat === c.id
          return (
            <button key={c.id} onClick={() => c.id === 'training' ? navigate('/training') : setCat(c.id)}
              style={{ fontSize: 11.5, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all .2s',
                background: active ? c.color : 'rgba(201,168,76,.06)',
                color: active ? '#0f0d0a' : c.color,
                border: `1px solid ${active ? c.color : 'rgba(201,168,76,.18)'}` }}>
              {c.name}
            </button>
          )
        })}
      </div>

      {/* 清單 */}
      {loading ? (
        <div><div className="loading-shimmer" style={{ height: 78, marginBottom: 10, borderRadius: 13 }} /><div className="loading-shimmer" style={{ height: 78, borderRadius: 13 }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#5a554e', fontFamily: 'Noto Serif TC,serif', fontSize: 13 }}>找不到符合「{q}」的條文</div>
      ) : (
        filtered.map(r => {
          const c = CAT_MAP[r.category] || CATS[0]
          const open = openId === r.id
          const acked = !!reads[r.id]
          return (
            <div key={r.id}
              onClick={() => setOpenId(open ? null : r.id)}
              style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', borderRadius: 13, padding: 16, marginBottom: 10, cursor: 'pointer', transition: 'border-color .3s',
                border: `1px solid ${open ? 'rgba(201,168,76,.28)' : acked ? 'rgba(201,168,76,.1)' : 'rgba(214,140,70,.32)'}`,
                boxShadow: acked ? 'none' : 'inset 3px 0 0 rgba(214,140,70,.55)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, gap: 6 }}>
                {(() => { const T = TIERS[r.read_tier] || TIERS[2]; return (
                  <span style={{ fontSize: 9, padding: '3px 9px', borderRadius: 14, background: `${T.color}1f`, color: T.color, border: `1px solid ${T.color}44`, letterSpacing: 1, flexShrink: 0 }}>{T.short}</span>
                ) })()}
                <span style={{ fontSize: 9, padding: '3px 9px', borderRadius: 14, background: `${c.color}1a`, color: c.color, border: `1px solid ${c.color}33`, letterSpacing: 1, flexShrink: 0 }}>{c.name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: '#6a655c', flexShrink: 0 }}><Clock size={10} />{readMin(r.content)} 分</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                  {acked
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#7faa7f' }}><CheckCircle2 size={13} /> 已確認</span>
                    : <span style={{ fontSize: 10, color: '#d68c46' }}>● 未確認</span>}
                  <ChevronDown size={16} color={open ? '#c9a84c' : '#5a554e'} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .3s', flexShrink: 0 }} />
                </div>
              </div>
              <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 15, color: '#f0e8d8', fontWeight: 500 }}>{r.title}</div>
              {!open && (
                <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 12, color: '#888078', lineHeight: 1.6, marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {r.content.replace(/https?:\/\/[^\s]+/g, '🔗').slice(0, 120)}
                </div>
              )}
              {open && (
                <div onClick={e => e.stopPropagation()}>
                  {NATIVE_ACTIONS[r.id] && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(201,168,76,.1)', marginTop: 11, paddingTop: 12 }}>
                      <div style={{ fontSize: 11, color: '#7faa7f' }}>✅ 已可在系統內直接辦理（免 Google 表單）：</div>
                      {NATIVE_ACTIONS[r.id].map(a => (
                        <button key={a.route} onClick={() => navigate(a.route)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 9, border: `1px solid ${GOLD}`, background: 'rgba(201,168,76,.1)', color: GOLD, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif' }}>
                          {a.label}<ArrowRight size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(201,168,76,.1)', marginTop: 11, paddingTop: 12, fontFamily: 'Noto Serif TC,serif', fontSize: 13, color: '#cdc4b2', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                    {renderContent(r.content)}
                  </div>
                  {/* 閱讀確認 */}
                  <div style={{ marginTop: 14 }}>
                    {acked ? (
                      <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(100,170,100,.06)', border: '1px solid rgba(100,170,100,.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#7faa7f', fontSize: 12.5, fontFamily: 'Noto Serif TC,serif' }}>
                            <CheckCircle2 size={14} /> 已於 {new Date(reads[r.id]).toLocaleDateString('zh-TW')} 確認閱讀
                          </span>
                          <button onClick={e => unack(r.id, e)} disabled={acking === r.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#8a8278', fontSize: 11.5, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif', flexShrink: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                            <RotateCcw size={11} />撤銷
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button onClick={e => ack(r.id, e)} disabled={acking === r.id}
                          style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', cursor: acking === r.id ? 'default' : 'pointer', fontFamily: 'Noto Serif TC,serif', fontSize: 14, fontWeight: 600, letterSpacing: 1, color: '#0f0d0a', background: 'linear-gradient(135deg,#c9a84c,#a8863a)', opacity: acking === r.id ? 0.6 : 1 }}>
                          {acking === r.id ? '確認中…' : '✓ 我已閱讀並確認'}
                        </button>
                        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 10.5, color: '#6a655c', lineHeight: 1.7, marginTop: 7, textAlign: 'center' }}>
                          點擊即記錄你的閱讀確認、人事主管後台可查核；如需更正可隨時點「撤銷」。
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}

      <div style={{ textAlign: 'center', padding: '14px 0 0', fontFamily: 'Cormorant Garamond,serif', fontSize: 10, fontStyle: 'italic', color: 'rgba(201,168,76,.18)', letterSpacing: 4 }}>W CIGAR BAR · 卓越是唯一標準</div>
    </div>
  )
}
