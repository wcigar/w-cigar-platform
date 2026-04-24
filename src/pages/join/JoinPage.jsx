import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORE_ID   = import.meta.env.VITE_STORE_ID   || 'DA_AN'
const STORE_NAME = import.meta.env.VITE_STORE_NAME || '大安總店'

const GOOGLE_REVIEW_URL = 'https://maps.app.goo.gl/iuZMjWKWUKzk5hEb9?g_st=ic'

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
  { tier:'非會員',               icon:'👤', desc:'歡迎首次蒞臨',        color:'#888'    },
  { tier:'紳士俱樂部',           icon:'🥃', desc:'累計消費 ≥ NT$50,000',  color:'#c9a84c' },
  { tier:'進階會員',             icon:'⭐', desc:'累計消費 ≥ NT$100,000', color:'#a0c4ff' },
  { tier:'尊榮 VIP 開櫃會員',     icon:'👑', desc:'單次消費 ≥ NT$168,000', color:'#ffd700' },
]

const REFERRAL_REWARDS = [
  { count:1,  icon:'💵', reward:'$200 消費折抵' },
  { count:3,  icon:'🚬', reward:'精選雪茄 1 支' },
  { count:5,  icon:'🛋️', reward:'包廂使用 2 小時' },
  { count:10, icon:'👑', reward:'直升 VIP 會員' },
]

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCode(){ return Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('') }

export default function JoinPage() {
  const [step,     setStep]     = useState('form')
  const [form,     setForm]     = useState({
    name:'', phone:'', birthday:'', gender:'', email:'',
    preferred_cigar:'', marketing_consent:true,
    customer_source:'walk_in', referral_code:''
  })
  const [loading,     setLoading]     = useState(false)
  const [errMsg,      setErrMsg]      = useState('')
  const [refValid,    setRefValid]    = useState(null)
  const [myCode,      setMyCode]      = useState('')
  const [copyMsg,     setCopyMsg]     = useState('')
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

    // 1. 檢查手機是否已註冊 → 直接回傳既有推薦碼
    const {data:existing} = await supabase.from('customers')
      .select('referral_code,name').eq('phone',form.phone.trim()).maybeSingle()
    if(existing?.referral_code){
      setMyCode(existing.referral_code)
      setLoading(false)
      setStep('exists')
      return
    }

    // 2. 產生不重複推薦碼
    let code = genCode()
    for(let i=0;i<5;i++){
      const {data:dup} = await supabase.from('customers').select('id').eq('referral_code',code).maybeSingle()
      if(!dup) break
      code = genCode()
    }

    // 3. 直接寫入 customers（自動通過，不需審核）
    const {data:newCust, error} = await supabase.from('customers').insert({
      name:form.name.trim(), phone:form.phone.trim(),
      birthday:form.birthday||null, gender:form.gender||null,
      email:form.email.trim()||null, preferred_cigar:form.preferred_cigar||null,
      marketing_consent:form.marketing_consent, source:form.customer_source,
      home_store_id:STORE_ID, referral_code:code,
      customer_type:'會員', membership_tier:'非會員',
      total_spent:0, enabled:true,
    }).select('id').single()
    if(error){ setLoading(false); setErrMsg('提交失敗：'+error.message); return }

    // 4. 推薦碼裂變紀錄 + 計數
    if(form.referral_code && refValid){
      const {data:referrer} = await supabase.from('customers')
        .select('id,name').eq('referral_code',form.referral_code).maybeSingle()
      if(referrer){
        await supabase.from('referral_records').insert({
          referrer_id:referrer.id, referrer_name:referrer.name, referrer_code:form.referral_code,
          referee_name:form.name.trim(), referee_phone:form.phone.trim(), store_id:STORE_ID,
        })
        await supabase.rpc('increment_referral', { ref_code: form.referral_code }).catch(()=>{})
      }
    }

    setMyCode(code)
    setLoading(false)
    setStep('success')
  }

  function shareLink(){
    return `${window.location.origin}/join?ref=${myCode}`
  }
  async function copyLink(){
    const link = shareLink()
    try {
      await navigator.clipboard.writeText(link)
      setCopyMsg('✅ 連結已複製')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link; document.body.appendChild(ta); ta.select()
      try{ document.execCommand('copy'); setCopyMsg('✅ 連結已複製') }catch{ setCopyMsg('請手動複製：'+link) }
      document.body.removeChild(ta)
    }
    setTimeout(()=>setCopyMsg(''),2500)
  }
  function shareLine(){
    const txt = `🔥 W Cigar Bar 紳士雪茄館 入會禮等您領取！\n使用推薦碼 ${myCode} 加入，雙方都有好禮 🎁\n${shareLink()}`
    window.open('https://line.me/R/share?text='+encodeURIComponent(txt),'_blank')
  }
  async function shareIG(){
    const link = shareLink()
    try { await navigator.clipboard.writeText(link) } catch {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select()
      try{ document.execCommand('copy') }catch{}; document.body.removeChild(ta)
    }
    setCopyMsg('✅ 連結已複製，貼到限動即可分享')
    setTimeout(()=>setCopyMsg(''),3500)
    window.location.href = 'instagram://story-camera'
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
    btnSub:{width:'100%',padding:'12px 0',borderRadius:10,border:'1px solid #2a2218',background:'#111',
            color:'#e8e0d0',fontSize:14,fontWeight:600,cursor:'pointer',marginTop:8,display:'flex',
            alignItems:'center',justifyContent:'center',gap:8},
    err:{color:'#e06060',fontSize:13,marginTop:10,textAlign:'center'},
    sectionTitle:{color:'#c9a84c',fontSize:13,fontWeight:700,marginBottom:10,letterSpacing:1},
  }

  // ========== 成功頁（新入會 or 已存在）==========
  if(step==='success' || step==='exists') {
    const title = step==='exists' ? '您已是會員 👋' : '🎉 入會成功！'
    const subtitle = step==='exists'
      ? '此手機已完成註冊，這是您的專屬推薦碼'
      : '歡迎加入 W Cigar Bar，這是您的專屬推薦碼'

    return (
      <div style={S.page}><div style={{...S.card,padding:'36px 24px'}}>
        <div style={{textAlign:'center',marginBottom:18}}>
          <div style={{color:'#c9a84c',fontSize:22,fontWeight:700,marginBottom:8}}>{title}</div>
          <div style={{color:'#888',fontSize:13,lineHeight:1.7}}>{subtitle}</div>
        </div>

        {/* 推薦碼方塊 */}
        <div style={{background:'linear-gradient(135deg,#1a1410 0%,#2a1f14 100%)',border:'1px solid rgba(201,168,76,.4)',borderRadius:14,padding:'22px 20px',textAlign:'center',marginBottom:18}}>
          <div style={{color:'#888',fontSize:11,marginBottom:8,letterSpacing:2}}>MY REFERRAL CODE</div>
          <div style={{color:'#ffd700',fontSize:34,fontWeight:800,letterSpacing:6,fontFamily:'monospace'}}>{myCode}</div>
        </div>

        {/* 分享按鈕 */}
        <div style={S.sectionTitle}>📣 分享給好友</div>
        <button onClick={copyLink}  style={S.btnSub}>🔗 複製推薦連結</button>
        <button onClick={shareLine} style={{...S.btnSub,background:'#06c755',color:'#fff',border:'none'}}>💚 LINE 分享</button>
        <button onClick={shareIG}   style={{...S.btnSub,background:'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',color:'#fff',border:'none'}}>📸 IG 限動</button>
        {copyMsg && <div style={{color:'#5a9',fontSize:12,textAlign:'center',marginTop:8}}>{copyMsg}</div>}

        {/* 推薦獎勵 */}
        <div style={{marginTop:24,background:'#111',borderRadius:14,padding:18}}>
          <div style={S.sectionTitle}>🎁 推薦獎勵（好友成功入會並消費）</div>
          {REFERRAL_REWARDS.map(r=>(
            <div key={r.count} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderTop:r.count===1?'none':'1px solid #2a2218'}}>
              <div style={{width:34,height:34,borderRadius:'50%',background:'rgba(201,168,76,.15)',color:'#c9a84c',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>{r.count}位</div>
              <div style={{flex:1,fontSize:13,color:'#e8e0d0'}}>{r.icon} {r.reward}</div>
            </div>
          ))}
        </div>

        {/* Google 五星好評 */}
        <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
          style={{display:'block',marginTop:20,background:'linear-gradient(135deg,#1a1410 0%,#251a10 100%)',border:'1px solid rgba(255,215,0,.3)',borderRadius:14,padding:20,textDecoration:'none',textAlign:'center'}}>
          <div style={{fontSize:28,marginBottom:8}}>⭐⭐⭐⭐⭐</div>
          <div style={{color:'#34a853',fontSize:16,fontWeight:800,marginBottom:6}}>打卡五星好評</div>
          <div style={{color:'#ffd700',fontSize:14,fontWeight:700,marginBottom:14}}>🎁 即送雪茄單人煙灰缸一只！</div>
          <div style={{display:'inline-block',padding:'12px 28px',borderRadius:10,background:'#34a853',color:'#fff',fontSize:15,fontWeight:700}}>📍 立即前往評價</div>
          <div style={{color:'#e68a00',fontSize:12,marginTop:12,lineHeight:1.6}}>📱 評價完成後，請出示畫面給店員即可領取！</div>
        </a>

        {/* 會員等級 */}
        <div style={{marginTop:20,background:'#111',borderRadius:12,padding:16}}>
          <div style={{color:'#555',fontSize:11,marginBottom:10}}>— 會員等級 —</div>
          {TIERS_INFO.map(t=>(
            <div key={t.tier} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:7,color:'#888'}}>
              <span>{t.icon} <span style={{color:t.color}}>{t.tier}</span></span>
              <span style={{color:'#444'}}>{t.desc}</span>
            </div>
          ))}
        </div>
      </div></div>
    )
  }

  // ========== 申請表單 ==========
  return(
    <div style={S.page}><div style={S.card}>
      <div style={{textAlign:'center',marginBottom:24,paddingBottom:20,borderBottom:'1px solid rgba(201,168,76,.1)'}}>
        <div style={{color:'#c9a84c',fontSize:22,fontWeight:700,letterSpacing:3}}>W CIGAR BAR</div>
        <div style={{color:'#6b5a3a',fontSize:12,marginTop:4}}>紳士雪茄館 {STORE_NAME}</div>
        <div style={{color:'#c9a84c',fontSize:15,fontWeight:600,marginTop:12}}>🔑 申請加入會員</div>
        <div style={{color:'#5a9',fontSize:11,marginTop:6}}>✨ 填表即自動通過，立即獲得專屬推薦碼</div>
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
        {loading?'處理中...':'🎉 立即入會（自動通過）'}
      </button>

      {/* 推薦獎勵預覽 */}
      <div style={{marginTop:20,background:'#111',borderRadius:12,padding:16}}>
        <div style={{color:'#c9a84c',fontSize:12,fontWeight:700,marginBottom:10}}>🎁 推薦好友福利</div>
        {REFERRAL_REWARDS.map(r=>(
          <div key={r.count} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6,color:'#888'}}>
            <span style={{color:'#c9a84c'}}>推薦 {r.count} 位</span>
            <span>{r.icon} {r.reward}</span>
          </div>
        ))}
      </div>

      {/* 會員等級 */}
      <div style={{marginTop:14,background:'#111',borderRadius:12,padding:16}}>
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
