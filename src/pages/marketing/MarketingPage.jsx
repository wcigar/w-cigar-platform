import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

const TEMPLATES = {
  birthday:'è¦ªæç {{name}}ï¼æ¬ææ¯æ¨ççæ¥ï¼W Cigar Bar æ¬ç»çæ¥å°å±¬ç¦¬éï¼ææ­¤è¨æ¯è³éå¸äº« 9 æåªæ  ðð¥',
  newItem:'è¦ªæç {{name}}ï¼W Cigar Bar æ°åå°è²¨éç¥ï¼ééçèï¼æ­¡è¿èè¨åé ð¬',
  event:'è¦ªæç {{name}}ï¼W Cigar Bar èª é¯é¨è«æ¨åå åéæ´»åï¼è©³æè«æ´½é å¸ ð',
  vip:'è¦ªæç {{name}}ï¼æè¬æ¨é·æçæ¯æãå°æ¦®æå¡å°å±¬åªæ å³æ¥èµ·çæï¼æå¾æ¨çèè¨ ð',
}

export default function MarketingPage() {
  const [tab,setTab]=useState('compose')
  const [form,setForm]=useState({title:'',type:'sms',subject:'',content:'',target_tier:'all'})
  const [count,setCount]=useState(0)
  const [preview,setPreview]=useState([])
  const [history,setHistory]=useState([])
  const [loading,setLoading]=useState(false)
  const [sending,setSending]=useState(false)
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))

  useEffect(()=>{if(tab==='history')loadHistory()},[tab])
  useEffect(()=>{loadPreview()},[form.target_tier])

  async function loadPreview(){
    let q=supabase.from('customers').select('id,name,phone,email',{count:'exact'})
      .eq('home_store_id',STORE_ID).eq('enabled',true).eq('marketing_consent',true)
    if(form.target_tier!=='all') q=q.eq('membership_tier',form.target_tier)
    const {data,count:c}=await q.limit(5)
    setPreview(data||[]); setCount(c||0)
  }

  async function loadHistory(){
    setLoading(true)
    const {data}=await supabase.from('marketing_messages').select('*')
      .eq('store_id',STORE_ID).order('created_at',{ascending:false}).limit(30)
    setHistory(data||[]); setLoading(false)
  }

  async function send(){
    if(!form.title){alert('è«å¡«å¯«æ´»ååç¨±');return}
    if(!form.content){alert('è«å¡«å¯«è¨æ¯å§å®¹');return}
    if(!count){alert('æ²æç¬¦åæ¢ä»¶çå®¢æ¶');return}
    if(!confirm(`ç¢ºå®ç¼éçµ¦ ${count} ä½å®¢æ¶ï¼`)) return
    setSending(true)
    const {error}=await supabase.from('marketing_messages').insert({
      store_id:STORE_ID,title:form.title,type:form.type,subject:form.subject,
      content:form.content,target_tier:form.target_tier,
      status:'sent',total_count:count,sent_count:count,created_by:'ADMIN',
      sent_at:new Date().toISOString(),
    })
    setSending(false)
    if(error){alert('å»ºç«å¤±æï¼'+error.message);return}
    alert(`â è¡é·æ´»åå·²å»ºç«ï¼å± ${count} ä½æ¶ä»¶äºº\n\næ³¨æï¼å¯¦éç°¡è¨/Email ç¼ééè¨­å® Every8d / Resend API éé°`)
    setForm({title:'',type:'sms',subject:'',content:'',target_tier:'all'})
    setTab('history')
  }

  const S={
    page:{padding:20,background:'#0f0d0a',minHeight:'100vh',color:'#e8e0d0',fontFamily:'sans-serif'},
    title:{color:'#c9a84c',fontSize:18,fontWeight:700,marginBottom:4},
    sub:{color:'#555',fontSize:12,marginBottom:20},
    tabs:{display:'flex',gap:8,marginBottom:20},
    tab:(a)=>({padding:'9px 18px',borderRadius:8,border:'none',cursor:'pointer',fontSize:13,
               background:a?'#c9a84c':'#1a1714',color:a?'#1a1410':'#888',fontWeight:a?700:400}),
    label:{color:'#aaa',fontSize:12,marginBottom:6,marginTop:14,display:'block'},
    input:{width:'100%',padding:'11px 14px',borderRadius:10,background:'#111',
           border:'1px solid #2a2218',color:'#e8e0d0',fontSize:14,outline:'none',boxSizing:'border-box'},
    textarea:{width:'100%',padding:'11px 14px',borderRadius:10,background:'#111',
              border:'1px solid #2a2218',color:'#e8e0d0',fontSize:14,outline:'none',
              boxSizing:'border-box',minHeight:120,resize:'vertical'},
    card:{background:'#1a1714',border:'1px solid #2a2218',borderRadius:12,padding:14,marginBottom:8},
    btn:{padding:'13px 0',borderRadius:12,border:'none',background:'#c9a84c',
         color:'#1a1410',fontWeight:700,fontSize:15,cursor:'pointer',width:'100%',marginTop:16},
  }

  return(
    <div style={S.page}>
      <div style={S.title}>ð£ è¡é·ç¼éä¸­å¿</div>
      <div style={S.sub}>ç°¡è¨ + Email è¡é·ç®¡ç</div>
      <div style={S.tabs}>
        <button style={S.tab(tab==='compose')} onClick={()=>setTab('compose')}>âï¸ æ°å¯«ç¼é</button>
        <button style={S.tab(tab==='history')} onClick={()=>setTab('history')}>ð ç¼éç´é</button>
      </div>

      {tab==='compose'&&(
        <div>
          <label style={S.label}>æ´»ååç¨±</label>
          <input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="å¦ï¼4ææ°åå°è²¨éç¥" style={S.input}/>

          <label style={S.label}>ç¼éç®¡é</label>
          <div style={{display:'flex',gap:8}}>
            {['sms','email','both'].map(t=>(
              <button key={t} onClick={()=>set('type',t)} style={{flex:1,padding:'10px 0',borderRadius:10,border:'none',
                cursor:'pointer',background:form.type===t?'#c9a84c':'#1a1714',
                color:form.type===t?'#1a1410':'#888',fontWeight:form.type===t?700:400,fontSize:13}}>
                {{sms:'ð± ç°¡è¨',email:'ð§ Email',both:'ð±+ð§ å¨è'}[t]}
              </button>
            ))}
          </div>

          {(form.type==='email'||form.type==='both')&&(
            <><label style={S.label}>Email ä¸»æ¨</label>
            <input value={form.subject} onChange={e=>set('subject',e.target.value)} placeholder="W Cigar Bar æå¡å°å±¬éç¥" style={S.input}/></>
          )}

          <label style={S.label}>ç®æ¨å®¢ç¾¤</label>
          <select value={form.target_tier} onChange={e=>set('target_tier',e.target.value)} style={S.input}>
            {['all','éæå¡','ç´³å£«ä¿±æ¨é¨','é²éæå¡','å°æ¦®æå¡'].map(v=>(
              <option key={v} value={v}>{v==='all'?'å¨é¨æå¡':v}</option>
            ))}
          </select>

          <div style={{background:'#111',borderRadius:10,padding:'10px 14px',marginTop:8}}>
            <span style={{color:'#c9a84c',fontSize:15,fontWeight:700}}>{count}</span>
            <span style={{color:'#555',fontSize:12}}>ãä½ç¬¦åæ¢ä»¶ï¼å·²åæè¡é·ï¼</span>
            {preview.length>0&&<div style={{marginTop:4,fontSize:11,color:'#444'}}>é è¦½ï¼{preview.map(c=>c.name).join('ã')}{count>5?`â¦ç­${count}äºº`:''}</div>}
          </div>

          <label style={S.label}>å¿«éç¯æ¬</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {Object.entries(TEMPLATES).map(([k,v])=>(
              <button key={k} onClick={()=>set('content',v)} style={{padding:'5px 12px',borderRadius:8,
                fontSize:11,cursor:'pointer',border:'1px solid #2a2218',background:'#111',color:'#888'}}>
                {{birthday:'ðçæ¥ç¥ç¦',newItem:'ð¬æ°åå°è²¨',event:'ðªæ´»åéè«',vip:'ðVIPå°å±¬'}[k]}
              </button>
            ))}
          </div>

          <label style={S.label}>è¨æ¯å§å®¹ <span style={{color:'#555',fontSize:11}}>å¯ç¨ {'{{name}}'} ä»£å¥å§å</span></label>
          <textarea value={form.content} onChange={e=>set('content',e.target.value)} placeholder="è¦ªæç {{name}}ï¼..." style={S.textarea}/>
          <div style={{color:'#444',fontSize:11,marginTop:4}}>å­æ¼ï¼{form.content.length} å­
            {form.type!=='email'&&form.content.length>70&&<span style={{color:'#ffd700',marginLeft:8}}>â ï¸ è¶é70å­å°è¨2åç°¡è¨è²»ç¨</span>}
          </div>

          <button onClick={send} disabled={sending||!count} style={{...S.btn,opacity:(sending||!count)?0.5:1}}>
            {sending?'èçä¸­...':`ð¤ ç¼éçµ¦ ${count} ä½å®¢æ¶`}
          </button>
        </div>
      )}

      {tab==='history'&&(
        <div>
          {loading?<div style={{textAlign:'center',color:'#555',padding:40}}>è¼å¥ä¸­...</div>
          :history.length===0?<div style={{textAlign:'center',color:'#444',padding:40}}>å°ç¡ç¼éç´é</div>
          :history.map(msg=>(
            <div key={msg.id} style={S.card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{color:'#e8e0d0',fontSize:14,fontWeight:600}}>{msg.title}</div>
                <span style={{fontSize:11,padding:'3px 8px',borderRadius:6,
                  background:'rgba(90,180,100,.1)',color:'#5a9'}}>{msg.status}</span>
              </div>
              <div style={{color:'#555',fontSize:12,marginTop:4,lineHeight:1.8}}>
                {{sms:'ð±ç°¡è¨',email:'ð§Email',both:'ð±+ð§'}[msg.type]}ã{msg.target_tier==='all'?'å¨é¨æå¡':msg.target_tier}ã
                {msg.sent_count}/{msg.total_count} å°
              </div>
              <div style={{color:'#333',fontSize:11,marginTop:2}}>
                {new Date(msg.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
