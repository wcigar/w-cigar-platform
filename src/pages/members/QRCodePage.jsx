import { useState, useEffect, useRef } from 'react'

const STORE_ID   = import.meta.env.VITE_STORE_ID   || 'DA_AN'
const STORE_NAME = import.meta.env.VITE_STORE_NAME || '大安總店'
const BASE_URL   = window.location.origin

export default function QRCodePage() {
  const [qrLoaded, setQrLoaded] = useState(false)
  const [tab, setTab] = useState('join') // join | referral
  const [refCode, setRefCode] = useState('')
  const joinUrl = `${BASE_URL}/join`
  const refUrl  = refCode ? `${BASE_URL}/join?ref=${refCode}` : ''

  // QR Code 用 api.qrserver.com 免賻生成
  const joinQR = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}&bgcolor=1a1714&color=c9a84c&format=png`
  const refQR  = refUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(refUrl)}&bgcolor=1a1714&color=c9a84c&format=png` : ''

  function print() { window.print() }

  const S = {
    page:  { padding:24, background:'#0f0d0a', minHeight:'100vh', color:'#e8e0d0', fontFamily:'sans-serif' },
    title: { color:'#c9a84c', fontSize:18, fontWeight:700, marginBottom:4 },
    sub:   { color:'#555', fontSize:13, marginBottom:20 },
    tabs:  { display:'flex', gap:8, marginBottom:24 },
    tab:   (a) => ({ padding:'9px 20px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13,
                     background:a?'#c9a84c':'#1a1714', color:a?'#1a1410':'#888', fontWeight:a?700:400 }),
    card:  { background:'#1a1714', border:'1px solid rgba(201,168,76,.2)', borderRadius:16,
             padding:24, maxWidth:360, textAlign:'center' },
    qr:    { width:200, height:200, borderRadius:12, margin:'0 auto 16px' },
    url:   { color:'#555', fontSize:11, wordBreak:'break-all', marginBottom:16 },
    btn:   { padding:'11px 24px', borderRadius:10, border:'none', background:'#c9a84c',
             color:'#1a1410', fontWeight:700, fontSize:14, cursor:'pointer' },
    input: { width:'100%', padding:'11px 14px', borderRadius:10, background:'#111',
             border:'1px solid #2a2218', color:'#e8e0d0', fontSize:14, outline:'none',
             boxSizing:'border-box', fontFamily:'monospace', letterSpacing:3, marginBottom:12 },
  }

  return (
    <div style={S.page}>
      <div style={S.title}>📱 QR Code 管理</div>
      <div style={S.sub}>掃描即可加入會員或填入推薦碼</div>

      <div style={S.tabs}>
        <button style={S.tab(tab==='join')}     onClick={()=>setTab('join')}>🔑 加入會員</button>
        <button style={S.tab(tab==='referral')} onClick={()=>setTab('referral')}>🔗 推薦專屬</button>
      </div>

      {tab === 'join' && (
        <div style={S.card}>
          <div style={{ color:'#c9a84c', fontSize:15, fontWeight:700, marginBottom:16 }}>
            W Cigar Bar 會員申請
          </div>
          <img src={joinQR} alt="加入會員 QR" style={S.qr}
            onError={e => e.target.style.display='none'}/>
          <div style={S.url}>{joinUrl}</div>
          <div style={{ color:'#666', fontSize:12, marginBottom:16, lineHeight:1.7 }}>
            客人掃描後填寫資料<br/>員工審核通過即成為會員
          </div>
          <button onClick={print} style={S.btn}>🖨️ 列印此 QR Code</button>
        </div>
      )}

      {tab === 'referral' && (
        <div style={S.card}>
          <div style={{ color:'#c9a84c', fontSize:15, fontWeight:700, marginBottom:12 }}>
            會員專屬推薦 QR
          </div>
          <div style={{ color:'#888', fontSize:12, marginBottom:12 }}>
            輸入會員推薦碼，產生專屬連結
          </div>
          <input
            value={refCode}
            onChange={e=>setRefCode(e.target.value.toUpperCase())}
            placeholder="輸入推薦碼（6碼）"
            maxLength={8}
            style={S.input}
          />
          {refQR && (
            <>
              <img src={refQR} alt="推薦 QR" style={S.qr}/>
              <div style={S.url}>{refUrl}</div>
              <button onClick={print} style={S.btn}>🖨️ 列印推薦 QR</button>
            </>
          )}
          {!refCode && (
            <div style={{ color:'#333', fontSize:13, padding:40 }}>
              輸入推薦碼後顯示 QR Code
            </div>
          )}
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          img { visibility: visible !important; display:block !important; }
        }
      `}</style>
    </div>
  )
}
