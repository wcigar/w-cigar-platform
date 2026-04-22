import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

export default function CampaignBuilder({ onClose, onSend }) {
  const [step,       setStep]       = useState(1) // 1:目標 2:內容 3:預覽 4:完成
  const [templates,  setTemplates]  = useState([])
  const [form,       setForm]       = useState({
    title: '', type: 'sms', subject: '', content: '',
    target_tier: 'all', target_segment: 'all',
    scheduled_at: '', is_scheduled: false,
  })
  const [preview,    setPreview]    = useState({ count:0, sample:[] })
  const [sending,    setSending]    = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.from('crm_templates').select('*').eq('store_id', STORE_ID).eq('is_active', true)
      .then(({ data }) => setTemplates(data || []))
  }, [])

  useEffect(() => { if (step >= 3) loadPreview() }, [step, form.target_tier])

  async function loadPreview() {
    const { data } = await supabase.rpc('crm_get_customers', {
      p_store_id: STORE_ID,
      p_tier: form.target_tier,
      p_limit: 5, p_offset: 0,
    })
    if (data?.success) {
      setPreview({ count: data.total, sample: data.customers || [] })
    }
  }

  async function send() {
    if (!form.title || !form.content) { alert('請填寫標題和內容'); return }
    setSending(true)
    const { error } = await supabase.from('marketing_messages').insert({
      store_id: STORE_ID,
      title:    form.title,
      type:     form.type,
      subject:  form.subject || null,
      content:  form.content,
      target_tier: form.target_tier,
      status:   form.is_scheduled ? 'scheduled' : 'sending',
      total_count: preview.count,
      sent_count:  form.is_scheduled ? 0 : preview.count,
      scheduled_at: form.is_scheduled ? form.scheduled_at : null,
      sent_at:  form.is_scheduled ? null : new Date().toISOString(),
      created_by: 'ADMIN',
    })
    setSending(false)
    if (error) { alert('建立失敗：' + error.message); return }
    setStep(4)
    onSend?.()
  }

  const STEPS = ['目標客群', '訊息內容', '預覽確認', '完成']

  const S = {
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.92)', display:'flex',
               alignItems:'center', justifyContent:'center', zIndex:9999 },
    modal:   { background:'#1a1714', border:'1px solid rgba(201,168,76,.25)', borderRadius:20,
               padding:0, width:480, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto' },
    header:  { padding:'20px 24px 0', borderBottom:'1px solid #2a2218', paddingBottom:16 },
    body:    { padding:'20px 24px' },
    label:   { color:'#aaa', fontSize:12, marginBottom:6, display:'block' },
    input:   { width:'100%', padding:'11px 14px', borderRadius:10, background:'#111',
               border:'1px solid #2a2218', color:'#e8e0d0', fontSize:14, outline:'none', boxSizing:'border-box' },
    textarea:{ width:'100%', padding:'11px 14px', borderRadius:10, background:'#111',
               border:'1px solid #2a2218', color:'#e8e0d0', fontSize:14, outline:'none',
               boxSizing:'border-box', minHeight:100, resize:'vertical' },
    row:     { display:'flex', gap:8, marginTop:16 },
    btnGold: { flex:2, padding:'13px 0', borderRadius:12, border:'none', background:'#c9a84c',
               color:'#1a1410', fontWeight:700, fontSize:14, cursor:'pointer' },
    btnGray: { flex:1, padding:'13px 0', borderRadius:12, border:'1px solid #333',
               background:'transparent', color:'#888', fontSize:14, cursor:'pointer' },
  }

  // 步驟指示器
  const StepBar = () => (
    <div style={{ display:'flex', alignItems:'center', marginBottom:20 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', flex:1 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
            <div style={{
              width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700,
              background: step > i+1 ? '#5a9' : step === i+1 ? '#c9a84c' : '#2a2218',
              color:       step > i+1 ? '#fff'  : step === i+1 ? '#1a1410' : '#555',
            }}>{step > i+1 ? '✓' : i+1}</div>
            <div style={{ fontSize:10, color: step===i+1?'#c9a84c':'#444', marginTop:4, textAlign:'center' }}>{s}</div>
          </div>
          {i < STEPS.length-1 && (
            <div style={{ width:20, height:1, background: step>i+1?'#5a9':'#2a2218', marginBottom:16 }}/>
          )}
        </div>
      ))}
    </div>
  )

  const TIER_OPTIONS = [
    { v:'all',      l:'全部會員' },
    { v:'非會員',   l:'非會員' },
    { v:'紳士俱樂部',l:'紳士俱樂部' },
    { v:'進階會員', l:'進階會員' },
    { v:'尊榮會員', l:'尊榮會員' },
  ]

  const CHANNEL_OPTS = [
    { v:'sms',   l:'📱 簡訊',    d:'70字以內省費用，即時送達' },
    { v:'email', l:'📧 Email',   d:'支援HTML格式，適合圖文並茂' },
    { v:'both',  l:'📱+📧 兩者', d:'最高觸及率，同時發送' },
  ]

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ color:'#c9a84c', fontSize:16, fontWeight:700 }}>📣 建立行銷活動</div>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:20 }}>✕</button>
          </div>
          <StepBar />
        </div>

        <div style={S.body}>

          {/* Step 1: 目標客群 */}
          {step === 1 && (
            <div>
              <label style={S.label}>活動名稱 *</label>
              <input value={form.title} onChange={e=>set('title',e.target.value)}
                placeholder="如：5月新品到貨通知" style={S.input}/>

              <label style={S.label} style={{marginTop:14,display:'block',color:'#aaa',fontSize:12}}>目標客群</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {TIER_OPTIONS.map(o=>(
                  <button key={o.v} onClick={()=>set('target_tier',o.v)} style={{
                    padding:'10px 14px', borderRadius:10, border:'none', cursor:'pointer', textAlign:'left',
                    background: form.target_tier===o.v ? 'rgba(201,168,76,.15)' : '#111',
                    borderWidth:1, borderStyle:'solid',
                    borderColor: form.target_tier===o.v ? '#c9a84c' : '#2a2218',
                    color: form.target_tier===o.v ? '#c9a84c' : '#888', fontSize:13,
                  }}>{o.l}</button>
                ))}
              </div>

              <label style={{marginTop:14,display:'block',color:'#aaa',fontSize:12}}>發送管道</label>
              {CHANNEL_OPTS.map(o=>(
                <button key={o.v} onClick={()=>set('type',o.v)} style={{
                  width:'100%', padding:'12px 14px', borderRadius:10, border:'none', cursor:'pointer',
                  marginBottom:6, textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center',
                  background: form.type===o.v ? 'rgba(201,168,76,.1)' : '#111',
                  borderWidth:1, borderStyle:'solid',
                  borderColor: form.type===o.v ? '#c9a84c' : '#2a2218',
                }}>
                  <span style={{ color:form.type===o.v?'#c9a84c':'#e8e0d0', fontSize:13, fontWeight:form.type===o.v?700:400 }}>
                    {o.l}
                  </span>
                  <span style={{ color:'#555', fontSize:11 }}>{o.d}</span>
                </button>
              ))}

              <div style={S.row}>
                <button onClick={onClose} style={S.btnGray}>取消</button>
                <button onClick={()=>setStep(2)} disabled={!form.title} style={{...S.btnGold,opacity:form.title?1:0.5}}>
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: 訊息內容 */}
          {step === 2 && (
            <div>
              {/* 範本快選 */}
              <label style={{...S.label}}>快速套用範本</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
                {templates.map(t=>(
                  <button key={t.id}
                    onClick={()=>{ set('content',t.content); if(t.subject) set('subject',t.subject) }}
                    style={{ padding:'6px 12px', borderRadius:8, fontSize:11, cursor:'pointer',
                      border:'1px solid #2a2218', background:'#111', color:'#888' }}>
                    {t.name}
                  </button>
                ))}
              </div>

              {(form.type==='email'||form.type==='both') && (
                <>
                  <label style={S.label}>Email 主旨</label>
                  <input value={form.subject} onChange={e=>set('subject',e.target.value)}
                    placeholder="W Cigar Bar 會員專屬通知" style={{...S.input, marginBottom:12}}/>
                </>
              )}

              <label style={S.label}>
                訊息內容 *
                <span style={{ color:'#555', marginLeft:8, fontWeight:400 }}>
                  可用：{'{{name}}'} {'{{tier}}'} {'{{points}}'}
                </span>
              </label>
              <textarea value={form.content} onChange={e=>set('content',e.target.value)}
                placeholder="親愛的 {{name}}，..." style={S.textarea}/>

              <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                <div style={{ color:'#444', fontSize:11 }}>
                  {form.content.length} 字
                  {form.type!=='email' && form.content.length > 70 &&
                    <span style={{color:'#ffd700',marginLeft:8}}>⚠️ 超70字計2則費用</span>}
                </div>
                <div style={{ color:'#444', fontSize:11 }}>預計費用：
                  <span style={{color:'#c9a84c'}}>
                    NT${Math.ceil(form.content.length/70) * 0.15} / 封
                  </span>
                </div>
              </div>

              {/* 排程選項 */}
              <div style={{ marginTop:14, background:'#111', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom: form.is_scheduled?10:0 }}>
                  <input type="checkbox" id="sched" checked={form.is_scheduled}
                    onChange={e=>set('is_scheduled',e.target.checked)}
                    style={{accentColor:'#c9a84c'}}/>
                  <label htmlFor="sched" style={{color:'#888',fontSize:13,cursor:'pointer'}}>排程發送（指定時間）</label>
                </div>
                {form.is_scheduled && (
                  <input type="datetime-local" value={form.scheduled_at}
                    onChange={e=>set('scheduled_at',e.target.value)}
                    style={{...S.input, marginTop:4}}/>
                )}
              </div>

              <div style={S.row}>
                <button onClick={()=>setStep(1)} style={S.btnGray}>← 上一步</button>
                <button onClick={()=>setStep(3)} disabled={!form.content}
                  style={{...S.btnGold,opacity:form.content?1:0.5}}>預覽 →</button>
              </div>
            </div>
          )}

          {/* Step 3: 預覽確認 */}
          {step === 3 && (
            <div>
              <div style={{ background:'#111', borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                  <span style={{ color:'#aaa', fontSize:12 }}>預計發送對象</span>
                  <span style={{ color:'#c9a84c', fontSize:20, fontWeight:700 }}>{preview.count} 位</span>
                </div>
                {[
                  ['活動名稱', form.title],
                  ['發送管道', {sms:'📱 簡訊',email:'📧 Email',both:'📱+📧'}[form.type]],
                  ['目標客群', form.target_tier==='all'?'全部會員':form.target_tier],
                  ['發送方式', form.is_scheduled?`排程：${form.scheduled_at}`:'立即發送'],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ color:'#555', fontSize:12 }}>{k}</span>
                    <span style={{ color:'#e8e0d0', fontSize:12 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* 訊息預覽 */}
              <div style={{ background:'#0f0d0a', borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ color:'#555', fontSize:11, marginBottom:8 }}>訊息預覽</div>
                <div style={{ color:'#e8e0d0', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                  {form.content.replace('{{name}}', preview.sample[0]?.name || '王小明')}
                </div>
              </div>

              {/* 收件人預覽 */}
              {preview.sample.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ color:'#555', fontSize:11, marginBottom:8 }}>前5位收件人</div>
                  {preview.sample.map(c=>(
                    <div key={c.id} style={{ display:'flex', justifyContent:'space-between',
                      padding:'6px 0', borderBottom:'1px solid #1a1714' }}>
                      <span style={{ color:'#e8e0d0', fontSize:13 }}>{c.name}</span>
                      <span style={{ color:'#555', fontSize:12 }}>{c.phone}</span>
                    </div>
                  ))}
                  {preview.count > 5 && <div style={{color:'#333',fontSize:11,marginTop:4}}>…共{preview.count}位</div>}
                </div>
              )}

              <div style={{ background:'rgba(201,168,76,.05)', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
                <div style={{ color:'#6b5a3a', fontSize:11, lineHeight:1.7 }}>
                  💡 實際發送需在 Supabase 設定 Every8d（簡訊）和 Resend（Email）API 金鑰，
                  發送紀錄將保存於行銷後台。
                </div>
              </div>

              <div style={S.row}>
                <button onClick={()=>setStep(2)} style={S.btnGray}>← 修改</button>
                <button onClick={send} disabled={sending||!preview.count}
                  style={{...S.btnGold, opacity:(sending||!preview.count)?0.5:1}}>
                  {sending ? '建立中...' : form.is_scheduled ? '📅 建立排程' : `📤 立即發送`}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: 完成 */}
          {step === 4 && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
              <div style={{ color:'#c9a84c', fontSize:18, fontWeight:700, marginBottom:8 }}>
                行銷活動已建立！
              </div>
              <div style={{ color:'#888', fontSize:14, lineHeight:1.8, marginBottom:24 }}>
                {form.is_scheduled ? '已排程發送，屆時自動執行' : `已排隊發送給 ${preview.count} 位客戶`}
              </div>
              <button onClick={onClose} style={{...S.btnGold, width:'100%'}}>完成</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
