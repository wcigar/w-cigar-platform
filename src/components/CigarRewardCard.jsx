import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

async function compressPhoto(file) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const scale = Math.min(1, 800 / img.width)
      c.width = img.width * scale; c.height = img.height * scale
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(blob => resolve(blob), 'image/jpeg', 0.7)
    }
    img.src = URL.createObjectURL(file)
  })
}

// ─── 員工：獎勵狀態卡 + 領取 Modal ───
export function StaffCigarReward({ user }) {
  const [reward, setReward] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 7)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('cigar_rewards').select('*').eq('employee_id', user.employee_id).eq('month', month).maybeSingle()
    if (!data) {
      await supabase.rpc('generate_monthly_cigar_rewards', { p_month: month }).catch(() => {})
      const { data: d2 } = await supabase.from('cigar_rewards').select('*').eq('employee_id', user.employee_id).eq('month', month).maybeSingle()
      setReward(d2 || null)
    } else {
      setReward(data)
    }
    setLoading(false)
  }

  async function loadHistory() {
    const { data } = await supabase.from('cigar_rewards').select('*').eq('employee_id', user.employee_id).order('month', { ascending: false }).limit(12)
    setHistory(data || [])
    setShowHistory(true)
  }

  if (loading || !reward) return null

  const statusConfig = {
    pending: { bg: 'rgba(201,168,76,.1)', border: 'rgba(201,168,76,.3)', color: '#c9a84c', icon: '🚬', text: '本月雪茄獎勵待領取', action: '點擊領取 →' },
    claimed: { bg: 'rgba(77,140,196,.1)', border: 'rgba(77,140,196,.3)', color: '#4d8ac4', icon: '📷', text: '已領取，等待老闆簽名確認', action: '' },
    signed:  { bg: 'rgba(77,168,108,.1)', border: 'rgba(77,168,108,.3)', color: '#4da86c', icon: '✅', text: '本月獎勵已完成', action: '' },
  }
  const sc = statusConfig[reward.status] || statusConfig.pending

  return (
    <>
      <div className="card" style={{ marginBottom: 12, borderColor: sc.border, background: sc.bg, cursor: reward.status === 'pending' ? 'pointer' : 'default' }}
        onClick={() => reward.status === 'pending' && setShowModal(true)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{sc.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: sc.color }}>{sc.text}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>非古巴 ×{reward.non_cuban_count} + 古巴 ×{reward.cuban_count}</div>
            </div>
          </div>
          {sc.action && <span style={{ fontSize: 11, color: sc.color, fontWeight: 600 }}>{sc.action}</span>}
        </div>
        {reward.status === 'signed' && reward.boss_signature && (
          <img src={reward.boss_signature} alt="簽名" style={{ height: 40, marginTop: 8, borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }} />
        )}
      </div>

      <div style={{ textAlign: 'right', marginBottom: 12 }}>
        <button onClick={loadHistory} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>歷史領取紀錄</button>
      </div>

      {showModal && <ClaimModal reward={reward} user={user} month={month} onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load() }} />}

      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowHistory(false)}>
          <div style={{ background: '#1a1714', border: '1px solid var(--border-gold)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>🚬 歷史領取紀錄</div>
            {history.length === 0 ? <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>尚無紀錄</div> :
              history.map(r => (
                <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{r.month}</span>
                    <span style={{ color: r.status === 'signed' ? 'var(--green)' : r.status === 'claimed' ? 'var(--blue)' : 'var(--gold)', fontWeight: 600 }}>
                      {r.status === 'signed' ? '✅ 已簽' : r.status === 'claimed' ? '⏳ 待簽' : '⏳ 待領'}
                    </span>
                  </div>
                  {r.photo_urls && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {r.photo_urls.split('|').filter(Boolean).map((url, i) => (
                        <img key={i} src={url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} onClick={() => window.open(url)} />
                      ))}
                    </div>
                  )}
                  {r.boss_signature && <img src={r.boss_signature} alt="簽名" style={{ height: 30, marginTop: 4, borderRadius: 4, background: '#fff' }} />}
                </div>
              ))}
            <button onClick={() => setShowHistory(false)} style={{ width: '100%', marginTop: 12, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>關閉</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── 領取 Modal ───
function ClaimModal({ reward, user, month, onClose, onDone }) {
  const [nc, setNc] = useState(['', '', '', '', ''])
  const [cu, setCu] = useState([''])
  const [photos, setPhotos] = useState([])
  const [previews, setPreviews] = useState([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef(null)

  async function addPhoto(file) {
    if (!file || photos.length >= 3) return
    const blob = await compressPhoto(file)
    setPhotos(prev => [...prev, blob])
    setPreviews(prev => [...prev, URL.createObjectURL(blob)])
  }

  async function submit() {
    if (photos.length === 0) { alert('請至少拍一張照片'); return }
    setSubmitting(true)
    const urls = []
    for (let i = 0; i < photos.length; i++) {
      const path = `cigar-rewards/${user.employee_id}/${month}/${Date.now()}_${i}.jpg`
      const { error } = await supabase.storage.from('photos').upload(path, photos[i])
      if (!error) { const { data } = supabase.storage.from('photos').getPublicUrl(path); urls.push(data.publicUrl) }
    }
    const { data, error } = await supabase.rpc('claim_cigar_reward', {
      p_employee_id: user.employee_id,
      p_month: month,
      p_non_cuban_items: nc.filter(Boolean),
      p_cuban_items: cu.filter(Boolean),
      p_photo_urls: urls.join('|'),
      p_notes: notes || null,
    })
    setSubmitting(false)
    if (error || !data?.success) { alert(data?.error || error?.message || '領取失敗'); return }
    alert('領取成功！等待老闆簽名確認')
    onDone()
  }

  const is = { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }} onClick={onClose}>
      <div style={{ background: '#1a1714', border: '1px solid var(--border-gold)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 420, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>🚬 本月雪茄獎勵領取</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>非古巴 ×{reward.non_cuban_count} + 古巴 ×{reward.cuban_count}</div>

        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, marginBottom: 6 }}>非古巴雪茄品名（選填）</div>
        {nc.map((v, i) => <input key={i} value={v} onChange={e => { const a = [...nc]; a[i] = e.target.value; setNc(a) }} placeholder={`非古巴雪茄 ${i + 1}`} style={{ ...is, marginBottom: 6 }} />)}

        <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, marginBottom: 6, marginTop: 10 }}>古巴雪茄品名（選填）</div>
        {cu.map((v, i) => <input key={i} value={v} onChange={e => { const a = [...cu]; a[i] = e.target.value; setCu(a) }} placeholder={`古巴雪茄 ${i + 1}`} style={{ ...is, marginBottom: 6 }} />)}

        <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, marginBottom: 6, marginTop: 10 }}>拍照（必填，最多3張）</div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { addPhoto(e.target.files?.[0]); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={photos.length >= 3} style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px dashed var(--border-gold)', background: 'rgba(201,168,76,.06)', color: 'var(--gold)', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>
          📷 {photos.length > 0 ? `已拍 ${photos.length}/3 張，再拍一張` : '點擊拍照'}
        </button>
        {previews.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {previews.map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={src} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                <button onClick={() => { setPhotos(p => p.filter((_, j) => j !== i)); setPreviews(p => p.filter((_, j) => j !== i)) }} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, marginTop: 6 }}>備註（選填）</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="其他說明…" rows={2} style={{ ...is, resize: 'none', marginBottom: 12 }} />
        </div>

        <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }} className="safe-bottom">
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>取消</button>
          <button onClick={submit} disabled={submitting} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'var(--gold)', color: 'var(--black)', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: submitting ? 0.5 : 1, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {submitting ? '提交中…' : '✅ 確認領取'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 老闆：簽核區塊 ───
export function BossCigarRewardSection() {
  const [pending, setPending] = useState([])
  const [signed, setSigned] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [signing, setSigning] = useState(null)
  const [showSigned, setShowSigned] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [pR, sR] = await Promise.all([
      supabase.from('cigar_rewards').select('*').eq('status', 'claimed').order('claimed_at', { ascending: false }),
      supabase.from('cigar_rewards').select('*').eq('status', 'signed').order('signed_at', { ascending: false }).limit(10),
    ])
    setPending(pR.data || []); setSigned(sR.data || [])
    setLoading(false)
  }

  async function doSign(rewardId, sigBase64) {
    const { data, error } = await supabase.rpc('sign_cigar_reward', { p_reward_id: rewardId, p_signature: sigBase64, p_signed_by: '老闆' })
    if (error || !data?.success) { alert(data?.error || error?.message || '簽名失敗'); return }
    setSigning(null); load()
  }

  if (loading) return null
  if (pending.length === 0 && signed.length === 0) return null

  return (
    <div className="card" style={{ marginTop: 16, borderColor: 'rgba(201,168,76,.25)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🚬</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>雪茄獎勵簽核</span>
        {pending.length > 0 && <span style={{ fontSize: 11, background: 'rgba(196,77,77,.15)', color: 'var(--red)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{pending.length} 待簽</span>}
      </div>

      {pending.map(r => {
        const isExp = expanded === r.id
        const photoUrls = r.photo_urls ? r.photo_urls.split('|').filter(Boolean) : []
        return (
          <div key={r.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : r.id)}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.employee_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.month} · {r.claimed_at ? new Date(r.claimed_at).toLocaleDateString('zh-TW') : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {photoUrls.slice(0, 2).map((url, i) => <img key={i} src={url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />)}
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>
            </div>
            {isExp && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--black)', borderRadius: 10 }}>
                {photoUrls.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {photoUrls.map((url, i) => <img key={i} src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }} onClick={() => window.open(url)} />)}
                  </div>
                )}
                {r.non_cuban_items?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>非古巴：{r.non_cuban_items.join('、')}</div>}
                {r.cuban_items?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>古巴：{r.cuban_items.join('、')}</div>}
                {r.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>📝 {r.notes}</div>}
                <button onClick={() => setSigning(r.id)} style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', background: 'var(--gold)', color: 'var(--black)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>✍️ 簽名確認</button>
              </div>
            )}
            {signing === r.id && <SignaturePad onSave={(sig) => doSign(r.id, sig)} onCancel={() => setSigning(null)} />}
          </div>
        )
      })}

      {signed.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowSigned(!showSigned)} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>{showSigned ? '▲ 收合已簽核' : `▼ 已簽核 (${signed.length})`}</button>
          {showSigned && signed.map(r => (
            <div key={r.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>{r.employee_name} · {r.month}</span>
              <span style={{ color: 'var(--green)' }}>✅ {r.signed_at ? new Date(r.signed_at).toLocaleDateString('zh-TW') : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 簽名板 ───
function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    c.width = 300; c.height = 150
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 150)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.lineCap = 'round'
  }, [])

  function gp(e) { const r = canvasRef.current.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top } }
  function sd(e) { e.preventDefault(); setDrawing(true); setDrawn(true); const ctx = canvasRef.current.getContext('2d'), p = gp(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  function dm(e) { if (!drawing) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'), p = gp(e); ctx.lineTo(p.x, p.y); ctx.stroke() }
  function se() { setDrawing(false) }

  return (
    <div style={{ marginTop: 10, padding: 12, background: 'var(--black)', borderRadius: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, marginBottom: 6 }}>✍️ 老闆簽名</div>
      <div style={{ borderRadius: 8, overflow: 'hidden', border: '2px solid var(--border-gold)', marginBottom: 8, touchAction: 'none' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: 300, height: 150, cursor: 'crosshair' }}
          onMouseDown={sd} onMouseMove={dm} onMouseUp={se} onMouseLeave={se}
          onTouchStart={sd} onTouchMove={dm} onTouchEnd={se} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => { const c = canvasRef.current, ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 150); ctx.strokeStyle = '#333'; ctx.lineWidth = 3; setDrawn(false) }}
          style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>清除</button>
        <button onClick={onCancel} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>取消</button>
        <button onClick={() => { if (!drawn) { alert('請先簽名'); return } onSave(canvasRef.current.toDataURL('image/png')) }}
          style={{ flex: 1, padding: 8, borderRadius: 6, border: 'none', background: 'var(--gold)', color: 'var(--black)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>確認簽名</button>
      </div>
    </div>
  )
}

// ─── 薪資頁：簡要狀態 ───
export function CigarRewardPayrollStatus({ employeeId, month }) {
  const [reward, setReward] = useState(null)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    supabase.from('cigar_rewards').select('*').eq('employee_id', employeeId).eq('month', month).maybeSingle().then(({ data }) => setReward(data))
  }, [employeeId, month])

  if (!reward) return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}><span style={{ color: 'var(--text-dim)' }}>🚬 雪茄獎勵</span><span style={{ color: 'var(--red)' }}>❌ 無紀錄</span></div>

  const label = { pending: '❌ 未領取', claimed: '⏳ 待簽核', signed: '✅ 已領取' }
  const color = { pending: 'var(--red)', claimed: '#f59e0b', signed: 'var(--green)' }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, cursor: 'pointer' }} onClick={() => setShowDetail(!showDetail)}>
        <span style={{ color: 'var(--text-dim)' }}>🚬 雪茄獎勵</span>
        <span style={{ color: color[reward.status], fontWeight: 600 }}>{label[reward.status]}</span>
      </div>
      {showDetail && (
        <div style={{ padding: '6px 0 6px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
          {reward.non_cuban_items?.length > 0 && <div>非古巴：{reward.non_cuban_items.join('、')}</div>}
          {reward.cuban_items?.length > 0 && <div>古巴：{reward.cuban_items.join('、')}</div>}
          {reward.photo_urls && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {reward.photo_urls.split('|').filter(Boolean).map((url, i) => <img key={i} src={url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />)}
            </div>
          )}
          {reward.boss_signature && <img src={reward.boss_signature} alt="簽" style={{ height: 24, marginTop: 4, background: '#fff', borderRadius: 3 }} />}
        </div>
      )}
    </>
  )
}
