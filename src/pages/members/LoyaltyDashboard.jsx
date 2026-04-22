import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const REDEEM_OPTIONS=[
  {points:100, label:'NT$100 折抵券',   icon:'💴'},
  {points:500, label:'精品雪茄配件',    icon:'✂️'},
  {points:1000,label:'指定雪茄禮盒',    icon:'🎁'},
  {points:2000,label:'私人品鑑會席位',  icon:'🥃'},
]
const MILESTONES=[
  {count:1, gift:'推薦獎勵 +200點',       icon:'🎯'},
  {count:3, gift:'精品打火機',             icon:'🔥'},
  {count:5, gift:'指定雪茄禮盒',           icon:'🎁'},
  {count:10,gift:'尊榮會員升等（免年費）', icon:'👑'},
]
const TIER_COLOR={'非會員':'#555','紳士俱樂部':'#c9a84c','進階會員':'#a0c4ff','尊榮會員':'#ffd700'}
const EARN_RATE={'非會員':1,'紳士俱樂部':1.5,'進階會員':2,'尊榮會員':3}

export default function LoyaltyDashboard({customer,onClose}){
  const [tab,setTab]=useState('points')
  const [txList,setTxList]=useState([])
  const [refList,setRefList]=useState([])
  const [loading,setLoading]=useState(false)
  const [copying,setCopying]=useState(false)

  useEffect(()=>{if(tab==='points')loadTx();else if(tab==='referral')loadRef()},[tab])

  async function loadTx(){
    setLoading(true)
    const {data}=await supabase.from('points_transactions').select('*')
      .eq('customer_id',customer.id).order('created_at',{ascending:false}).limit(20)
    setTxList(data||[]); setLoading(false)
  }
  async function loadRef(){
    setLoading(true)
    const {data}=await supabase.from('referral_records').select('*')
      .eq('referrer_id',customer.id).order('created_at',{ascending:false})
    setRefList(data||[]); setLoading(false)
  }
  async function copyRefCode(){
    const url=`${window.location.origin}/join?ref=${customer.referral_code}`
    await navigator.clipboard.writeText(url)
    setCopying(true); setTimeout(()=>setCopying(false),2000)
  }

  const tier=customer.membership_tier||'非會員'
  const points=customer.total_points||0
  const refCount=customer.referral_count||0
  const nextM=MILESTONES.find(m=>m.count>refCount)

  const S={
    overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:9999},
    sheet:{width:'100%',maxWidth:480,background:'#1a1714',border:'1px solid rgba(201,168,76,.2)',
           borderRadius:'20px 20px 0 0',padding:'24px 20px 40px',maxHeight:'85vh',overflowY:'auto'},
    drag:{width:40,height:4,background:'#333',borderRadius:2,margin:'0 auto 20px'},
    tabs:{display:'flex',gap:8,marginBottom:20},
    tab:(a)=>({flex:1,padding:'9px 0',borderRadius:10,border:'none',cursor:'pointer',fontSize:13,
               background:a?'#c9a84c':'#111',color:a?'#1a1410':'#888',fontWeight:a?700:400}),
    card:{background:'#111',borderRadius:14,padding:16,marginBottom:12},
    btnGold:{width:'100%',padding:'12px',borderRadius:12,border:'none',background:'#c9a84c',
             color:'#1a1410',fontWeight:700,fontSize:14,cursor:'pointer'},
    btnGray:{padding:'8px 16px',borderRadius:10,border:'1px solid #333',
             background:'transparent',color:'#888',fontSize:13,cursor:'pointer'},
  }

  return(
    <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={S.sheet}>
        <div style={S.drag}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{color:'#e8e0d0',fontSize:17,fontWeight:700}}>{customer.name}</div>
            <div style={{color:TIER_COLOR[tier],fontSize:13,marginTop:3}}>{tier} · {customer.phone}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{color:'#c9a84c',fontSize:24,fontWeight:700}}>{points.toLocaleString()}</div>
            <div style={{color:'#555',fontSize:11}}>累積點數</div>
          </div>
        </div>

        <div style={S.tabs}>
          <button style={S.tab(tab==='points')}   onClick={()=>setTab('points')}>💰 點數</button>
          <button style={S.tab(tab==='referral')} onClick={()=>setTab('referral')}>🔗 推薦</button>
          <button style={S.tab(tab==='redeem')}   onClick={()=>setTab('redeem')}>🎁 兌換</button>
        </div>

        {tab==='points'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
              <div style={S.card}>
                <div style={{color:'#555',fontSize:11,marginBottom:4}}>累積倍率</div>
                <div style={{color:TIER_COLOR[tier],fontSize:20,fontWeight:700}}>×{EARN_RATE[tier]}</div>
                <div style={{color:'#444',fontSize:11}}>每NT$100={EARN_RATE[tier]}點</div>
              </div>
              <div style={S.card}>
                <div style={{color:'#555',fontSize:11,marginBottom:4}}>點數效期</div>
                <div style={{color:'#e8e0d0',fontSize:13,fontWeight:600}}>{customer.points_expire_at||'—'}</div>
                <div style={{color:'#444',fontSize:11}}>消費後重置12個月</div>
              </div>
            </div>
            {loading?<div style={{textAlign:'center',color:'#555',padding:20}}>載入中...</div>
            :txList.length===0?<div style={{textAlign:'center',color:'#444',padding:20}}>尚無點數紀錄</div>
            :txList.map(tx=>(
              <div key={tx.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                padding:'10px 0',borderBottom:'1px solid #111'}}>
                <div>
                  <div style={{color:'#e8e0d0',fontSize:13}}>{tx.description}</div>
                  <div style={{color:'#444',fontSize:11,marginTop:2}}>{new Date(tx.created_at).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'})}</div>
                </div>
                <div style={{color:tx.points>0?'#5a9':'#e06060',fontSize:15,fontWeight:700}}>
                  {tx.points>0?'+':''}{tx.points}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==='referral'&&(
          <div>
            <div style={S.card}>
              <div style={{color:'#555',fontSize:11,marginBottom:4}}>您的專屬推薦碼</div>
              <div style={{color:'#c9a84c',fontSize:28,fontWeight:700,letterSpacing:6,fontFamily:'monospace',marginBottom:10}}>
                {customer.referral_code||'—'}
              </div>
              <button onClick={copyRefCode} style={S.btnGold}>
                {copying?'✅ 已複製連結！':'🔗 複製推薦連結'}
              </button>
            </div>
            <div style={S.card}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
                <div style={{color:'#555',fontSize:11}}>推薦進度</div>
                <div style={{color:'#c9a84c',fontSize:16,fontWeight:700}}>{refCount} 位</div>
              </div>
              {MILESTONES.map(m=>(
                <div key={m.count} style={{display:'flex',gap:10,marginBottom:8,alignItems:'center',opacity:refCount>=m.count?1:0.4}}>
                  <span style={{fontSize:18}}>{refCount>=m.count?'✅':m.icon}</span>
                  <div style={{color:refCount>=m.count?'#5a9':'#888',fontSize:13}}>推薦{m.count}位 → {m.gift}</div>
                </div>
              ))}
              {nextM&&<div style={{marginTop:8,color:'#555',fontSize:12}}>距下一里程碑還差 {nextM.count-refCount} 位</div>}
            </div>
          </div>
        )}

        {tab==='redeem'&&(
          <div>
            <div style={{color:'#555',fontSize:12,marginBottom:16}}>
              目前點數：<span style={{color:'#c9a84c',fontSize:18,fontWeight:700}}>{points.toLocaleString()}</span> 點
            </div>
            {REDEEM_OPTIONS.map(opt=>(
              <div key={opt.points} style={{...S.card,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <span style={{fontSize:24}}>{opt.icon}</span>
                  <div>
                    <div style={{color:'#e8e0d0',fontSize:14}}>{opt.label}</div>
                    <div style={{color:'#c9a84c',fontSize:13,fontWeight:700}}>{opt.points.toLocaleString()} 點</div>
                  </div>
                </div>
                <button disabled={points<opt.points} style={{...S.btnGray,opacity:points>=opt.points?1:0.35,cursor:points>=opt.points?'pointer':'not-allowed'}}>兌換</button>
              </div>
            ))}
            <div style={{color:'#333',fontSize:11,textAlign:'center',marginTop:16}}>點數兌換需由員工協助確認</div>
          </div>
        )}
      </div>
    </div>
  )
}
