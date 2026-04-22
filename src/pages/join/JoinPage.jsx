import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORE_ID   = import.meta.env.VITE_STORE_ID   || 'DA_AN'
const STORE_NAME = import.meta.env.VITE_STORE_NAME || '大安總店'

const SOURCE_OPTIONS = [
  { value:'wilson_friend',   label:'Wilson 朋友介紹' },
  { value:'shanshan_friend', label:'珊珊 朋友介紹'  },
  { value:'wilson_ig',       label:'Wilson IG 粉絲' },
  { value:'shanshan_ig',     label:'珊珊 IG 粉絲'   },
  { value:'google',          label:'Google 搜尋'     },
  { value:'website',         label:'官方網站'         },
  { value:'walk_in',         label:'路過進來'         },
  { value:'referral',        label:'會員推薦'         },
]

const TIERS_INFO = [
  { tier:'非會員',    icon:'👤', desc:'歡迎首次蒞臨',           color:'#555'    },
  { tier:'紳士俱樂部',icon:'🥃', desc:'單筆消費 ≥ NT$10,000',   color:'#c9a84c' },
  { tier:'進階會員',  icon:'⭐', desc:'累計消費 ≥ NT$30,000',   color:'#a0c4ff' },
  { tier:'尊榮會員',  icon:'👑', desc:'年消費 ≥ NT$168,000',    color:'#ffd700' },
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
    if(!form.name.trim()){setErrMsg('請輸入姓名');return}
    if(!/^09\d{8}$/.test(form.phone)){setErrMsg('請輸入正確手機號碼（09xxxxxxxx）');return}
    if(!form.customer_source){setErrMsg('請選擇從哪裡認識我們');return}
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
    if(error){setErrMsg('提交失敗：'+error.message);return}
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
      <div style={{fontSize:56,marginBottom:16}}>🎉</div>
      <div style={{color:'#c9a84c',fontSize:22,fontWeight:700,marginBottom:10}}>申請已送出！</div>
      <div style={{color:'#888',fontSize:14,lineHeight:1.9}}>
        感謝您申請加入 W Cigar Bar<br/>我們將盡快審核您的會員資格<br/>審核通過後將以簡訊通知 📱
      </div>
      <div style={{marginTop:24,background:'#111',borderRadius:14,padding:20}}>
        <div style={{color:'#c9a84c',fontSize:13,fontWeight:600,marginBottom:12}}>✨ 會員專屬福利</div>
        {[['🎂','生日當月全面 9 折優惠'],['🥂','生日當天軟飲、餐飲免費'],
          ['💰','消費即點，等級加乘倍率'],['🎁','推薦好友，雙方皆有好禮']].map(([i,t])=>(
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
        <div style={{color:'#6b5a3a',fontSize:12,marginTop:4}}>紳士雪茄館 {STORE_NAME}</div>
        <div style={{color:'#c9a84c',fontSize:15,fontWeight:600,marginTop:12}}>🔑 申請加入會員</div>
      </div>

      <label style={S.label}>姓名 *</label>
      <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="請輸入您的姓名" style={S.input}/>

      <label style={S.label}>手機號碼 *</label>
      <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="09xxxxxxxx" inputMode="tel" style={S.input}/>

      <label style={S.label}>生日 <span style={{color:'#5a9',fontSize:11}}>填寫享生日月份 9 折</span></label>
      <input value={form.birthday} onChange={e=>set('birthday',e.target.value)} type="date" style={S.input}/>

      <label style={S.label}>性別（選填）</label>
      <select value={form.gender} onChange={e=>set('gender',e.target.value)} style={{...S.input,color:form.gender?'#e8e0d0':'#555'}}>
        <option value="">請選擇</option><option>男</option><option>女</option><option>不公開</option>
      </select>

      <label style={S.label}>Email <span style={{color:'#5a9',fontSize:11}}>EDM 活動通知</span></label>
      <input value={form.email} onChange={e=>set('email',e.target.value)} placeholder="your@email.com" inputMode="email" style={S.input}/>

      <label style={S.label}>常抽品牌（選填）</label>
      <input value={form.preferred_cigar} onChange={e=>set('preferred_cigar',e.target.value)} placeholder="如：COHIBA、Montecristo…" style={S.input}/>

      <label style={S.label}>您從哪裡認識我們？ *</label>
      <select value={form.customer_source} onChange={e=>set('customer_source',e.target.value)} style={{...S.input,color:form.customer_source?'#e8e0d0':'#555'}}>
        <option value="">請選擇</option>
        {SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <label style={S.label}>
        推薦碼（選填）
        {refValid&&<span style={{color:'#5a9',marginLeft:8}}>✅ {refValid.name} 的推薦</span>}
        {refValid===false&&<span style={{color:'#e06060',marginLeft:8}}>❌ 推薦碼不存在</span>}
      </label>
      <input value={form.referral_code}
        onChange={e=>{const v=e.target.value.toUpperCase();set('referral_code',v);if(v.length>=6)validateRef(v)}}
        placeholder="輸入朋友的 6 位推薦碼"
        style={{...S.input,fontFamily:'monospace',letterSpacing:3}} maxLength={8}/>

      <div style={{marginTop:16,display:'flex',gap:10,alignItems:'flex-start'}}>
        <input type="checkbox" id="consent" checked={form.marketing_consent}
          onChange={e=>set('marketing_consent',e.target.checked)}
          style={{marginTop:3,accentColor:'#c9a84c',width:16,height:16}}/>
        <label htmlFor="consent" style={{color:'#666',fontSize:12,lineHeight:1.7,flex:1}}>
          我同意接收 W Cigar Bar 新品資訊、活動邀請、生日優惠及會員專屬通知
        </label>
      </div>

      {errMsg&&<div style={S.err}>{errMsg}</div>}
      <button onClick={submit} disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>
        {loading?'提交中...':'🎉 立即申請加入'}
      </button>

      <div style={{marginTop:20,background:'#111',borderRadius:12,padding:16}}>
        <div style={{color:'#555',fontSize:11,marginBottom:10}}>— 會員等級 —</div>
        {TIERS_INFO.map(t=>(
          <div key={t.tier} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:7,color:'#888'}}>
            <span>{t.icon} <span style={{color:t.color}}>{t.tier}</span></span>
            <span style={{color:'#444'}}>{t.desc}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:14,textAlign:'center',color:'#2a2218',fontSize:11}}>
        個人資料僅供 W Cigar Bar 會員服務使用
      </div>
    </div></div>
  )
}
