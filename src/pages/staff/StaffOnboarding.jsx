import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, UserCog, IdCard, PenLine, BookOpen, GraduationCap, Upload, ChevronRight } from 'lucide-react'

const GOLD = '#c9a84c'
const inputStyle = { width: '100%', padding: '11px 13px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'Noto Serif TC,serif' }
const labelStyle = { fontSize: 11, color: '#8a8278', marginBottom: 5, display: 'block' }

// ── 簽名板 ──
function SignaturePad({ onDone, busy }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  useEffect(() => {
    const c = ref.current; const ctx = c.getContext('2d')
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#f0e8d8'
    const pos = e => { const r = c.getBoundingClientRect(); const t = e.touches?.[0] || e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) } }
    const down = e => { e.preventDefault(); drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
    const move = e => { if (!drawing.current) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true }
    const up = () => { drawing.current = false }
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.current = false }
  const submit = () => {
    if (!dirty.current) { alert('請先簽名'); return }
    ref.current.toBlob(b => onDone(b), 'image/png')
  }
  return (
    <div>
      <canvas ref={ref} width={600} height={200} style={{ width: '100%', height: 150, background: '#0f0d0a', border: `1px dashed ${GOLD}55`, borderRadius: 10, touchAction: 'none', cursor: 'crosshair' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={clear} style={{ flex: 1, padding: 10, borderRadius: 8, background: 'transparent', border: '1px solid #2a2520', color: '#8a8278', fontSize: 13, cursor: 'pointer' }}>清除重簽</button>
        <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '簽署中…' : '確認簽署'}</button>
      </div>
    </div>
  )
}

export default function StaffOnboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ob, setOb] = useState(null)
  const [legal, setLegal] = useState([])
  const [open, setOpen] = useState(null)        // 展開中的步驟
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState(null)  // 簽署中的 doc_kind

  async function reload() {
    const { data } = await supabase.rpc('onboarding_get', { p_employee_id: user.employee_id })
    setOb(data)
    setForm(f => ({
      full_name: data.full_name || f.full_name || user.name || '',
      birth_date: data.birth_date || f.birth_date || '',
      id_number: '', phone: data.phone || f.phone || '', address: data.address || f.address || '',
      emergency_contact: data.emergency_contact || f.emergency_contact || '',
      bank_code: data.bank_code || f.bank_code || '', bank_account: '',
      start_date: data.start_date || f.start_date || '',
    }))
  }
  useEffect(() => {
    if (!user?.employee_id) return
    reload()
    supabase.from('staff_legal_docs').select('kind,title,version,body').then(({ data }) => setLegal(data || []))
  }, [user?.employee_id])

  if (!ob) return <div style={{ padding: 24 }}><div className="loading-shimmer" style={{ height: 120, borderRadius: 14 }} /></div>

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const uploaded = ob.uploaded_docs || []
  const signed = ob.signed_kinds || []
  const isPT = String(user?.employee_type || '').toUpperCase() === 'PT'
  const signKinds = isPT ? ['privacy_consent', 'part_time_addendum'] : ['privacy_consent', 'employment_contract']

  async function saveProfile() {
    setBusy(true)
    const { error } = await supabase.rpc('onboarding_save_profile', {
      p_employee_id: user.employee_id, p_full_name: form.full_name, p_birth_date: form.birth_date || null,
      p_id_number: form.id_number, p_phone: form.phone, p_address: form.address,
      p_emergency_contact: form.emergency_contact, p_bank_code: form.bank_code,
      p_bank_account: form.bank_account, p_start_date: form.start_date || null,
    })
    setBusy(false)
    if (error) return alert('儲存失敗：' + error.message)
    await reload(); setOpen(null)
  }

  async function uploadDoc(docType, file) {
    if (!file) return
    setBusy(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${user.employee_id}/${docType}_${Date.now()}.${ext}`
    const up = await supabase.storage.from('staff-docs').upload(path, file, { contentType: file.type })
    if (up.error) { setBusy(false); return alert('上傳失敗：' + up.error.message) }
    const { error } = await supabase.rpc('onboarding_add_document', { p_employee_id: user.employee_id, p_doc_type: docType, p_storage_path: path })
    setBusy(false)
    if (error) return alert('登錄失敗：' + error.message)
    await reload()
  }

  async function doSign(docKind, blob) {
    setBusy(true)
    const path = `${user.employee_id}/sig_${docKind}_${Date.now()}.png`
    const up = await supabase.storage.from('staff-docs').upload(path, blob, { contentType: 'image/png' })
    if (up.error) { setBusy(false); return alert('簽名上傳失敗：' + up.error.message) }
    const { error } = await supabase.rpc('onboarding_sign', { p_employee_id: user.employee_id, p_doc_kind: docKind, p_signature_path: path, p_ip: null, p_user_agent: navigator.userAgent.slice(0, 200) })
    setBusy(false); setSigning(null)
    if (error) return alert('簽署失敗：' + error.message)
    await reload()
  }

  async function submit() {
    setBusy(true)
    const { data, error } = await supabase.rpc('onboarding_submit', { p_employee_id: user.employee_id })
    setBusy(false)
    if (error) return alert('送出失敗：' + error.message)
    if (!data.ok) return alert('還有項目未完成，請全部完成後再送出')
    await reload(); alert('入職資料已送出！主管審核後即可正式上班。')
  }

  const steps = [
    { key: 'profile_done', icon: UserCog, label: '個人資料建檔', done: ob.profile_done },
    { key: 'docs_done', icon: IdCard, label: '證件上傳（身分證正反面・存摺）', done: ob.docs_done },
    { key: 'sign_done', icon: PenLine, label: `電子簽署（保密個資・${isPT ? '兼職聘用契約' : '正職聘用契約'}）`, done: ob.sign_done },
    { key: 'handbook_done', icon: BookOpen, label: `規章研讀確認（${ob.handbook_acked}/${ob.handbook_total}）`, done: ob.handbook_done, nav: '/handbook' },
    { key: 'training_done', icon: GraduationCap, label: '教育訓練與考核', done: ob.training_done, nav: '/training' },
  ]
  const doneCount = steps.filter(s => s.done).length
  const allDone = doneCount === steps.length
  const submitted = ob.status !== 'in_progress'

  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '36px 0 16px' }}>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>新人入職流程</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 3, marginTop: 4 }}>STAFF ONBOARDING</div>
      </div>

      {/* 總進度 */}
      <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: allDone ? 'rgba(100,170,100,.07)' : 'rgba(201,168,76,.05)', border: `1px solid ${allDone ? 'rgba(100,170,100,.25)' : 'rgba(201,168,76,.18)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 14, color: '#f0e8d8' }}>{submitted ? '✅ 已送出，待主管審核' : allDone ? '全部完成，可送出' : '完成所有步驟才能正式上班'}</span>
          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: GOLD }}>{doneCount}/{steps.length}</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${doneCount / steps.length * 100}%`, background: allDone ? '#7faa7f' : GOLD, transition: 'width .5s' }} />
        </div>
      </div>

      {/* 步驟卡 */}
      {steps.map(s => {
        const Icon = s.icon
        const isOpen = open === s.key
        return (
          <div key={s.key} style={{ marginBottom: 10, borderRadius: 13, background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: `1px solid ${s.done ? 'rgba(100,170,100,.22)' : 'rgba(214,140,70,.3)'}` }}>
            <div onClick={() => { if (s.nav) return navigate(s.nav); setOpen(isOpen ? null : s.key) }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, cursor: 'pointer' }}>
              {s.done ? <CheckCircle2 size={20} color="#7faa7f" /> : <Circle size={20} color="#d68c46" />}
              <Icon size={17} color={GOLD} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: 'Noto Serif TC,serif', fontSize: 14, color: '#e8e0d0' }}>{s.label}</span>
              {s.done ? <span style={{ fontSize: 11, color: '#7faa7f' }}>完成</span> : <ChevronRight size={16} color="#5a554e" />}
            </div>

            {/* 步驟內容 */}
            {isOpen && !submitted && s.key === 'profile_done' && (
              <div style={{ padding: '0 16px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1 / 3' }}><label style={labelStyle}>姓名 *</label><input style={inputStyle} value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
                  <div><label style={labelStyle}>出生年月日</label><input type="date" style={inputStyle} value={form.birth_date} onChange={e => set('birth_date', e.target.value)} /></div>
                  <div><label style={labelStyle}>到職日</label><input type="date" style={inputStyle} value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
                  <div style={{ gridColumn: '1 / 3' }}><label style={labelStyle}>身分證字號 * {ob.id_number_masked && <span style={{ color: '#7faa7f' }}>（已存 {ob.id_number_masked}，留空不改）</span>}</label><input style={inputStyle} value={form.id_number} onChange={e => set('id_number', e.target.value)} placeholder={ob.id_number_masked || 'A123456789'} /></div>
                  <div style={{ gridColumn: '1 / 3' }}><label style={labelStyle}>聯絡電話 *</label><input style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
                  <div style={{ gridColumn: '1 / 3' }}><label style={labelStyle}>地址</label><input style={inputStyle} value={form.address} onChange={e => set('address', e.target.value)} /></div>
                  <div style={{ gridColumn: '1 / 3' }}><label style={labelStyle}>緊急聯絡人姓名及電話 *</label><input style={inputStyle} value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} /></div>
                  <div><label style={labelStyle}>銀行代碼</label><input style={inputStyle} value={form.bank_code} onChange={e => set('bank_code', e.target.value)} placeholder="007（第一銀行）" /></div>
                  <div><label style={labelStyle}>匯款帳號 * {ob.bank_account_masked && <span style={{ color: '#7faa7f' }}>（已存）</span>}</label><input style={inputStyle} value={form.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder={ob.bank_account_masked || ''} /></div>
                  <div style={{ gridColumn: '1 / 3', fontSize: 11, color: 'rgba(196,163,90,.7)', lineHeight: 1.6, background: 'rgba(201,168,76,.05)', border: '1px solid rgba(201,168,76,.15)', borderRadius: 8, padding: '8px 10px' }}>💡 建議使用<b style={{ color: GOLD }}>第一銀行（代碼 007）</b>，公司轉帳免手續費；其他銀行跨行匯款會被收 15 元手續費。</div>
                </div>
                <button onClick={saveProfile} disabled={busy} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '儲存中…' : '儲存建檔資料'}</button>
              </div>
            )}

            {isOpen && !submitted && s.key === 'docs_done' && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['id_front', '身分證正面'], ['id_back', '身分證反面'], ['bankbook', '存摺封面']].map(([t, label]) => {
                  const has = uploaded.includes(t)
                  return (
                    <div key={t} style={{ padding: '11px 13px', borderRadius: 9, background: 'rgba(201,168,76,.05)', border: `1px solid ${has ? 'rgba(100,170,100,.3)' : 'rgba(201,168,76,.18)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: '#e8e0d0' }}><Upload size={14} color={GOLD} style={{ verticalAlign: -2, marginRight: 7 }} />{label}</span>
                        {has && <span style={{ fontSize: 11, color: '#7faa7f' }}>✓ 已上傳</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label style={{ flex: 1, textAlign: 'center', padding: '9px', borderRadius: 8, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.25)', color: GOLD, fontSize: 12.5, cursor: 'pointer' }}>
                          📷 拍照<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadDoc(t, e.target.files[0])} />
                        </label>
                        <label style={{ flex: 1, textAlign: 'center', padding: '9px', borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid #2a2520', color: '#cdc4b2', fontSize: 12.5, cursor: 'pointer' }}>
                          🖼 從相簿選<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadDoc(t, e.target.files[0])} />
                        </label>
                      </div>
                    </div>
                  )
                })}
                <div style={{ fontSize: 11, color: '#6a655c', lineHeight: 1.6 }}>🔒 證件存入私密保險庫，僅本人與 HR 主管可查，永不公開外流。</div>
              </div>
            )}

            {isOpen && !submitted && s.key === 'sign_done' && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {signKinds.map(k => legal.find(d => d.kind === k)).filter(Boolean).map(d => {
                  const isSigned = signed.includes(d.kind)
                  return (
                  <div key={d.kind} style={{ borderRadius: 9, border: `1px solid ${isSigned ? 'rgba(100,170,100,.3)' : '#2a2520'}`, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 12px', background: 'rgba(201,168,76,.05)', fontSize: 13, fontWeight: 500, color: '#f0e8d8', display: 'flex', justifyContent: 'space-between' }}>{d.title}{isSigned && <span style={{ fontSize: 11, color: '#7faa7f' }}>✓ 已簽署</span>}</div>
                    <div style={{ maxHeight: 160, overflowY: 'auto', padding: 12, fontSize: 11.5, color: '#a89f90', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{d.body}</div>
                    <div style={{ padding: 12 }}>
                      {isSigned
                        ? <div style={{ textAlign: 'center', fontSize: 12, color: '#7faa7f' }}>已親簽同意，存證完成</div>
                        : signing === d.kind
                        ? <SignaturePad busy={busy} onDone={blob => doSign(d.kind, blob)} />
                        : <button onClick={() => setSigning(d.kind)} style={{ width: '100%', padding: 11, borderRadius: 8, border: `1px solid ${GOLD}`, background: 'rgba(201,168,76,.08)', color: GOLD, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✍ 我已閱讀並親簽同意</button>}
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        )
      })}

      {!submitted && (
        <button onClick={submit} disabled={!allDone || busy}
          style={{ width: '100%', marginTop: 8, padding: 15, borderRadius: 11, border: 'none', fontSize: 15, fontWeight: 700, letterSpacing: 2, cursor: allDone ? 'pointer' : 'not-allowed',
            background: allDone ? `linear-gradient(135deg,${GOLD},#a8863a)` : '#2a2520', color: allDone ? '#0f0d0a' : '#5a554e' }}>
          {allDone ? '送出入職資料' : `還有 ${steps.length - doneCount} 步未完成`}
        </button>
      )}
    </div>
  )
}
