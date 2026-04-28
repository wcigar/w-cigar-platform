import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORE_ID   = import.meta.env.VITE_STORE_ID   || 'DA_AN'
const STORE_NAME = import.meta.env.VITE_STORE_NAME || '大安總店'
const GOOGLE_REVIEW_URL = 'https://maps.app.goo.gl/iuZMjWKWUKzk5hEb9?g_st=ic'

const SOURCE_OPTIONS = [
  { value:'wilson_friend',label:'Wilson 朋友介紹' },{ value:'shanshan_friend',label:'珊珊 朋友介紹' },
  { value:'wilson_ig',label:'Wilson IG 粉絲' },{ value:'shanshan_ig',label:'珊珊 IG 粉絲' },
  { value:'google',label:'Google 搜尋' },{ value:'website',label:'官方網站' },
  { value:'walk_in',label:'路過進來' },{ value:'referral',label:'會員推薦' },
]
const TIERS_INFO = [
  { tier:'非會員',icon:'👤',desc:'歡迎首次蒞臨',color:'var(--ash)' },
  { tier:'紳士俱樂部',icon:'🥃',desc:'累計消費 ≥ NT$50,000',color:'rgba(196,163,90,.8)' },
  { tier:'進階會員',icon:'⭐',desc:'累計消費 ≥ NT$100,000',color:'rgba(100,140,170,.8)' },
  { tier:'尊榮 VIP',icon:'👑',desc:'單次消費 ≥ NT$168,000',color:'#ffd700' },
]
const REFERRAL_REWARDS = [
  { count:1,icon:'💵',reward:'$200 消費折抵' },{ count:3,icon:'🚬',reward:'精選雪茄 1 支' },
  { count:5,icon:'🛋️',reward:'包廂使用 2 小時' },{ count:10,icon:'👑',reward:'直升 VIP 會員' },
]
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCode(){ return Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('') }

export default function JoinPage() {
  const [step,setStep]=useState('form')
  const [form,setForm]=useState({ name:'',phone:'',birthday:'',gender:'',email:'',preferred_cigar:'',marketing_consent:true,customer_source:'walk_in',referral_code:'' })
  const [loading,setLoading]=useState(false)
  const [errMsg,setErrMsg]=useState('')
  const [refValid,setRefValid]=useState(null)
  const [myCode,setMyCode]=useState('')
  const [copyMsg,setCopyMsg]=useState('')
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))

  useEffect(()=>{ const p=new URLSearchParams(window.location.search); const ref=p.get('ref'); if(ref){set('referral_code',ref.toUpperCase());set('customer_source','referral');validateRef(ref.toUpperCase())} },[])

  async function validateRef(code){ if(!code||code.length<4){setRefValid(null);return}; const {data}=await supabase.from('customers').select('name').eq('referral_code',code).maybeSingle(); setRefValid(data?{name:data.name}:false) }

  async function submit(){
    if(!form.name.trim()){setErrMsg('請輸入姓名');return}
    if(!/^09\d{8}$/.test(form.phone)){setErrMsg('請輸入正確手機號碼（09xxxxxxxx）');return}
    if(!form.customer_source){setErrMsg('請選擇從哪裡認識我們');return}
    setLoading(true);setErrMsg('')
    const {data:existing}=await supabase.from('customers').select('referral_code,name').eq('phone',form.phone.trim()).maybeSingle()
    if(existing?.referral_code){setMyCode(existing.referral_code);setLoading(false);setStep('exists');return}
    let code=genCode()
    for(let i=0;i<5;i++){const {data:dup}=await supabase.from('customers').select('id').eq('referral_code',code).maybeSingle();if(!dup)break;code=genCode()}
    const {data:newCust,error}=await supabase.from('customers').insert({ name:form.name.trim(),phone:form.phone.trim(),birthday:form.birthday||null,gender:form.gender||null,email:form.email.trim()||null,preferred_cigar:form.preferred_cigar||null,marketing_consent:form.marketing_consent,source:form.customer_source,home_store_id:STORE_ID,referral_code:code,customer_type:'會員',membership_tier:'非會員',total_spent:0,enabled:true }).select('id').single()
    if(error){setLoading(false);setErrMsg('提交失敗：'+error.message);return}
    if(form.referral_code&&refValid){ const {data:referrer}=await supabase.from('customers').select('id,name').eq('referral_code',form.referral_code).maybeSingle(); if(referrer){await supabase.from('referral_records').insert({referrer_id:referrer.id,referrer_name:referrer.name,referrer_code:form.referral_code,referee_name:form.name.trim(),referee_phone:form.phone.trim(),store_id:STORE_ID});await supabase.rpc('increment_referral',{ref_code:form.referral_code}).catch(()=>{})} }
    setMyCode(code);setLoading(false);setStep('success')
  }

  function shareLink(){return `${window.location.origin}/join?ref=${myCode}`}
  async function copyLink(){ const link=shareLink(); try{await navigator.clipboard.writeText(link);setCopyMsg('✅ 連結已複製')}catch{const ta=document.createElement('textarea');ta.value=link;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');setCopyMsg('✅ 連結已複製')}catch{setCopyMsg('請手動複製：'+link)};document.body.removeChild(ta)}; setTimeout(()=>setCopyMsg(''),2500) }
  function shareLine(){ const txt=`🔥 W Cigar Bar 紳士雪茄館 入會禮等您領取！\n使用推薦碼 ${myCode} 加入，雙方都有好禮 🎁\n${shareLink()}`; window.open('https://line.me/R/share?text='+encodeURIComponent(txt),'_blank') }
  async function shareIG(){ const link=shareLink(); try{await navigator.clipboard.writeText(link)}catch{const ta=document.createElement('textarea');ta.value=link;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch{};document.body.removeChild(ta)}; setCopyMsg('✅ 連結已複製，貼到限動即可分享'); setTimeout(()=>setCopyMsg(''),3500); window.location.href='instagram://story-camera' }

  const L = { fontFamily:'Noto Serif TC,serif', fontSize:12, color:'#888078', marginBottom:6, marginTop:14, display:'block' }

  // ═══════ 成功頁 ═══════
  if(step==='success'||step==='exists'){
    const title = step==='exists' ? '您已是會員 👋' : '🎉 歡迎加入！'
    const subtitle = step==='exists' ? '此手機已完成註冊，這是您的專屬推薦碼' : `${form.name}，正式成為 W Cigar Bar 會員`
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'40px 20px 80px',maxWidth:420,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:48,marginBottom:12}}>{step==='exists'?'👋':'🎉'}</div>
          <div style={{fontFamily:'Noto Serif TC,serif',fontSize:22,fontWeight:700,color:'rgba(196,163,90,1)'}}>{title}</div>
          <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,color:'#888078',marginTop:6,lineHeight:1.7}}>{subtitle}</div>
        </div>

        {/* 推薦碼 */}
        <div className="wcb-card" style={{borderColor:'rgba(196,163,90,.3)',textAlign:'center',padding:'28px 24px',width:'100%'}}>
          <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:10,fontStyle:'italic',color:'rgba(196,163,90,.3)',letterSpacing:3}}>My Referral Code</div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:36,fontWeight:800,letterSpacing:8,color:'rgba(196,163,90,1)',margin:'12px 0',background:'linear-gradient(180deg,rgba(196,163,90,1) 50%,rgba(196,163,90,.5))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{myCode}</div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'rgba(196,163,90,.25)',wordBreak:'break-all',marginBottom:12}}>{shareLink()}</div>
          <button className="wcb-btn-outline" style={{width:'100%'}} onClick={copyLink}>🔗 複製推薦連結</button>
        </div>
        {copyMsg&&<div style={{fontFamily:'var(--mono)',fontSize:12,color:'rgba(100,170,100,.8)',textAlign:'center',marginTop:8}}>{copyMsg}</div>}

        {/* 分享 */}
        <div style={{width:'100%',display:'flex',flexDirection:'column',gap:8,marginTop:16}}>
          <button onClick={shareLine} style={{width:'100%',padding:'14px 0',borderRadius:12,border:'none',background:'#06C755',color:'#fff',fontFamily:'Noto Serif TC,serif',fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:2}}>💚 LINE 分享</button>
          <button onClick={shareIG} style={{width:'100%',padding:'14px 0',borderRadius:12,border:'none',background:'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',color:'#fff',fontFamily:'Noto Serif TC,serif',fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:2}}>📸 IG 限動</button>
        </div>

        {/* 推薦獎勵 */}
        <div className="wcb-card" style={{width:'100%',marginTop:20}}>
          <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,color:'rgba(196,163,90,1)',fontWeight:700,marginBottom:10}}>🎁 推薦獎勵</div>
          {REFERRAL_REWARDS.map(r=><div key={r.count} className="wcb-stat"><span className="wcb-stat-k">推薦 {r.count} 位</span><span className="wcb-stat-v">{r.icon} {r.reward}</span></div>)}
        </div>

        {/* 五星好評 */}
        <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" className="wcb-card" style={{display:'block',width:'100%',marginTop:12,borderColor:'rgba(52,168,83,.4)',textDecoration:'none',textAlign:'center',padding:'24px 20px'}}>
          <div style={{fontSize:32,marginBottom:8}}>⭐⭐⭐⭐⭐</div>
          <div style={{fontFamily:'Noto Serif TC,serif',color:'#34a853',fontSize:17,fontWeight:800,marginBottom:6}}>打卡五星好評</div>
          <div style={{fontFamily:'Noto Serif TC,serif',color:'rgba(196,163,90,1)',fontSize:15,fontWeight:700,marginBottom:14}}>🎁 即送雪茄單人煙灰缸一只！</div>
          <div style={{display:'inline-block',padding:'12px 28px',borderRadius:10,background:'#34a853',color:'#fff',fontFamily:'Noto Serif TC,serif',fontSize:15,fontWeight:700}}>📍 立即前往評價</div>
          <div style={{fontFamily:'Noto Serif TC,serif',color:'rgba(230,138,0,.9)',fontSize:12,marginTop:12,lineHeight:1.6}}>📱 評價完成後，請出示畫面給店員即可領取！</div>
        </a>

        {/* 會員等級 */}
        <div className="wcb-card" style={{width:'100%',marginTop:12}}>
          <div style={{fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:11,color:'rgba(196,163,90,.3)',letterSpacing:3,marginBottom:10}}>Membership Tiers</div>
          {TIERS_INFO.map(t=><div key={t.tier} className="wcb-stat"><span className="wcb-stat-k">{t.icon} <span style={{color:t.color}}>{t.tier}</span></span><span className="wcb-stat-v" style={{fontSize:11,color:'var(--smoke)'}}>{t.desc}</span></div>)}
        </div>

        <div className="wcb-ornament" style={{marginTop:20}}>◇</div>
      </div>
    )
  }

  // ═══════ 表單頁 ═══════
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 20px 80px',maxWidth:420,margin:'0 auto'}}>
      {/* Header */}
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{width:120,height:1,margin:'0 auto 20px',background:'linear-gradient(90deg,transparent,rgba(196,163,90,.4),transparent)',position:'relative'}}>
          <span style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontSize:6,color:'rgba(196,163,90,.5)',background:'#050403',padding:'0 8px'}}>◆</span>
        </div>
        <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:48,fontWeight:300,letterSpacing:6,background:'linear-gradient(180deg,#f0e8d8 30%,rgba(196,163,90,.7))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>W</div>
        <div style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'rgba(196,163,90,.5)',letterSpacing:6,marginTop:8,fontWeight:300}}>紳 士 雪 茄 館</div>
        <div style={{fontFamily:'Noto Serif TC,serif',fontSize:15,color:'rgba(196,163,90,.7)',marginTop:12,fontWeight:500}}>🔑 免費加入會員</div>
        <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:10,fontStyle:'italic',color:'rgba(196,163,90,.2)',letterSpacing:3,marginTop:6}}>fill the form below to join</div>
      </div>

      {/* 表單卡片 */}
      <div className="wcb-card" style={{padding:28,width:'100%'}}>
        <label style={L}>姓名 *</label>
        <input className="wcb-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="請輸入您的姓名"/>

        <label style={L}>手機號碼 *</label>
        <input className="wcb-input" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="09xxxxxxxx" inputMode="tel"/>

        <label style={L}>生日 <span style={{fontFamily:'var(--mono)',fontSize:10,color:'rgba(100,170,100,.6)'}}>填寫享生日月份 9 折</span></label>
        <input className="wcb-input" value={form.birthday} onChange={e=>set('birthday',e.target.value)} type="date"/>

        <label style={L}>性別（選填）</label>
        <select className="wcb-input" value={form.gender} onChange={e=>set('gender',e.target.value)}>
          <option value="">請選擇</option><option>男</option><option>女</option><option>不公開</option>
        </select>

        <label style={L}>Email <span style={{fontFamily:'var(--mono)',fontSize:10,color:'rgba(100,170,100,.6)'}}>EDM 活動通知</span></label>
        <input className="wcb-input" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="your@email.com" inputMode="email"/>

        <label style={L}>常抽品牌（選填）</label>
        <input className="wcb-input" value={form.preferred_cigar} onChange={e=>set('preferred_cigar',e.target.value)} placeholder="如：COHIBA、Montecristo…"/>

        <label style={L}>您從哪裡認識我們？ *</label>
        <select className="wcb-input" value={form.customer_source} onChange={e=>set('customer_source',e.target.value)}>
          <option value="">請選擇</option>
          {SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label style={L}>
          推薦碼（選填）
          {refValid&&<span style={{color:'rgba(100,170,100,.8)',marginLeft:8}}>✅ {refValid.name} 的推薦</span>}
          {refValid===false&&<span style={{color:'rgba(190,70,60,.8)',marginLeft:8}}>❌ 推薦碼不存在</span>}
        </label>
        <input className="wcb-input" value={form.referral_code}
          onChange={e=>{const v=e.target.value.toUpperCase();set('referral_code',v);if(v.length>=6)validateRef(v)}}
          placeholder="輸入 6 位推薦碼" maxLength={8}
          style={{fontFamily:'JetBrains Mono,monospace',letterSpacing:4,textAlign:'center'}}/>

        <div style={{marginTop:16,display:'flex',gap:10,alignItems:'flex-start'}}>
          <input type="checkbox" id="consent" checked={form.marketing_consent} onChange={e=>set('marketing_consent',e.target.checked)} style={{marginTop:3,accentColor:'rgba(196,163,90,.8)',width:16,height:16}}/>
          <label htmlFor="consent" style={{fontFamily:'Noto Serif TC,serif',color:'var(--smoke)',fontSize:12,lineHeight:1.7,flex:1}}>我同意接收 W Cigar Bar 新品資訊、活動邀請、生日優惠及會員專屬通知</label>
        </div>

        {errMsg&&<div style={{color:'rgba(190,70,60,.8)',fontFamily:'var(--serif)',fontSize:13,marginTop:12,textAlign:'center'}}>{errMsg}</div>}
        <button className="wcb-btn-gold" style={{marginTop:20,letterSpacing:3}} onClick={submit} disabled={loading}>{loading?'處理中...':'🎉 立即入會'}</button>
      </div>

      {/* 推薦獎勵預覽 */}
      <div className="wcb-card" style={{width:'100%',marginTop:16}}>
        <div style={{fontFamily:'Noto Serif TC,serif',fontSize:12,fontWeight:700,color:'rgba(196,163,90,.8)',marginBottom:10}}>🎁 推薦好友福利</div>
        {REFERRAL_REWARDS.map(r=><div key={r.count} className="wcb-stat"><span className="wcb-stat-k" style={{color:'rgba(196,163,90,.6)'}}>推薦 {r.count} 位</span><span className="wcb-stat-v" style={{fontSize:12}}>{r.icon} {r.reward}</span></div>)}
      </div>

      {/* 會員等級 */}
      <div className="wcb-card" style={{width:'100%',marginTop:12}}>
        <div style={{fontFamily:'Cormorant Garamond,serif',fontStyle:'italic',fontSize:11,color:'rgba(196,163,90,.3)',letterSpacing:3,marginBottom:10}}>Membership Tiers</div>
        {TIERS_INFO.map(t=><div key={t.tier} className="wcb-stat"><span className="wcb-stat-k">{t.icon} <span style={{color:t.color}}>{t.tier}</span></span><span className="wcb-stat-v" style={{fontSize:11,color:'var(--smoke)'}}>{t.desc}</span></div>)}
      </div>

      <div className="wcb-ornament" style={{marginTop:20}}>◇</div>
    </div>
  )
}
