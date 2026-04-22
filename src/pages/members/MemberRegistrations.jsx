import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

export default function MemberRegistrations() {
  const [list,setList]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('pending')
  useEffect(()=>{load()},[filter])

  async function load(){
    setLoading(true)
    const {data}=await supabase.from('member_registrations').select('*')
      .eq('store_id',STORE_ID).eq('status',filter).order('created_at',{ascending:false}).limit(100)
    setList(data||[])
    setLoading(false)
  }

  async function approve(reg){
    const {data:existing}=await supabase.from('customers').select('id,name').eq('phone',reg.phone).maybeSingle()
    let cid=existing?.id
    if(!existing){
      const {data:nc,error}=await supabase.from('customers').insert({
        name:reg.name,phone:reg.phone,birthday:reg.birthday,gender:reg.gender,
        email:reg.email,preferred_cigar:reg.preferred_cigar,
        marketing_consent:reg.marketing_consent,source:reg.source,
        enabled:true,membership_tier:'éæå¡',home_store_id:reg.store_id,
      }).select('id').single()
      if(error){alert('å»ºç«å®¢æ¶å¤±æï¼'+error.message);return}
      cid=nc.id
    }
    await supabase.from('member_registrations').update({
      status:'approved',customer_id:cid,approved_at:new Date().toISOString()
    }).eq('id',reg.id)
    alert(`â å¯©æ ¸ééï¼${existing?'å·²æ´æ°ç¾æå®¢æ¶ï¼'+existing.name:'å·²å»ºç«æ°å®¢æ¶ï¼'+reg.name}`)
    load()
  }
  async function reject(id){
    await supabase.from('member_registrations').update({status:'rejected'}).eq('id',id)
    load()
  }

  const S={
    page:{padding:20,background:'#0f0d0a',minHeight:'100vh',color:'#e8e0d0',fontFamily:'sans-serif'},
    title:{color:'#c9a84c',fontSize:18,fontWeight:700,marginBottom:16},
    tabs:{display:'flex',gap:8,marginBottom:16},
    tab:(a)=>({padding:'7px 16px',borderRadius:8,border:'none',cursor:'pointer',fontSize:13,
               background:a?'#c9a84c':'#1a1714',color:a?'#1a1410':'#888',fontWeight:a?700:400}),
    card:{background:'#1a1714',border:'1px solid #2a2218',borderRadius:12,padding:16,marginBottom:10},
    btnOK:{padding:'7px 16px',borderRadius:8,border:'none',background:'#c9a84c',color:'#1a1410',fontWeight:700,cursor:'pointer',fontSize:13},
    btnNG:{padding:'7px 16px',borderRadius:8,border:'1px solid #444',background:'transparent',color:'#888',cursor:'pointer',fontSize:13},
  }
  const LABELS={pending:'å¾å¯©æ ¸',approved:'å·²éé',rejected:'å·²æçµ'}

  return(
    <div style={S.page}>
      <div style={S.title}>ð æå¡ç³è«å¯©æ ¸</div>
      <div style={S.tabs}>
        {['pending','approved','rejected'].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={S.tab(filter===s)}>{LABELS[s]}</button>
        ))}
      </div>
      {loading?<div style={{color:'#555',textAlign:'center',padding:40}}>è¼å¥ä¸­...</div>
      :list.length===0?<div style={{color:'#444',textAlign:'center',padding:40}}>æ²æ{LABELS[filter]}çç³è«</div>
      :list.map(reg=>(
        <div key={reg.id} style={S.card}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{color:'#e8e0d0',fontSize:15,fontWeight:600}}>{reg.name} {reg.gender&&<span style={{color:'#555',fontSize:12}}>({reg.gender})</span>}</span>
            <span style={{color:'#c9a84c',fontSize:14,fontFamily:'monospace'}}>{reg.phone}</span>
          </div>
          <div style={{color:'#666',fontSize:12,lineHeight:1.9}}>
            {reg.email&&<span>âï¸ {reg.email}ã</span>}
            {reg.birthday&&<span>ð {reg.birthday}ã</span>}
            {reg.preferred_cigar&&<span>ð¬ {reg.preferred_cigar}ã</span>}
            {reg.source&&<span>ð {reg.source}ã</span>}
            <span style={{color:reg.marketing_consent?'#5a9':'#e06060'}}>
              {reg.marketing_consent?'â åæè¡é·':'â ä¸åæè¡é·'}
            </span>
          </div>
          <div style={{color:'#333',fontSize:11,marginTop:4}}>
            {new Date(reg.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}
          </div>
          {filter==='pending'&&(
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <button onClick={()=>approve(reg)} style={S.btnOK}>â éé</button>
              <button onClick={()=>reject(reg.id)} style={S.btnNG}>â æçµ</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
