// 會員福利說明頁面
export default function MemberBenefits({ tier, onClose }) {
  const BENEFITS = {
    '非會員': {
      color: '#666',
      icon: '👤',
      items: [
        { icon:'💰', text:'消費積點（每NT$100 = 1點）' },
        { icon:'🎂', text:'生日當月全面 9 折' },
        { icon:'🥂', text:'生日當天軟飲、餐飲免費' },
        { icon:'🔗', text:'推薦好友可獲獎勵' },
      ]
    },
    '紳士俱樂部': {
      color: '#c9a84c',
      icon: '🥃',
      condition: '單筆消費 ≥ NT$10,000',
      items: [
        { icon:'💰', text:'消費積點 1.5倍（每NT$100 = 1.5點）' },
        { icon:'🎂', text:'生日當月全面 9 折' },
        { icon:'🥂', text:'生日當天軟飲、餐飲免費' },
        { icon:'🎁', text:'生日贈 200 點' },
        { icon:'🔗', text:'推薦好友獲 300 點' },
      ]
    },
    '進階會員': {
      color: '#a0c4ff',
      icon: '⭐',
      condition: '累計消費 ≥ NT$30,000',
      items: [
        { icon:'💎', text:'全年消費 95 折' },
        { icon:'💰', text:'消費積點 2倍（每NT$100 = 2點）' },
        { icon:'🎂', text:'生日當月全面 9 折' },
        { icon:'🥂', text:'生日當天軟飲、餐飲免費' },
        { icon:'🎁', text:'生日贈 300 點' },
        { icon:'🔐', text:'優先窖藏服務' },
        { icon:'🔗', text:'推薦好友獲 400 點' },
      ]
    },
    '尊榮會員': {
      color: '#ffd700',
      icon: '👑',
      condition: '年消費 ≥ NT$168,000',
      items: [
        { icon:'💎', text:'全年消費 9 折' },
        { icon:'💰', text:'消費積點 3倍（每NT$100 = 3點）' },
        { icon:'🎂', text:'生日當月全面 85 折' },
        { icon:'🥂', text:'生日當天軟飲、餐飲免費' },
        { icon:'🎁', text:'生日贈 500 點' },
        { icon:'🔐', text:'專屬窖藏服務' },
        { icon:'🥂', text:'尊榮品鑑活動優先邀請' },
        { icon:'👔', text:'專屬服務人員' },
        { icon:'🔗', text:'推薦好友獲 500 點' },
      ]
    }
  }

  const ALL_TIERS = ['非會員','紳士俱樂部','進階會員','尊榮會員']
  const [selected, setSelected] = React.useState(tier || '紳士俱樂部')
  const info = BENEFITS[selected]

  const S = {
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.88)',
               display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 },
    card:    { background:'#1a1714', border:'1px solid rgba(201,168,76,.3)',
               borderRadius:20, padding:28, width:360, maxWidth:'94vw', maxHeight:'85vh', overflowY:'auto' },
    title:   { color:'#c9a84c', fontSize:17, fontWeight:700, marginBottom:16 },
    tabs:    { display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' },
    tab:     (a,c) => ({ padding:'7px 12px', borderRadius:8, border:'none', cursor:'pointer',
                          fontSize:12, background:a?c+'33':'#111', color:a?c:'#555',
                          fontWeight:a?700:400, borderColor:a?c:'transparent', borderWidth:1,
                          borderStyle:'solid' }),
    item:    { display:'flex', gap:10, marginBottom:10, alignItems:'flex-start' },
    icon:    { fontSize:16, minWidth:24 },
    text:    { color:'#e8e0d0', fontSize:13, lineHeight:1.6 },
    badge:   { display:'inline-block', padding:'4px 12px', borderRadius:20, fontSize:11,
               marginBottom:16 },
    btn:     { width:'100%', padding:'12px', borderRadius:12, border:'none', background:'#2a2520',
               color:'#888', fontSize:14, cursor:'pointer', marginTop:16 },
  }

  return (
    <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose?.()}>
      <div style={S.card}>
        <div style={S.title}>✨ 會員福利說明</div>

        <div style={S.tabs}>
          {ALL_TIERS.map(t => (
            <button key={t} onClick={()=>setSelected(t)}
              style={S.tab(selected===t, BENEFITS[t].color)}>
              {BENEFITS[t].icon} {t}
            </button>
          ))}
        </div>

        <div style={{ textAlign:'center', marginBottom:16 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>{info.icon}</div>
          <div style={{ color:info.color, fontSize:18, fontWeight:700 }}>{selected}</div>
          {info.condition && (
            <div style={{ ...S.badge, background:info.color+'22', color:info.color, marginTop:6 }}>
              {info.condition}
            </div>
          )}
        </div>

        <div style={{ background:'#111', borderRadius:12, padding:'16px 14px' }}>
          {info.items.map((item,i) => (
            <div key={i} style={S.item}>
              <span style={S.icon}>{item.icon}</span>
              <span style={S.text}>{item.text}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop:16, padding:'12px 14px', background:'rgba(201,168,76,.05)',
          borderRadius:10, border:'1px solid rgba(201,168,76,.1)' }}>
          <div style={{ color:'#6b5a3a', fontSize:11, marginBottom:8 }}>點數兌換說明</div>
          {[
            ['100點','NT$100 折抵券'],
            ['500點','精品雪茄配件'],
            ['1,000點','指定雪茄禮盒'],
            ['2,000點','私人品鑑會席位'],
          ].map(([p,d])=>(
            <div key={p} style={{ display:'flex', justifyContent:'space-between',
              fontSize:12, marginBottom:5, color:'#888' }}>
              <span style={{ color:'#c9a84c' }}>{p}</span>
              <span>{d}</span>
            </div>
          ))}
        </div>

        {onClose && <button onClick={onClose} style={S.btn}>關閉</button>}
      </div>
    </div>
  )
}

import React from 'react'
