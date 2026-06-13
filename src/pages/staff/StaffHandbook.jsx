import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Search, BookOpen, ChevronDown, ExternalLink, X, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'

// 章節 → 系統內原生流程（取代 Google 表單）
const NATIVE_ACTIONS = {
  'sop-chapter-09': [{ label: '線上辦理離職交接', route: '/resign' }],
  'sop-chapter-10': [{ label: '新人入職建檔', route: '/onboarding' }, { label: '離職交接單', route: '/resign' }],
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
  const [openId, setOpenId] = useState(null)
  const [acking, setAcking] = useState(null)

  useEffect(() => {
    (async () => {
      const [hbRes, rdRes] = await Promise.all([
        supabase.from('staff_handbook').select('id, chapter_no, category, title, content, tags').eq('enabled', true).order('chapter_no', { ascending: true }),
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

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return rows.filter(r => {
      const okCat = cat === 'all' || r.category === cat
      const okKw = !kw || r.title.toLowerCase().includes(kw) || r.content.toLowerCase().includes(kw)
      return okCat && okKw
    })
  }, [rows, q, cat])

  const ackedCount = rows.filter(r => reads[r.id]).length
  const total = rows.length
  const allDone = total > 0 && ackedCount === total
  const pct = total ? Math.round(ackedCount / total * 100) : 0

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

      {/* 閱讀進度 + 警示 */}
      {!loading && total > 0 && (
        <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, background: allDone ? 'rgba(100,170,100,.06)' : 'rgba(201,120,60,.07)', border: `1px solid ${allDone ? 'rgba(100,170,100,.25)' : 'rgba(214,140,70,.3)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Noto Serif TC,serif', fontSize: 13, color: allDone ? '#7faa7f' : '#d68c46' }}>
              {allDone ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {allDone ? '已完成全部規章確認' : `還有 ${total - ackedCount} 章未確認閱讀`}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: allDone ? '#7faa7f' : '#d68c46' }}>{ackedCount}/{total}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: allDone ? '#7faa7f' : '#d68c46', transition: 'width .6s' }} />
          </div>
          {!allDone && <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 11, color: 'rgba(214,140,70,.75)', marginTop: 7 }}>正式上班前請逐章閱讀並點「我已閱讀並確認」</div>}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, gap: 8 }}>
                <span style={{ fontSize: 9, padding: '3px 9px', borderRadius: 14, background: `${c.color}1a`, color: c.color, border: `1px solid ${c.color}33`, letterSpacing: 1, flexShrink: 0 }}>{c.name}</span>
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 9, background: 'rgba(100,170,100,.06)', border: '1px solid rgba(100,170,100,.2)', color: '#7faa7f', fontSize: 12.5, fontFamily: 'Noto Serif TC,serif' }}>
                        <CheckCircle2 size={14} /> 已於 {new Date(reads[r.id]).toLocaleDateString('zh-TW')} 確認閱讀
                      </div>
                    ) : (
                      <button onClick={e => ack(r.id, e)} disabled={acking === r.id}
                        style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', cursor: acking === r.id ? 'default' : 'pointer', fontFamily: 'Noto Serif TC,serif', fontSize: 14, fontWeight: 600, letterSpacing: 1, color: '#0f0d0a', background: 'linear-gradient(135deg,#c9a84c,#a8863a)', opacity: acking === r.id ? 0.6 : 1 }}>
                        {acking === r.id ? '確認中…' : '✓ 我已閱讀並確認'}
                      </button>
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
