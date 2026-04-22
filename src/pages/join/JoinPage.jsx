import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORE_ID   = import.meta.env.VITE_STORE_ID   || 'DA_AN'
const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'å¤§å®ç¸½åº'

const SOURCE_OPTIONS = [
  { value:'wilson_friend',   label:'Wilson æåä»ç´¹' },
  { value:'shanshan_friend', label:'çç æåä»ç´¹'  },
  { value:'wilson_ig',       label:'Wilson IG ç²çµ²' },
  { value:'shanshan_ig',     label:'çç IG ç²çµ²'   },
  { value:'google',          label:'Google æå°'     },
  { value:'website',         label:'å®æ¹ç¶²ç«'         },
  { value:'walk_in',         label:'è·¯éé²ä¾'         },
  { value:'referral',        label:'æå¡æ¨è¦'         },
]

const TIERS_INFO = [
  { tier:'éæå¡',    icon:'ð¤', desc:'æ­¡è¿é¦æ¬¡èè¨',           color:'#555'    },
  { tier:'ç´³å£«ä¿±æ¨é¨',icon:'ð¥', desc:'å®ç­æ¶è²» â¥ NT$10,000',   color:'#c9a84c' },
  { tier:'é²éæå¡',  icon:'â­', desc:'ç´¯è¨æ¶è²» â¥ NT$30,000',   color:'#a0c4ff' },
  { tier:'å°æ¦®æå¡',  icon:'ð', desc:'å¹´æ¶è²» â¥ NT$168,000',    color:'#ffd700' },
]

export default function JoinPage() {
  const [step,     setStep]     = useState('form')
  const [form,     setForm]     = useState({
    name:'', phone:'', birthday:'', gender:'', email:'',
    preferred_cigar:'', marketing_consent:true,
    customer_source:'walk_in', referral_code:''
  })
  const [loading,  setLoading]  = useState(false)
  const [errMsg,   setErrMsg]   = useState('')
  const [refValid, setRefValid] = useState(null)
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  useEffect(()=>{
    const p = new URLSearchParams(window.location.search)
    const ref = p.get('ref')
    if(ref){ set('referral_code',ref.toUpperCase()); set('customer_source','referral'); validateRef(ref.toUpperCase()) }
  },[])

  async function validateRef(code){
    if(!code||code.length<4){setRefValid(null);return}
    const {data} = await supabase.from('customers').select('name').eq('referral_code',code).maybeSingle()
    setRefValid(data?{name:data.name}:false)
  }

  async function submit(){
    if(!form.name.trim()){setErrMsg('è«è¼¸å¥å§å');return}
    if(!/^09\d{8}$/.test(form.phone)){setErrMsg('è«è¼¸å¥æ­£ç¢ºææ©èç¢¼ï¼09xxxxxxxxï¼');return}
    if(!form.customer_source){setErrMsg('è«é¸æå¾åªè£¡èªè­æå');return}
    setLoading(true); setErrMsg('')
    const {error} = await supabase.from('member_registrations').insert({
      store_id:form.name,name:form.name.trim(),phone:form.phone.trim(),
      birthday:form.birthday||null,gender:form.gender||null,
      email:form.email.trim()||null,preferred_cigar:form.preferred_cigar||null,
      marketing_consent:form.marketing_consent,source:form.customer_source,
      store_id:STORE_ID,
    })
    if(!error&&form.referral_code&&refValid){
      const {data:referrer} = await supabase.from('customers').select('id,name').eq('referral_code',form.referral_code).maybeSingle()
      if(referrer) await supabase.from('referral_records').insert({
        referrer_id:referrer.id,referrer_name:referrer.name,referrer_code:form.referral_code,
        referee_name:form.name,referee_phone:form.phone,store_id:STORE_ID,
      })
    }
    setLoading(false)
    if(error){setErrMsg('æäº¤å¤±æï¼'+error.message);return}
    setStep('success')
  }

  const S = {
    page:{minHeight:'100vh',background:'linear-gradient(160deg,#0f0d0a 0%,#1a1410 100%)',
          color:'#e8e0d0',fontFamily:'sans-serif',display:'flex',flexDirection:'column',
          alignItems:'center',padding:'32px 20px 60px'},
    card:{width:'100%',maxWidth:420,background:'rgba(26,23,20,.96)',
          border:'1px solid rgba(201,168,76,.2)',borderRadius:20,padding:'28px 24px'},
    label:{color:'#888',fontSize:12,marginBottom:5,marginTop:14,display:'block'},
    input:{width:'100%',padding:'12px 14px',borderRadius:10,background:'#111',
           border:'1px solid #2a2218',color:'#e8e0d0',fontSize:15,outline:'none',boxSizing:'border-box'},
    btn:{width:'100%',padding:'15px 0',borderRadius:12,border:'none',background:'#c9a84c',
         color:'#1a1410',fontSize:16,fontWeight:700,cursor:'pointer',marginTop:20},
    err:{color:'#e06060',fontSize:13,marginTop:10,textAlign:'center'},
  }

  if(step==='success') return(
    <div style={S.page}><div style={{...S.card,textAlign:'center',padding:'40px 28px'}}>
      <div style={{fontSize:56,marginBottom:16}}>ð</div>
      <div style={{color:'#c9a84c',fontSize:22,fontWeight:700,marginBottom:10}}>ç³è«å·²éåºï¼</div>
      <div style={{color:'#888',fontSize:14,lineHeight:1.9}}>
        æè¬æ¨ç³è«å å¥ W Cigar Bar<br/>æåå°ç¡å¿«å¯©æ ¸æ¨çæå¡è³æ ¼<br/>å¯©æ ¸ééå¾å°ä»¥ç°¡è¨éç¥ ð±
      </div>
      <div style={{marginTop:24,background:'#111',borderRadius:14,padding:20}}>
        <div style={{color:'#c9a84c',fontSize:13,fontWeight:600,marginBottom:12}}>â¨ æå¡å°å±¬ç¦å©</div>
        {[['ð','çæ¥ç¶æå¨é¢ 9 æåªæ '],['ð¥','çæ¥ç¶å¤«è»é£²ãé¤é£²åè²»'],
          ['ð°','æ¶è²»å³é»ï¼ç­ç´å ä¹åç'],['ð','æ¨è¦å¥½åï¼éæ¸çæå¥½ç¦¯']].map(([i,t])=>(
          <div key={t} style={{display:'flex',gap:10,marginBottom:8,color:'#888',fontSize:13}}>
            <span>{i}</span><span>{t}</span>
          </div>
        ))}
      </div>
    </div></div>
  )

  return(
    <div style={S.page}><div style={S.card}>
      <div style={{textAlign:'center',marginBottom:24,paddingBottom:20,borderBottom:'1px solid rgba(201,168,76,.1)'}}>
        <div style={{color:'#c9a84c',fontSize:22,fontWeight:700,letterSpacing:3}}>W CIGAR BAR</div>
        <div style={{color:'#6b5a3a',fontSize:12,marginTop:4}}>ç²ºå£«éªèé¤¨ {STORE_NAME}</div>
        <div style={{color:'#c9a84c',fontSize:15,fontWeight:600,marginTop:12}}>ð ç³è«å å¥æå¡</div>
      </div>

      <label style={S.label}>å§å *</label>
      <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="è«è¼¸å¥æ¨çå§å" style={S.input}/>

      <label style={S.label}>ææ©èç¢¼ *</label>
      <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="09xxxxxxxx" inputMode="tel" style={S.input}/>

      <label style={S.label}>çæ¥ <span style={{color:'#5a9',fontSize:11}}>å¡«å¯«äº«çæ¥æä»½ 9 æ</span></label>
      <input value={form.birthday} onChange={e=>set('birthday',e.target.value)} type="date" style={S.input}/>

      <label style={S.label}>æ§å¥ï¼é¸å¡«ï¼</label>
      <select value={form.gender} onChange={e=>set('gender',e.target.value)} style={{...S.input,color:form.gender?'#e8e0d0':'#555'}}>
        <option value="">è«é¸æ</option><option>ç·</option><option>å¥³</option><option>ä¸å¬é</option>
      </select>

      <label style={S.label}>Email <span style={{color:'#5a9',fontSize:11}}>EDM æ´»åéç¥</span></label>
      <input value={form.email} onChange={e=>set('email',e.target.value)} placeholder="your@email.com" inputMode="email" style={S.input}/>

      <label style={S.label}>å¸¸æ½åçï¼é¸å¡«ï¼</label>
      <input value={form.preferred_cigar} onChange={e=>set('preferred_cigar',e.target.value)} placeholder="å¦ï¼COHIBAãMontecristoâ¦" style={S.input}/>

      <label style={S.label}>æ¨å¾åªè£¡èªè­æåï¼ *</label>
      <select value={form.customer_source} onChange={e=>set('customer_source',e.target.value)} style={{...S.input,color:form.customer_source?'#e8e0d0':'#555'}}>
        <option value="">è«é¸æ</option>
        {SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <label style={S.label}>
        æ¨è¦ç¢¼ï¼é¸å¡«ï¼
        {refValid&&<span style={{color:'#5a9',marginLeft:8}}>â {refValid.name} çæ¨è¦</span>}
        {refValid===false&&<span style={{color:'#e06060',marginLeft:8}}>â æ¨è§ç¢¼ä¸å­å¨</span>}
      </label>
      <input value={form.referral_code}
        onChange={e=>{const v=e.target.value.toUpperCase();set('referral_code',v);if(v.length>=6)validateRef(v)}}
        placeholder="è¼¸å¥æåç 6 ä½æ¨è¦ç¢¼"
        style={{...S.input,fontFamily:'monospace',letterSpacing:3}} maxLength={8}/>

      <div style={{marginTop:16,display:'flex',gap:10,alignItems:'flex-start'}}>
        <input type="checkbox" id="consent" checked={form.marketing_consent}
          onChange={e=>set('marketing_consent',e.target.checked)}
          style={{marginTop:3,accentColor:'#c9a84c',width:16,height:16}}/>
        <label htmlFor="consent" style={{color:'#666',fontSize:12,lineHeight:1.7,flex:1}}>
          æåææ¥æ¶ W Cigar Bar æ°åè³è¨ãæ´»åéè«ãçæ¥åªæ åæå¡å°å±¬éç¥
        </label>
      </div>

      {errMsg&&<div style={S.err}>{errMsg}</div>}
      <button onClick={submit} disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>
        {loading?'æäº¤ä¸­...':'ð ç«å³ç³è«å å¥'}
      </button>

      <div style={{marginTop:20,background:'#111',borderRadius:12,padding:16}}>
        <div style={{color:'#555',fontSize:11,marginBottom:10}}>â æå¡ç­ç´ â</div>
        {TIERS_INFO.map(t=>(
          <div key={t.tier} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:7,color:'#888'}}>
            <span>{t.icon} <span style={{color:t.color}}>{t.tier}</span></span>
            <span style={{color:'#444'}}>{t.desc}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:14,textAlign:'center',color:'#2a2218',fontSize:11}}>
        åäººè³æåä¾ W Cigar Bar æå¡æåä½¿ç¨
      </div>
    </div></div>
  )
}
