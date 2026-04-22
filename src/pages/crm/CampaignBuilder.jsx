import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

export default function CampaignBuilder({ onClose, onSend }) {
  const [step,       setStep]       = useState(1) // 1:ç®æ¨ 2:å§å®¹ 3:é è¦½ 4:å®æ
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
    if (!form.title || !form.content) { alert('è«å¡«å¯«æ¨é¡åå§å®¹'); return }
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
      sent_count:  form.is_scheduled? 0 : preview.count,
      scheduled_at: form.is_scheduled ? form.scheduled_at : null,
      sent_at:  form.is_scheduled ? null : new Date().toISOString(),
      created_by: 'ADMIN',
    })
    setSending(false)
    if (error) { alert('å»ºçå¤±æï¼' + error.message); return }
    setStep(4)
    onSend?.()
  }

  const STEPS = ['ç®æ¨å®¢ç¾¤', 'è¨æ¯å§å®¹', 'é è¦½æ¢®èª', 'å®æ']

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

  // æ­¥é©æç¤ºå©
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
            }}>{step > i+1 ? 'â' : i+1}</div>
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
    { v:'all',      l:'å¨é¨æå¡' },
    { v:'å±¨æå¡',   l:'éæå¡' },
    { v:'ç´³å£«ä¿±æ¨é¨',l:'ç´³å£«ä¿±æ¨é¨' },
    { v:'é²éæå¡', l:'é²éæå¡' },
    { v:'å°çµæå¡', l:'å°çµæå¡' },
  ]

  const CHANNEL_OPTS = [
    { v:'sms',   l:'ð± ç°¡è¨',    d:'70å­ä»¥å§å¯çè³»ç¨ï¼å³æéé4' },
    { v:'email', l:'ð§ Email',   d:'æ¯æ´HTMLæ ¼å¼ï¼é©ååæä¸¦è' },
    { v:'both',  l:'ð±+ð§ å¨è¯', d:'æé«è§¸åçï¼åæç¼é' },
  ]

  return (
    <div style={S.overlayý onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ color:'#c9a84c', fontSize:16, fontWeight:700 }}>ð£ å»ºç«è¡é·æ´»å</div>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:20 }}>â</button>
          </div>
          <StepBar />
        </div>

        <div style={S.body}>

          {/* Step 1: ç®æ¨å®¢ç¾¤ */}
          {step === 1 && (
            <div>
              <label style={S.label}>æ´»ååç¨± *</label>
              <input value={form.title} onChange={e=>set('title',e.target.value)}
                placeholder="å¦ï¼5ææ°åå°è²¨éç¥" style={S.input}/>

              <label style={S.label} style={{marginTop:14,display:'block',color:'#aaa',fontSize:12}}>ç®æ¨æ¯ç¾¤</label>
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

              <label style={{marginTop:14,display:'block',color:'#aaa',fontSize:12}}>ç¼éç®¡é</label>
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
                <button onClick={onClose} style={S.btnGray}>åæ¶</button>
                <button onClick={()=>setStep(2)} disabled={!form.title} style={{...S.btnGold,opacity:form.title?1:0.5}}>
                  ä¸ä¸æ­¥ â
                </button>
              </div>
            </div>
          )}

          {/* Step 2: è¨æ¯å§å®¹ */}
          {step === 2 && (
            <div>
              {/* ç¯æ¬å¿«é¸ */}
              <label style={{...S.label}}>å¿«éå¥ç¨ç¯æ¬</label>
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
                  <label style={S.label}>Email ä¸»æ¨</label>
                  <input value={form.subject} onChange={e=>set('subject',e.target.value)}
                    placeholder="W Cigar Bar æå¡å°å±¬éç¥" style={{...S.input, marginBottom:12}}/>
                </>
              )}

              <label style={S.label}>
                è¨æ¯å§å®¹ *
                <span style={{ color:'#555', marginLeft:8, fontWeight:400 }}>
                  å¯ç¨ï¼{'{{name}}'} {'{{tier}}'} {'{{points}}'}
                </span>
              </label>
              <textarea value={form.content} onChange={e=>set('content',e.target.value)}
                placeholder="è¦ªæç {{name}}ï¼..." style={S.textarea}/>

              <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                <div style={{ color:'#444', fontSize:11 }}>
                  {form.content.length} å­
                  {form.type!=='email' && form.content.length > 70 &&
                    <span style={{color:'#ffd700',marginLeft:8}}>â ï¸ è¶70å­è¨2åè³»ç¨</span>}
                </div>
                <div style={{ color:'#444', fontSize:11 }}>é è¨è²»ç¨ï¼
                  <span style={{color:'#c9a84c'}}>
                    NT${Math.ceil(form.content.length/70) * 0.15} / å°
                  </span>
                </div>
              </div>

              {/* æç¨é¸é ¡ */}
              <div style={{ marginTop:14, background:'#111', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom: form.is_scheduled?10:0 }}>
                  <input type="checkbox" id="sched" checked={form.is_scheduled}
                    onChange={e=>set('is_scheduled',e.target.checked)}
                    style={{accentColor:'#c9a84c'}}/>
                  <label htmlFor="sched" style={{color:'#888',fontSize:13,cursor:'pointer'}}>æç¨ç¼éï¼æå®æéï¼</label>
                </div>
                {form.is_scheduled && (
                  <input type="datetime-local" value={form.scheduled_at}
                    onChange={e=>set('scheduled_at',e.target.value)}
                    style={{...S.input, marginTop:4}}/>
                )}
              </div>

              <div style={S.row}>
                <button onClick={()=>setStep(1)} style={S.btnGray}>â ä¸ä¸æ­¥</button>
                <button onClick={()=>setStep(3)} disabled={!form.content}
                  style={{...S.btnGold,opacity:form.content?1:0.5}}>é è¦½ â</button>
              </div>
            </div>
          )}

          {/* Step 3: é è¦½æ¢®èª */}
          {step === 3 && (
            <div>
              <div style={{ background:'#111', borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                  <span style={{ color:'#aaa', fontSize:12 }}>é è¨ç¼éå°è±¡</span>
                  <span style={{ color:'#c9a84c', fontSize:20, fontWeight:700 }}>{preview.count} ä½</span>
                </div>
                {[
                  ['æ´»ååç¨²', form.title],
                  ['ç¼éééZ', {sms:'ð± ç°¡è¨',email:'ð§ Email',both:'ð±+ð§'}[form.type]],
                  ['ç®æ¨å®¢ç¾¤', form.target_tier==='all'?'å¨é¨æå¡':form.target_tier],
                  ['ç¼éæ¹å¼', form.is_scheduled?`æç¨ï¼${form.scheduled_at}`:'ç«å³ç¼é'],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ color:'#555', fontSize:12 }}>{k}</span>
                    <span style={{ color:'#e8e0d0', fontSize:12 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* è¨æ¯é è¦½ */}
              <div style={{ background:'#0f0d0a', borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ color:'#555', fontSize:11, marginBottom:8 }}>è¨æ¯é è¦½</div>
                <div style={{ color:'#e8e0d0', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                  {form.content.replace('{{name}}', preview.sample[0]?.name || 'çå°æ')}
                </div>
              </div>

              {/* æ¶ä»¶äººé è¦½ */}
              {preview.sample.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ color:'#555', fontSize:11, marginBottom:8 }}>å5ä½æ¶ä»¶äºº</div>
                  {preview.sample.map(c=>(
                    <div key={c.id} style={{ display:'flex', justifyContent:'space-between',
                      padding:'6px 0', borderBottom:'1px solid #1a1714' }}>
                      <span style={{ color:'#e8e0d0', fontSize:13 }}>{c.name}</span>
                      <span style={{ color:'#555', fontSize:12 }}>{c.phone}</span>
                    </div>
                  ))}
                  {preview.count > 5 && <div style={{color:'#333',fontSize:11,marginTop:4}}>â¦e±{preview.count}ä½</div>}
                </div>
              )}

              <div style={{ background:'rgba(201,168,76,.05)', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
                <div style={{ color:'#6b5a3a', fontSize:11, lineHeight:1.7 }}>
                  ð¡ å¯¦éç¼ééå¨ Supabase è¨­å® Every8dï¼ç°¡è¨ï¼å Resendï¼Emailï¼API éé°ï¼
                  ç¼éç´éå°ä¿å­æ¼è¡é·å¾å°ã
                </div>
              </div>

              <div style={S.row}>
                <button onClick={()=>setStep(2)} style={S.btnGray}>â ä¿®æ¹</button>
                <button onClick={send} disabled={sending||!preview.count}
                  style={{...S.btnGold, opacity:(sending||!preview.count)?0.5:1}}>
                  {sending ? 'å»ºç«ä¸­...' : form.is_scheduled ? 'ð å»ºç«æç¨' : `ð¤ ç«å³ç¼é`}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: å®æ */}
          {step === 4 && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>â</div>
              <div style={{ color:'#c9a84c', fontSize:18, fontWeight:700, marginBottom:8 }}>
                è¡é·æ´»åå·²å»ºç«ï¼
              </div>
              <div style={{ color:'#888', fontSize:14, lineHeight:1.8, marginBottom:24 }}>
                {form.is_scheduled ? 'å·²æç¨ç¼éï¼å±æèªåå·è¡' : `å·²æéç¼éçµ¦ ${preview.count} ä½å®¢æ¶`}
              </div>
              <button onClick={onClose} style={{...S.btnGold, width:'100%'}}>å®æ</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
