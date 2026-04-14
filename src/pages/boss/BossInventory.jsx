import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Package, Search, AlertTriangle, X, Camera } from 'lucide-react'

const REASON_CODES = {
  normal: { label: '正常消耗', color: '#4da86c' },
  damage: { label: '損耗報廢', color: '#e74c3c' },
  restock: { label: '進貨入庫', color: '#4d8ac4' },
  error: { label: '盤點誤差', color: '#f59e0b' },
  gift: { label: '贈送客戶', color: '#c9a84c' },
  other: { label: '其他', color: '#8a7e6e' },
}

export default function BossInventory() {
  const [tab, setTab] = useState('stock') // 'stock' | 'records'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [adjQty, setAdjQty] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjType, setAdjType] = useState('in')
  const [saving, setSaving] = useState(false)
  const [photoItem, setPhotoItem] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const lowCount = items.filter(i => Number(i.current_stock) < Number(i.safe_stock)).length
  useEffect(() => { loadInventory() }, [])

  async function loadInventory() {
    setLoading(true)
    const { data } = await supabase.from('inventory_master').select('*, image_url').eq('enabled', true).order('category').order('name')
    if (data) setItems(data)
    setLoading(false)
  }

  useEffect(() => { if (tab === 'records') loadRecords() }, [tab])
  async function loadRecords() {
    setRecordsLoading(true)
    const { data } = await supabase.from('inventory_records').select('*').order('created_at', { ascending: false }).limit(100)
    setRecords(data || [])
    setRecordsLoading(false)
  }

  async function handleAdjust() {
    if (!selected || !adjQty || !adjReason.trim()) return
    setSaving(true)
    const qty = parseInt(adjQty)
    const delta = adjType === 'in' ? qty : -qty
    const newStock = Math.max(0, Number(selected.current_stock) + delta)
    const { error: txErr } = await supabase.from('stock_transactions').insert({
      inv_master_id: selected.id,
      product_id: selected.product_id || null,
      channel: 'boss_adjust',
      direction: adjType === 'in' ? 'in' : 'out',
      quantity: qty,
      unit: selected.unit || '',
      notes: adjReason.trim(),
      handled_by: 'ADMIN',
      created_at: new Date().toISOString()
    })
    if (!txErr) {
      await supabase.from('inventory_master').update({
        current_stock: newStock,
        is_low: newStock < Number(selected.safe_stock),
        last_update: new Date().toISOString()
      }).eq('id', selected.id)
    }
    setSaving(false)
    setSelected(null)
    setAdjQty('')
    setAdjReason('')
    loadInventory()
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !photoItem) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `inventory/${photoItem.id}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
      const { error: dbErr } = await supabase.from('inventory_master')
        .update({ image_url: url })
        .eq('id', photoItem.id)
      if (dbErr) throw dbErr
      setPhotoItem(null)
      loadInventory()
    } catch (err) {
      alert('上傳失敗: ' + (err.message || err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    return (i.name || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
  })
  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const s = {
    page: { padding: 20, color: '#e8dcc8', maxWidth: 900, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 22, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 10 },
    badge: { background: '#e74c3c', color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 },
    searchBox: { display: 'flex', alignItems: 'center', gap: 8, background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, padding: '8px 12px', marginBottom: 16 },
    input: { background: 'transparent', border: 'none', color: '#e8dcc8', outline: 'none', flex: 1, fontSize: 14 },
    catHeader: { fontSize: 14, fontWeight: 600, color: '#8a8278', padding: '12px 0 6px', borderBottom: '1px solid #2a2520', marginTop: 16 },
    row: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1a1714', gap: 10 },
    name: { flex: 1, fontSize: 14 },
    qty: { width: 60, textAlign: 'center', fontWeight: 700, fontSize: 15 },
    unit: { width: 30, fontSize: 12, color: '#8a8278' },
    statusBad: { color: '#e74c3c', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, width: 70 },
    statusOk: { color: '#4caf50', fontSize: 11, width: 70, textAlign: 'center' },
    btn: { padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: '#c9a84c', color: '#0a0a0a' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modal: { background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw' },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>
          <Package size={22} /> 庫存管理
          {lowCount > 0 && <span style={s.badge}>{lowCount} 低庫存</span>}
        </div>
        <div style={{ fontSize: 12, color: '#8a8278' }}>共 {items.length} 項商品</div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button onClick={() => setTab('stock')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === 'stock' ? 'rgba(201,168,76,.15)' : 'transparent', color: tab === 'stock' ? '#c9a84c' : '#8a7e6e', border: tab === 'stock' ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>庫存總覽</button>
        <button onClick={() => setTab('records')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === 'records' ? 'rgba(201,168,76,.15)' : 'transparent', color: tab === 'records' ? '#c9a84c' : '#8a7e6e', border: tab === 'records' ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>盤點紀錄</button>
      </div>

      {tab === 'records' ? (
        <div>
          {recordsLoading ? <div style={{ textAlign: 'center', padding: 30, color: '#8a8278' }}>載入中…</div> :
          !records.length ? <div style={{ textAlign: 'center', padding: 30, color: '#8a8278' }}>尚無盤點紀錄</div> :
          records.map(r => {
            const rc = REASON_CODES[r.reason_code]
            return <div key={r.id} style={{ ...s.row, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.item_name}</div>
                <div style={{ fontSize: 11, color: '#8a8278' }}>{r.staff_code}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#8a8278' }}>{r.before_stock} → {r.after_stock} <span style={{ fontWeight: 700, color: r.diff > 0 ? '#4da86c' : r.diff < 0 ? '#e74c3c' : '#8a8278' }}>{r.diff > 0 ? '+' : ''}{r.diff}</span></span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {rc && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: rc.color + '20', color: rc.color, fontWeight: 600 }}>{rc.label}</span>}
                  <span style={{ fontSize: 10, color: '#8a8278' }}>{r.created_at ? new Date(r.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              </div>
              {r.note && <div style={{ fontSize: 11, color: '#8a8278' }}>{r.note}</div>}
            </div>
          })}
        </div>
      ) : <>

      <div style={s.searchBox}>
        <Search size={16} color="#8a8278" />
        <input style={s.input} placeholder="搜尋商品名稱 / 分類..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8a8278' }}>載入中...</div>
      ) : Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat}>
          <div style={s.catHeader}>{cat} ({catItems.length})</div>
          {catItems.map(item => {
            const stock = Number(item.current_stock), safe = Number(item.safe_stock), isLow = stock < safe
            return (
              <div key={item.id} style={{ ...s.row, background: isLow ? 'rgba(231,76,60,.06)' : 'transparent' }}>
                {/* Thumbnail */}
                <div style={{ width: 36, height: 36, borderRadius: 6, background: '#0f0d0a', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.image_url
                    ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                    : <span style={{ fontSize: 14, color: '#2a2520', fontWeight: 700 }}>{(item.name || '?')[0]}</span>
                  }
                </div>
                <div style={s.name}>{item.name}</div>
                <div style={{ ...s.qty, color: isLow ? '#e74c3c' : '#c9a84c' }}>{stock}</div>
                <div style={s.unit}>{item.unit}</div>
                {isLow ? <div style={s.statusBad}><AlertTriangle size={12} /> 低庫存</div> : <div style={s.statusOk}>正常</div>}
                <button style={{ ...s.btn, background: 'transparent', border: '1px solid #2a2520', color: '#8a8278', padding: '5px 8px' }} onClick={() => setPhotoItem(item)} title="上傳圖片"><Camera size={14} /></button>
                <button style={s.btn} onClick={() => { setSelected(item); setAdjType('in'); setAdjQty(''); setAdjReason('') }}>調整</button>
              </div>
            )
          })}
        </div>
      ))}
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoUpload} />

      {/* Photo upload modal */}
      {photoItem && (
        <div style={s.overlay} onClick={() => !uploading && setPhotoItem(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#c9a84c', margin: 0, fontSize: 18 }}>上傳圖片</h3>
              <X size={20} style={{ cursor: 'pointer', color: '#8a8278' }} onClick={() => !uploading && setPhotoItem(null)} />
            </div>
            <div style={{ marginBottom: 12, color: '#e8dcc8', fontWeight: 600 }}>{photoItem.name}</div>
            {photoItem.image_url && (
              <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2520' }}>
                <img src={photoItem.image_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
                <div style={{ fontSize: 10, color: '#8a8278', padding: '4px 8px', background: '#0a0a0a' }}>目前圖片</div>
              </div>
            )}
            <button disabled={uploading} onClick={() => fileRef.current?.click()}
              style={{ width: '100%', padding: 14, borderRadius: 8, border: '1px solid #2a2520', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: uploading ? '#333' : '#1a1714', color: uploading ? '#666' : '#e8dcc8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
              <Camera size={18} /> {uploading ? '上傳中…' : '📷 拍照 / 選擇檔案'}
            </button>
            <div style={{ fontSize: 11, color: '#5a554e', textAlign: 'center' }}>支援 JPG / PNG / WebP</div>
          </div>
        </div>
      )}

      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#c9a84c', margin: 0, fontSize: 18 }}>調整庫存</h3>
              <X size={20} style={{ cursor: 'pointer', color: '#8a8278' }} onClick={() => setSelected(null)} />
            </div>
            <div style={{ marginBottom: 8, color: '#e8dcc8', fontWeight: 600 }}>{selected.name}</div>
            <div style={{ marginBottom: 12, color: '#8a8278', fontSize: 13 }}>
              目前: <span style={{ color: '#c9a84c', fontWeight: 700 }}>{Number(selected.current_stock)} {selected.unit}</span>
              {' / '}安全: <span style={{ fontWeight: 600 }}>{Number(selected.safe_stock)} {selected.unit}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setAdjType('in')} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #2a2520', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: adjType === 'in' ? '#4caf50' : '#1a1714', color: adjType === 'in' ? '#fff' : '#8a8278' }}>+ 進貨</button>
              <button onClick={() => setAdjType('out')} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #2a2520', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: adjType === 'out' ? '#e74c3c' : '#1a1714', color: adjType === 'out' ? '#fff' : '#8a8278' }}>- 盤損</button>
            </div>
            <input type="number" min="1" placeholder="數量" value={adjQty} onChange={e => setAdjQty(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }} />
            <input placeholder="原因（如：進貨補充 / 盤點短缺）" value={adjReason} onChange={e => setAdjReason(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', marginBottom: 16, fontSize: 14, boxSizing: 'border-box' }} />
            <button disabled={saving || !adjQty || !adjReason.trim()} onClick={handleAdjust} style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: (!adjQty || !adjReason.trim()) ? '#333' : '#c9a84c', color: (!adjQty || !adjReason.trim()) ? '#666' : '#0a0a0a' }}>
              {saving ? '儲存中...' : '確認調整'}
            </button>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}
