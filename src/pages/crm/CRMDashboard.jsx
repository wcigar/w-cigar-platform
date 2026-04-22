import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

const TIER_COLOR = { 'éæå¡':'#555', 'ç´³å£«ä¿±æ¨é¨':'#c9a84c', 'é²éæå¡':'#a0c4ff', 'å°æ¦®æå¡':'#ffd700' }
const TIER_BG    = { 'éæå¡':'#1a1714','ç´³å£«ä¿±æ¨é¨':'rgba(201,168,76,.1)','é²éæå¡':'rgba(160,196,255,.1)','å°æ¦­æå¡':'rgba(255,215,0,.1)' }

export default function CRMDashboard({ navigate }) {
  const [stats,     setStats]     = useState(null)
  const [customers, setCustomers] = useState([])
  const [tasks,     setTasks]     = useState([])
  const [tab,       setTab]       = useState('overview')
  const [filter,    setFilter]    = useState({ tier:'all', search:'', inactive:null })
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(0)
  const [total,     setTotal]     = useState(0)

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => { if (tab === 'customers') loadCustomers() }, [tab, filter, page])
  useEffect(() => { if (tab === 'tasks') loadTasks() }, [tab])

  async function loadDashboard() {
    const { data } = await supabase.rpc('crm_get_dashboard', { p_store_id: STORE_ID })
    setStats(data)
    setLoading(false)
  }

  async function loadCustomers() {
    setLoading(true)
    const { data } = await supabase.rpc('crm_get_customers', {
      p_store_id:     STORE_ID,
      p_tier:         filter.tier,
      p_search:       filter.search || null,
      p_inactive_days:filter.inactive,
      p_limit:        20,
      p_offset:       page * 20,
    })
    if (data?.success) {
      setCustomers(data.customers || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }

  async function loadTasks() {
    const { data } = await supabase.from('crm_tasks')
      .select('*').eq('store_id', STORE_ID).eq('status', 'pending')
      .order('due_date').limit(30)
    setTasks(data || [])
  }

  async function runWinback(days) {
    if (!confirm(`å·è¡ ${days} å¤©ååæ´»åï¼`)) return
    const { data } = await supabase.rpc('crm_run_winback', { p_store_id: STORE_ID, p_days: days })
    alert(`â å·²å»ºç« ${data?.processed || 0} åååä»»å`)
    loadDashboard()
  }

  async function doneTask(id) {
    await supabase.from('crm_tasks').update({ status:'done', done_at: new Date().toISOString() }).eq('id', id)
    loadTasks()
  }

  const S = {
    page:  { padding:20, background:'#0f0d0a', minHeight:'100vh', color:'#e8e0d0', fontFamily:'sans-serif' },
    header:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
    title: { color:'#c9a84c', fontSize:20, fontWeight:700 },
    tabs:  { display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' },
    tab:   (a) => ({ padding:'8px 16px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13,
                     background:a?'#c9a84c':'#1a1714', color:a?'#1a1410':'#888', fontWeight:a?700:400 }),
    grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 },
    grid4: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 },
    card:  { background:'#1a1714', border:'1px solid #2a2218', borderRadius:12, padding:16 },
    metric:{ background:'#1a1714', border:'1px solid #2a2218', borderRadius:12, padding:16, textAlign:'center' },
    mval:  { color:'#c9a84c', fontSize:22, fontWeight:700, marginBottom:4 },
    mlbl:  { color:'#555', fontSize:11 },
    btn:   (c='#c9a84c') => ({ padding:'9px 18px', borderRadius:10, border:'none', background:c,
                               color:c==='#c9a84c'?'#1a1410':'#e8e0d0', fontSize:13, fontWeight:700, cursor:'pointer' }),
    input: { padding:'10px 14px', borderRadius:10, background:'#111', border:'1px solid #2a2218',
             color:'#e8e0d0', fontSize:13, outline:'none' },
    ccard: { background:'#1a1714', border:'1px solid #2a2218', borderRadius:10, padding:14, marginBottom:8,
             cursor:'pointer', transition:'border-color .15s' },
  }

  const fmt = n => Number(n||0).toLocaleString()

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.title}>ð CRM å®¢æ¶ç®¡çä¸­å¿</div>
        <button onClick={() => navigate?.('/marketing')} style={S.btn()}>ð£ è¡é·ç¼é</button>
      </div>

      <div style={S.tabs}>
        {[['overview','ð ç¸½è¦½'],['customers','ð¥ å®¢æ¶'],['tasks','â è·é²ä»»å'],['automation','â¡ èªåå']].map(([k,l])=>(
          <button key={k} style={S.tab(tab===k)} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ââ ç¸½è¦½ ââ */}
      {tab === 'overview' && stats && (
        <div>
          {/* æ ¸å¿ææ¨ */}
          <div style={S.grid4}>
            {[
              { val: fmt(stats.total_members),       lbl:'ç¸½æå¡æ¸' },
              { val: fmt(stats.new_this_month),       lbl:'æ¬ææ°å¢' },
              { val: fmt(stats.active_30d),           lbl:'30å¤©æ´»èº' },
              { val: fmt(stats.birthday_this_month),  lbl:'æ¬æå£½æ' },
            ].map(m=>(
              <div key={m.lbl} style={S.metric}>
                <div style={S.mval}>{m.val}</div>
                <div style={S.mlbl}>{m.lbl}</div>
              </div>
            ))}
          </div>

          {/* ç­ç´åå¸ */}
          <div style={S.grid2}>
            <div style={S.card}>
              <div style={{ color:'#aaa', fontSize:12, marginBottom:14 }}>æå¡ç­ç´åå¸</div>
              {Object.entries(stats.tier_count||{}).map(([tier,cnt])=>(
                <div key={tier} style={{ display:'flex', justifyContent:'space-between', marginBottom:8, alignItems:'center' }}>
                  <span style={{ color:TIER_COLOR[tier]||'#888', fontSize:13 }}>
                    {{'éæå¡':'ð¤','ç´³å£«ä¿±æ¨é¨':'ð¥','é²éæå¡':'â­','å°æ¦®æå¡':'ð'}[tier]} {tier}
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:80, height:6, background:'#111', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${Math.min((cnt/stats.total_members)*100,100)}%`, height:'100%',
                        background:TIER_COLOR[tier]||'#888', borderRadius:3 }}/>
                    </div>
                    <span style={{ color:'#e8e0d0', fontSize:13, minWidth:28, textAlign:'right' }}>{fmt(cnt)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <div style={{ color:'#aaa', fontSize:12, marginBottom:14 }}>è¡é·è¦èç</div>
              {[
                { lbl:'å¯ç¼ç°¡è¨',  val:stats.has_phone, icon:'ð±' },
                { lbl:'å¯ç¼Email', val:stats.has_email, icon:'ð§' },
                { lbl:'å·²åæè¡é·',val:stats.marketing_consent, icon:'â' },
                { lbl:'ç´¯è¨çºé»æ¸',val:fmt(stats.total_points_issued)+'é»', icon:'ð°' },
              ].map(r=>(
                <div key={r.lbl} style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ color:'#666', fontSize:12 }}>{r.icon} {r.lbl}</span>
                  <span style={{ color:'#c9a84c', fontSize:13, fontWeight:700 }}>
                    {typeof r.val === 'number' ? fmt(r.val) : r.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* å¿«éåä½ */}
          <div style={S.card}>
            <div style={{ color:'#aaa', fontSize:12, marginBottom:14 }}>â¡ å¿«éå·è¡</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button onClick={()=>runWinback(90)}  style={S.btn('#2a2218')}>ð´ 90å¤©åå ({fmt(stats.inactive_90d)}äºº)</button>
              <button onClick={()=>supabase.rpc('generate_birthday_notifications',{p_store_id:STORE_ID}).then(({data})=>alert(`â å·²æç¨ ${data?.sms_queued||0} å°çæ¥ç°¡è¨`))}
                style={S.btn('#2a2218')}>ð ä»æ¥çæ¥æç¨</button>
              <button onClick={()=>supabase.rpc('crm_calculate_rfm',{p_store_id:STORE_ID}).then(({data})=>alert(`â RFM å·²æ´æ° ${data?.updated||0} ä½å®¢æ¶`))}
                style={S.btn('#2a2218')}>ð æ´æ° RFM åæ</button>
              <button onClick={()=>setTab('customers')} style={S.btn()}>ð¥ æ¥çå®¢æ¶åè¡¨</button>
            </div>
          </div>
        </div>
      )}

      {/* ââ å®¢æ¶åè¡¨ ââ */}
      {tab === 'customers' && (
        <div>
          {/* ç¯©é¸å */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            <input value={filter.search}
              onChange={e=>{ setFilter(p=>({...p,search:e.target.value})); setPage(0) }}
              placeholder="ð æå°å§å/ææ©"
              style={{...S.input, flex:1, minWidth:180}}/>
            <select value={filter.tier}
              onChange={e=>{ setFilter(p=>({...p,tier:e.target.value})); setPage(0) }}
              style={{...S.input}}>
              {['all','éæå¡','ç´³å£«ä¿±æ¨é¨','é²éæå¡','å°æ¦®æå¡'].map(t=>(
                <option key={t} value={t}>{t==='all'?'å¨é¨ç­ç´':t}</option>
              ))}
            </select>
            <select value={filter.inactive||''}
              onChange={e=>{ setFilter(p=>({...p,inactive:e.target.value?Number(e.target.value):null})); setPage(0) }}
              style={S.input}>
              <option value="">æææ´»èºåº¦</option>
              <option value="30">30å¤©æªä¾è¨ª</option>
              <option value="90">90å¤©æªä¾è¨ª</option>
              <option value="180">180å¤©æªä¾è¨ª</option>
            </select>
          </div>

          <div style={{ color:'#555', fontSize:12, marginBottom:12 }}>å± {fmt(total)} ä½å®¢æ¶</div>

          {loading ? <div style={{textAlign:'center',color:'#555',padding:40}}>è¼å¥ä¸­...</div>
          : customers.map(c=>(
            <div key={c.id} style={S.ccard}
              onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(201,168,76,.4)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='#2a2218'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                    <span style={{ color:'#e8e0d0', fontSize:15, fontWeight:600 }}>{c.name}</span>
                    <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11,
                      background:TIER_BG[c.membership_tier]||'#1a1714',
                      color:TIER_COLOR[c.membership_tier]||'#555' }}>
                      {c.membership_tier||'éæå¡'}
                    </span>
                  </div>
                  <div style={{ color:'#555', fontSize:12, lineHeight:1.8 }}>
                    ð± {c.phone}
                    {c.email && <span style={{marginLeft:10}}>âï¸ {c.email}</span>}
                    {c.preferred_cigar && <span style={{marginLeft:10}}>ð¬ {c.preferred_cigar}</span>}
                  </div>
                </div>
                <div style={{ textAlign:'right', marginLeft:12 }}>
                  <div style={{ color:'#c9a84c', fontSize:15, fontWeight:700 }}>
                    NT${fmt(c.total_spent)}
                  </div>
                  <div style={{ color:'#555', fontSize:11 }}>{c.visit_count||0}æ¬¡æ¶è²»</div>
                  {c.days_since_visit && (
                    <div style={{ color: c.days_since_visit > 90 ? '#e06060' : '#555', fontSize:11 }}>
                      {c.days_since_visit}å¤©åå°è¨ª
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                {(c.segments||[]).map(s=>(
                  <span key={s} style={{ padding:'2px 8px', borderRadius:10, fontSize:10,
                    background:'rgba(201,168,76,.1)', color:'#c9a84c', border:'1px solid rgba(201,168,76,.2)' }}>
                    {s}
                  </span>
                ))}
                {c.total_points > 0 && (
                  <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10,
                    background:'rgba(90,180,100,.1)', color:'#5a9', border:'1px solid rgba(90,180,100,.2)' }}>
                    ð° {fmt(c.total_points)}é»
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* åé  */}
          {total > 20 && (
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:16 }}>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                style={{...S.btn('#1a1714'), opacity:page===0?0.4:1}}>â ä¸ä¸é </button>
              <span style={{ color:'#555', fontSize:13, padding:'9px 0' }}>
                ç¬¬ {page+1} / {Math.ceil(total/20)} é 
              </span>
              <button onClick={()=>setPage(p=>p+1)} disabled={(page+1)*20>=total}
                style={{...S.btn('#1a1714'), opacity:(page+1)*20>=total?0.4:1}}>ä¸ä¸é  â</button>
            </div>
          )}
        </div>
      )}

      {/* ââ è·é²ä»»å ââ */}
      {tab === 'tasks' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ color:'#555', fontSize:13 }}>å¾èç {tasks.length} ä»¶</div>
            <button onClick={()=>runWinback(90)} style={S.btn()}>+ å»ºç«ååä»»å</button>
          </div>
          {tasks.length === 0 ? (
            <div style={{ textAlign:'center', color:'#444', padding:40 }}>ç®åæ²æå¾èçä»»å ð</div>
          ) : tasks.map(t=>(
            <div key={t.id} style={{ ...S.card, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                  <span style={{ padding:'2px 8px', borderRadius:6, fontSize:10,
                    background:t.priority==='high'?'rgba(200,60,60,.15)':'rgba(201,168,76,.1)',
                    color:t.priority==='high'?'#e06060':'#c9a84c' }}>
                    {t.priority==='high'?'â ï¸ ç·æ¥':'ä¸è¬'}
                  </span>
                  <span style={{ color:'#e8e0d0', fontSize:14 }}>{t.customer_name}</span>
                </div>
                <div style={{ color:'#888', fontSize:13 }}>{t.title}</div>
                {t.due_date && (
                  <div style={{ color: new Date(t.due_date) < new Date() ? '#e06060' : '#555', fontSize:11, marginTop:2 }}>
                    æªæ­¢ï¼{t.due_date}
                  </div>
                )}
              </div>
              <button onClick={()=>doneTask(t.id)}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'rgba(90,180,100,.1)',
                         color:'#5a9', fontSize:13, cursor:'pointer' }}>
                â å®æ
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ââ èªåå ââ */}
      {tab === 'automation' && <AutomationPanel />}
    </div>
  )
}

function AutomationPanel() {
  const [automations, setAutomations] = useState([])
  const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

  useEffect(() => {
    supabase.from('crm_automations').select('*').eq('store_id', STORE_ID)
      .order('created_at').then(({ data }) => setAutomations(data || []))
  }, [])

  async function toggle(id, current) {
    await supabase.from('crm_automations').update({ is_active: !current }).eq('id', id)
    setAutomations(p => p.map(a => a.id === id ? { ...a, is_active: !current } : a))
  }

  const TRIGGER_LABELS = {
    birthday_month:'ð çæ¥æä»½', birthday_day:'ð çæ¥ç¶å¤©',
    new_member:'ð± æ°æå¡å å¥', tier_upgrade:'â­ åç­',
    no_visit_days:'ð´ ä¹æªä¾è¨ª', first_purchase:'ð¯ é¦æ¬¡æ¶è²»',
    points_milestone:'ð° é»æ¸éç¨', referral_milestone:'ð æ¨è¦éç¨',
  }

  return (
    <div>
      <div style={{ color:'#555', fontSize:13, marginBottom:16 }}>
        èªååè¦åéåå¾ï¼ç³»çµ±æ¯å¤©èªåå·è¡ä¸¦ç¼ééç¥
      </div>
      {automations.map(a => (
        <div key={a.id} style={{ background:'#1a1714', border:'1px solid #2a2218', borderRadius:12,
          padding:16, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ color:'#e8e0d0', fontSize:14, fontWeight:600, marginBottom:4 }}>{a.name}</div>
            <div style={{ color:'#555', fontSize:12 }}>
              {TRIGGER_LABELS[a.trigger_type]||a.trigger_type}
              {a.trigger_value && <span style={{marginLeft:6}}>ï¼{a.trigger_value}å¤©ï¼</span>}
              <span style={{ marginLeft:10 }}>
                {{sms:'ð±',email:'ð§',both:'ð±+ð§',task:'ð'}[a.channel]}
              </span>
              {a.run_count > 0 && <span style={{ marginLeft:10, color:'#444' }}>å·²å·è¡{a.run_count}æ¬¡</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:a.is_active?'#5a9':'#555' }}>
              {a.is_active?'éè¡ä¸­':'å·²æ«å'}
            </span>
            <div onClick={() => toggle(a.id, a.is_active)}
              style={{ width:40, height:22, borderRadius:11, cursor:'pointer', transition:'background .2s',
                background:a.is_active?'#c9a84c':'#2a2218', position:'relative' }}>
              <div style={{ width:18, height:18, background:'#fff', borderRadius:9,
                position:'absolute', top:2, transition:'left .2s',
                left:a.is_active?20:2 }}/>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
