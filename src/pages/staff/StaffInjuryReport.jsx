import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { AlertTriangle, Printer } from 'lucide-react'

const GOLD = '#c9a84c'
const inputStyle = { width: '100%', padding: '11px 13px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'Noto Serif TC,serif' }
const labelStyle = { fontSize: 12, color: '#8a8278', marginBottom: 6, display: 'block' }

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function printReport(d) {
  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) { alert('請允許彈出視窗以列印'); return }
  const row = (k, v) => `<tr><td style="width:130px;color:#555;padding:7px 0;vertical-align:top;">${esc(k)}</td><td style="padding:7px 0;">${esc(v) || '—'}</td></tr>`
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>員工職災事故通報單</title>
  <style>body{font-family:"Noto Serif TC","Microsoft JhengHei",serif;color:#1a1a1a;margin:0;padding:40px 48px;}@media print{body{padding:24px;}}</style></head><body>
  <div style="text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:18px;">
    <div style="font-size:14px;letter-spacing:2px;color:#555;">W CIGAR BAR · 勝茄股份有限公司</div>
    <div style="font-size:22px;font-weight:700;margin-top:6px;">員工職業災害事故通報單</div>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse;">
    ${row('員工姓名', d.employee_name)}${row('事故時間', d.incident_at)}${row('事故地點', d.location)}
    ${row('事故經過', d.description)}${row('受傷部位/傷勢', d.injury_part)}
    ${row('是否送醫', d.hospitalized ? '是' : '否')}${d.hospitalized ? row('送醫院所', d.hospital) : ''}
    ${row('在場證人', d.witness)}${row('通報主管', d.reported_to)}
  </table>
  <div style="margin-top:32px;display:flex;justify-content:space-between;font-size:13px;color:#555;">
    <div>通報人簽名：________________</div><div>主管簽名：________________</div>
  </div>
  <div style="margin-top:24px;font-size:11px;color:#888;line-height:1.7;">※ 本單依勞動基準法、職業安全衛生法辦理；請於事故發生後儘速通報，並配合送醫與工傷給付申請流程。</div>
  </body></html>`)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 350)
}

export default function StaffInjuryReport() {
  const { user } = useAuth()
  const [f, setF] = useState({ incident_at: '', location: '', description: '', injury_part: '', hospitalized: false, hospital: '', witness: '', reported_to: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit() {
    if (!f.description) return alert('請填寫事故經過')
    setBusy(true)
    const { data } = await supabase.rpc('injury_report_create', {
      p_employee_id: user.employee_id, p_employee_name: user.name,
      p_incident_at: f.incident_at ? new Date(f.incident_at).toISOString() : null,
      p_location: f.location, p_description: f.description, p_injury_part: f.injury_part,
      p_hospitalized: f.hospitalized, p_hospital: f.hospital, p_witness: f.witness, p_reported_to: f.reported_to,
    })
    setBusy(false)
    if (!data?.ok) return alert('送出失敗：' + (data?.error || ''))
    setDone(true)
    alert('職災通報已送出，主管/HR 將即時收到並協助後續送醫與工傷申請。')
  }

  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '36px 0 16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(214,140,70,.12)', border: '1px solid rgba(214,140,70,.3)', marginBottom: 12 }}><AlertTriangle size={20} color="#d68c46" /></div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>員工職災事故通報單</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 3, marginTop: 4 }}>INJURY REPORT</div>
      </div>

      <div style={{ background: 'rgba(214,140,70,.06)', border: '1px solid rgba(214,140,70,.25)', borderRadius: 10, padding: '10px 13px', marginBottom: 16, fontSize: 11.5, color: 'rgba(214,140,70,.85)', lineHeight: 1.7 }}>⚠️ 發生職業災害或緊急送醫時請儘速填寫通報。緊急狀況請先確保人身安全、撥打 119，再回報。</div>

      <div style={{ marginBottom: 12 }}><label style={labelStyle}>事故時間</label><input type="datetime-local" style={inputStyle} value={f.incident_at} onChange={e => set('incident_at', e.target.value)} /></div>
      <div style={{ marginBottom: 12 }}><label style={labelStyle}>事故地點</label><input style={inputStyle} value={f.location} onChange={e => set('location', e.target.value)} /></div>
      <div style={{ marginBottom: 12 }}><label style={labelStyle}>事故經過 *</label><textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={f.description} onChange={e => set('description', e.target.value)} /></div>
      <div style={{ marginBottom: 12 }}><label style={labelStyle}>受傷部位／傷勢</label><input style={inputStyle} value={f.injury_part} onChange={e => set('injury_part', e.target.value)} /></div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>是否送醫</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[[false, '未送醫'], [true, '已送醫']].map(([v, t]) => (
            <button key={t} onClick={() => set('hospitalized', v)} style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'Noto Serif TC,serif', background: f.hospitalized === v ? 'rgba(201,168,76,.14)' : 'rgba(255,255,255,.02)', border: `1px solid ${f.hospitalized === v ? GOLD : '#2a2520'}`, color: f.hospitalized === v ? GOLD : '#cdc4b2' }}>{t}</button>
          ))}
        </div>
      </div>
      {f.hospitalized && <div style={{ marginBottom: 12 }}><label style={labelStyle}>送醫院所</label><input style={inputStyle} value={f.hospital} onChange={e => set('hospital', e.target.value)} /></div>}
      <div style={{ marginBottom: 12 }}><label style={labelStyle}>在場證人</label><input style={inputStyle} value={f.witness} onChange={e => set('witness', e.target.value)} /></div>
      <div style={{ marginBottom: 16 }}><label style={labelStyle}>通報主管</label><input style={inputStyle} value={f.reported_to} onChange={e => set('reported_to', e.target.value)} /></div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 14, borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '送出中…' : done ? '已通報 · 再送一筆' : '送出通報'}</button>
        <button onClick={() => printReport({ ...f, employee_name: user.name })} style={{ flex: 1, padding: 14, borderRadius: 11, border: '1px solid #2a2520', background: 'transparent', color: '#a89f90', fontSize: 14, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif' }}><Printer size={14} style={{ verticalAlign: -2, marginRight: 4 }} />列印</button>
      </div>
      {done && <div style={{ fontSize: 12, color: '#7faa7f', textAlign: 'center', padding: '12px 0' }}>✅ 已送出，HR 後台已收到此通報。</div>}
    </div>
  )
}
