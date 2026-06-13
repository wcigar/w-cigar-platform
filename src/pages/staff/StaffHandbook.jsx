import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, BookOpen, ChevronDown, ExternalLink, X } from 'lucide-react'

// 4 大分類（沿用 Legacy Elite 原系統）
const CATS = [
  { id: 'all',      name: '全部',         color: '#c9a84c' },
  { id: 'admin',    name: '管理規章',     color: '#c9a84c' },
  { id: 'benefit',  name: '激勵回饋',     color: '#c89b5a' },
  { id: 'training', name: '教育訓練',     color: '#7faa7f' },
  { id: 'download', name: '表單合約',     color: '#7fa0bd' },
]
const CAT_MAP = Object.fromEntries(CATS.map(c => [c.id, c]))

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
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('staff_handbook')
        .select('id, chapter_no, category, title, content, tags')
        .eq('enabled', true)
        .order('chapter_no', { ascending: true })
      setRows(data || [])
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return rows.filter(r => {
      const okCat = cat === 'all' || r.category === cat
      const okKw = !kw || r.title.toLowerCase().includes(kw) || r.content.toLowerCase().includes(kw)
      return okCat && okKw
    })
  }, [rows, q, cat])

  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '40px 0 24px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', marginBottom: 12 }}>
          <BookOpen size={22} color="#c9a84c" />
        </div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>員工手冊 · 規章中心</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: 'rgba(201,168,76,.45)', letterSpacing: 3, marginTop: 4 }}>STAFF HANDBOOK</div>
      </div>

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
            <button key={c.id} onClick={() => setCat(c.id)}
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
          return (
            <div key={r.id}
              onClick={() => setOpenId(open ? null : r.id)}
              style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: `1px solid ${open ? 'rgba(201,168,76,.28)' : 'rgba(201,168,76,.1)'}`, borderRadius: 13, padding: 16, marginBottom: 10, cursor: 'pointer', transition: 'border-color .3s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontSize: 9, padding: '3px 9px', borderRadius: 14, background: `${c.color}1a`, color: c.color, border: `1px solid ${c.color}33`, letterSpacing: 1 }}>{c.name}</span>
                <ChevronDown size={16} color={open ? '#c9a84c' : '#5a554e'} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .3s', flexShrink: 0 }} />
              </div>
              <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 15, color: '#f0e8d8', fontWeight: 500 }}>{r.title}</div>
              {!open && (
                <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 12, color: '#888078', lineHeight: 1.6, marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {r.content.replace(/https?:\/\/[^\s]+/g, '🔗').slice(0, 120)}
                </div>
              )}
              {open && (
                <div onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid rgba(201,168,76,.1)', marginTop: 11, paddingTop: 12, fontFamily: 'Noto Serif TC,serif', fontSize: 13, color: '#cdc4b2', lineHeight: 1.9, whiteSpace: 'pre-wrap', cursor: 'auto' }}>
                  {renderContent(r.content)}
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
