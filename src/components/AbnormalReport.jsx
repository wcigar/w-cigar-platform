import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { AlertTriangle, Send, X } from 'lucide-react'
import { format } from 'date-fns'

const VENDORS = [
  { icon: '🚪', name: '鐵捲門 鄭師傅', tel: '0921919256', display: '0921-919-256' },
  { icon: '🌐', name: '網路 王師傅', tel: '0980942828', display: '0980-942-828' },
  { icon: '⚡', name: '水電 陳大哥', tel: '0972095569', display: '0972-095-569' },
  { icon: '🥛', name: '鮮奶 張先生', tel: '0928195030', display: '0928-195-030' },
  { icon: '🛢️', name: '炸油 信昌', tel: '0227016519', display: '02-2701-6519' },
  { icon: '🧾', name: 'AC PAY', tel: '0266019977', display: '02-6601-9977' },
  { icon: '🍷', name: '鼎豐送酒', tel: '0287728820', display: '02-8772-8820' },
  { icon: '🥬', name: '詠樂蔬果', tel: '0900286481', display: '0900-286-481' },
  { icon: '🦞', name: '左左海鮮', tel: '0908085057', display: '0908-085-057' },
  { icon: '🥩', name: '肉商和牛', tel: '0988559929', display: '0988-559-929' },
  { icon: '🗑️', name: '富地環保', tel: '0225000322', display: '02-2500-0322' },
]

const SLA_OPTIONS = [
  { label: '4小時（緊急）', value: 4 },
  { label: '12小時', value: 12 },
  { label: '24小時（預設）', value: 24 },
  { label: '48小時', value: 48 },
  { label: '72小時', value: 72 },
]

export default function AbnormalReport({ show, onClose }) {
  const { user } = useAuth()
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null)
  const [slaHours, setSlaHours] = useState(24)
  const [sending, setSending] = useState(false)
  const today = format(new Date(), 'yyyy-MM-dd')
  if (!show) return null

  async function send() {
    if (!note && !photo) return alert('請填寫說明或上傳照片')
    setSending(true)
    let photoUrl = ''
    if (photo) {
      const ext = photo.name.split('.').pop() || 'jpg'
      const path = 'abnormal/' + today + '/' + user.employee_id + '_' + Date.now() + '.' + ext
      const { error } = await supabase.storage.from('photos').upload(path, photo)
      if (!error) { const { data } = supabase.storage.from('photos').getPublicUrl(path); photoUrl = data.publicUrl }
    }
    await supabase.from('abnormal_reports').insert({ date: today, reporter: user.name, description: note, photo_url: photoUrl, status: '待處理', sla_hours: slaHours })
    setNote(''); setPhoto(null); setSlaHours(24); setSending(false)
    alert('異常回報已送出！老闆會收到通知'); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={22} /> 突發異常回報</div>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>常用廠商（點擊撥打）</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
          {VENDORS.map(v => (
            <a key={v.tel} href={'tel:' + v.tel} style={{ display: 'block', padding: '8px 10px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-dim)', textDecoration: 'none', fontSize: 12, lineHeight: 1.4 }}>
              {v.icon} {v.name}<div style={{ color: 'var(--green)', fontWeight: 700, marginTop: 2 }}>{v.display}</div>
            </a>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>發生了什麼事？</div>
        <textarea placeholder="例如：酒杯打破、馬桶不通、鐵捲門故障..." rows={4} value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 10, resize: 'none', fontSize: 14 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>處理時限</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {SLA_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setSlaHours(o.value)} style={{ padding: '6px 10px', borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: slaHours === o.value ? (o.value <= 4 ? 'rgba(196,77,77,.15)' : 'var(--gold-glow)') : 'transparent', color: slaHours === o.value ? (o.value <= 4 ? 'var(--red)' : 'var(--gold)') : 'var(--text-dim)', border: slaHours === o.value ? (o.value <= 4 ? '1px solid rgba(196,77,77,.4)' : '1px solid var(--border-gold)') : '1px solid var(--border)' }}>{o.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>現場照片</div>
        <div style={{ marginBottom: 12 }}>
          <input type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files?.[0])} style={{ fontSize: 13 }} />
          {photo && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>已選擇：{photo.name}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-outline" style={{ flex: 1 }} onClick={onClose}>取消</button>
          <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'linear-gradient(135deg, #c44d4d, #a03333)', opacity: sending ? .6 : 1 }} onClick={send} disabled={sending}>
            <Send size={14} /> {sending ? '回報中...' : '立即回報老闆'}
          </button>
        </div>
      </div>
    </div>
  )
}
