import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

const TEMPLATES = {
  birthday:'親愛的 {{name}}，本月是您的生日！W Cigar Bar 敬獻生日專屬禮遇，憑此訊息至門市享 9 折優惠 🎂🥃',
  newItem:'親愛的 {{name}}，W Cigar Bar 新品到貨通知，限量珍藏，歡迎蒞臨品鑑 🚬',
  event:'親愛的 {{name}}，W Cigar Bar 誠摯還請您參加品鑑活動，詳情請洽镠市 🔑',
  vip:'親愛的 {{name}}，感謝您長期的支持。尊榮會員專屬優惠即日起生效，期待您的蒞臨 👑',
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
    if(!form.title){alert('請填寫活動名稱');return}
    if(!form.content){alert('請填寫訊息內容');return}
    if(!count){alert('沒有符合條件的客戶');return}
    if(!confirm(`確定發送給 ${count} 位客戶？`)) return
    setSending(true)
    const {error}=await supabase.from('marketing_messages').insert({
      store_id:STORE_ID,title:form.title,type:form.type,subject:form.subject,
      content:form.content,target_tier:form.target_tier,
      status:'sent',total_count:count,sent_count:count,created_by:'ADMIN',
      sent_at:new Date().toISOString(),
    })
    setSending(false)
    if(error){alert('建立失敗：'+error.message);return}
    alert(`✅ 行銷活動已建立！共 ${count} 位收件人\n\n注意：實際簡訊/Email 發送需設定 Every8d / Resend API 金鑰`)
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
      <div style={S.title}>📣 行銷發送中心</div>
      <div style={S.sub}>簡訊 + Email 行銷管理</div>
      <div style={S.tabs}>
        <button style={S.tab(tab==='compose')} onClick={()=>setTab('compose')}>✉️ 撰寫發送</button>
        <button style={S.tab(tab==='history')} onClick={()=>setTab('history')}>📊 發送紀錄</button>
      </div>

      {tab==='compose'&&(
        <div>
          <label style={S.label}>活動名稱</label>
          <input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="如：4月新品到貨通知" style={S.input}/>

          <label style={S.label}>發送管道</label>
          <div style={{display:'flex',gap:8}}>
            {['sms','email','both'].map(t=>(
              <button key={t} onClick={()=>set('type',t)} style={{flex:1,padding:'10px 0',borderRadius:10,border:'none',
                cursor:'pointer',background:form.type===t?'#c9a84c':'#1a1714',
                color:form.type===t?'#1a1410':'#888',fontWeight:form.type===t?700:400,fontSize:13}}>
                {{sms:'📱 簡訊',email:'📧 Email',both:'📱+📧 全者'}[t]}
              </button>
            ))}
          </div>

          {(form.type==='email'||form.type==='both')&&(
            <><label style={S.label}>Email 主旨</label>
            <input value={form.subject} onChange={e=>set('subject',e.target.value)} placeholder="W Cigar Bar 會員專屬通知" style={S.input}/></>
          )}

          <label style={S.label}>目標客群</label>
          <select value={form.target_tier} onChange={e=>set('target_tier',e.target.value)} style={S.input}>
            {['all','非會員','紳士俱樂部','進階會員','尊榮會員'].map(v=>(
              <option key={v} value={v}>{v==='all'?'全部會員':v}</option>
            ))}
          </select>

          <div style={{background:'#111',borderRadius:10,padding:'10px 14px',marginTop:8}}>
            <span style={{color:'#c9a84c',fontSize:15,fontWeight:700}}>{count}</span>
            <span style={{color:'#555',fontSize:12}}>　位符合條件（已同意行銷）</span>
            {preview.length>0&&<div style={{marginTop:4,fontSize:11,color:'#444'}}>預覽：{preview.map(c=>c.name).join('、')}{count>5?`…等${count}人`:''}</div>}
          </div>

          <label style={S.label}>快速範本</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {Object.entries(TEMPLATES).map(([k,v])=>(
              <button key={k} onClick={()=>set('content',v)} style={{padding:'5px 12px',borderRadius:8,
                fontSize:11,cursor:'pointer',border:'1px solid #2a2218',background:'#111',color:'#888'}}>
                {{birthday:'🎂生日祝福',newItem:'🚬新品到貨',event:'🎪活動還請',vip:'👑VIP專屬'}[k]}
              </button>
            ))}
          </div>

          <label style={S.label}>訊息內容 <span style={{color:'#555',fontSize:11}}>可用 {'{{name}}'} 代入姓名</span></label>
          <textarea value={form.content} onChange={e=>set('content',e.target.value)} placeholder="親愛的 {{name}}，..." style={S.textarea}/>
          <div style={{color:'#444',fontSize:11,marginTop:4}}>字敼：{form.content.length} 字
            {form.type!=='email'&&form.content.length>70&&<span style={{color:'#ffd700',marginLeft:8}}>⚠️ 超過70字將計2則簡訊費用</span>}
          </div>

          <button onClick={send} disabled={sending||!count} style={{...S.btn,opacity:(sending||!count)?0.5:1}}>
            {sending?'處理中...':`📤 發送給 ${count} 位客戶`}
          </button>
        </div>
      )}

      {tab==='history'&&(
        <div>
          {loading?<div style={{textAlign:'center',color:'#555',padding:40}}>載入中...</div>
          :history.length===0?<div style={{textAlign:'center',color:'#444',padding:40}}>尚無發送紀錄</div>
          :history.map(msg=>(
            <div key={msg.id} style={S.card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{color:'#e8e0d0',fontSize:14,fontWeight:600}}>{msg.title}</div>
                <span style={{fontSize:11,padding:'3px 8px',borderRadius:6,
                  background:'rgba(90,180,100,.1)',color:'#5a9'}}>{msg.status}</span>
              </div>
              <div style={{color:'#555',fontSize:12,marginTop:4,lineHeight:1.8}}>
                {{sms:'📱簡訊',email:'📧Email',both:'📱+📧'}[msg.type]}　{msg.target_tier==='all'?'全部會員':msg.target_tier}　
                {msg.sent_count}/{msg.total_count} 封
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
