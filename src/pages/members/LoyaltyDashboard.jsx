import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const REDEEM_OPTIONS=[
  {points:100, label:'NT$100 ææµå¸',   icon:'ð´'},
  {points:500, label:'ç²¾åéªèéä»¶',    icon:'âï¸'},
  {points:1000,label:'æå®éªèç¦®ç',    icon:'ð'},
  {points:2000,label:'ç§äººåéæå¸­ä½',  icon:'ð¥'},
]
const MILESTONES=[
  {count:1, gift:'æ¨è¦çåµ +200é»',       icon:'ð¯'},
  {count:3, gift:'ç²¾åæç«æ©',             icon:'ð¥'},
  {count:5, gift:'æå®éªèç¦®ç',           icon:'ð'},
  {count:10,gift:'å°æ¦®æå¡åç­ï¼åå¹´è²»ï¼', icon:'ð'},
]
const TIER_COLOR={'éæå¡':'#555','ç´¬å£«ä¿±æ¨é¨':'#c9a84c','é²éæå¡':'#a0c4ff','å°æ¦®æå¡':'#ffd700'}
const EARN_RATE={'éæå¡':1,'ç´³å£«ä¿±æ¨é¨':1.5,'é²éæå¡':2,'å°æ¦®æå¡':3}

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

  const tier=customer.membership_tier||'éæå¡'
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
            <div style={{color:TIER_COLOR[tier],fontSize:13,marginTop:3}}>{tier} Â· {customer.phone}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{color:'#c9a84c',fontSize:24,fontWeight:700}}>{points.toLocaleString()}</div>
            <div style={{color:'#555',fontSize:11}}>ç´¯ç©é»æ¸</div>
          </div>
        </div>

        <div style={S.tabs}>
          <button style={S.tab(tab==='points')}   onClick={()=>setTab('points')}>ð° é»æ¸</button>
          <button style={S.tab(tab==='referral')} onClick={()=>setTab('referral')}>ð æ¨è¦</button>
          <button style={S.tab(tab==='redeem')}   onClick={()=>setTab('redeem')}>ð åæ</button>
        </div>

        {tab==='points'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
              <div style={S.card}>
                <div style={{color:'#555',fontSize:11,marginBottom:4}}>ç´¯ç©åç</div>
                <div style={{color:TIER_COLOR[tier],fontSize:20,fontWeight:700}}>Ã{EARN_RATE[tier]}</div>
                <div style={{color:'#444',fontSize:11}}>æ¯NT$100={EARN_RATE[tier]}é»</div>
              </div>
              <div style={S.card}>
                <div style={{color:'#555',fontSize:11,marginBottom:4}}>é»æ¸ææ</div>
                <div style={{color:'#e8e0d0',fontSize:13,fontWeight:600}}>{customer.points_expire_at||'â'}</div>
                <div style={{color:'#444',fontSize:11}}>æ¶è²»å¾éç½®12åæ</div>
              </div>
            </div>
            {loading?<div style={{textAlign:'center',color:'#555',padding:20}}>è¼å¥ä¸­...</div>
            :txList.length===0?<div style={{textAlign:'center',color:'#444',padding:20}}>å°ç¡é»æ¸ç´é</div>
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
              <div style={{color:'#555',fontSize:11,marginBottom:4}}>æ¨çå°å±¬æ¨è§ç¢¼</div>
              <div style={{color:'#c9a84c',fontSize:28,fontWeight:700,letterSpacing:6,fontFamily:'monospace',marginBottom:10}}>
                {customer.referral_code||'â'}
              </div>
              <button onClick={copyRefCode} style={S.btnGold}>
                {copying?'â å·²è¤è£½é£çµï¼':'ð è¤è£½æ¨è¦é£çµ'}
              </button>
            </div>
            <div style={S.card}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
                <div style={{color:'#555',fontSize:11}}>æ¨è¦é²åº¦</div>
                <div style={{color:'#c9a84c',fontSize:16,fontWeight:700}}>{refCount} ä½</div>
              </div>
              {MILESTONES.map(m=>(
                <div key={m.count} style={{display:'flex',gap:10,marginBottom:8,alignItems:'center',opacity:refCount>=m.count?1:0.4}}>
                  <span style={{fontSize:18}}>{refCount>=m.count?'â':m.icon}</span>
                  <div style={{color:refCount>=m.count?'#5a9':'#888',fontSize:13}}>æ¨è¦{m.count}ä½ â {m.gift}</div>
                </div>
              ))}
              {nextM&&<div style={{marginTop:8,color:'#555',fontSize:12}}>è·ä¸ä¸éç¨ç¢éå·® {nextM.count-refCount} ä½</div>}
            </div>
          </div>
        )}

        {tab==='redeem'&&(
          <div>
            <div style={{color:'#555',fontSize:12,marginBottom:16}}>
              ç®åé»æ¸ï¼<span style={{color:'#c9a84c',fontSize:18,fontWeight:700}}>{points.toLocaleString()}</span> é»
            </div>
            {REDEEM_OPTIONS.map(opt=>(
              <div key={opt.points} style={{...S.card,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <span style={{fontSize:24}}>{opt.icon}</span>
                  <div>
                    <div style={{color:'#e8e0d0',fontSize:14}}>{opt.label}</div>
                    <div style={{color:'#c9a84c',fontSize:13,fontWeight:700}}>{opt.points.toLocaleString()} é»</div>
                  </div>
                </div>
                <button disabled={points<opt.points} style={{...S.btnGray,opacity:points>=opt.points?1:0.35,cursor:points>=opt.points?'pointer':'not-allowed'}}>åæ</button>
              </div>
            ))}
            <div style={{color:'#333',fontSize:11,textAlign:'center',marginTop:16}}>é»æ¸åæéç±å¡å·¥åå©ç¢ºèª</div>
          </div>
        )}
      </div>
    </div>
  )
}
