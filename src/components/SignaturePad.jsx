import { useEffect, useRef } from 'react'

// 通用簽名板：畫完(每筆結束)回傳 dataURL；清除回傳 null
export default function SignaturePad({ onChange, height = 150, color = '#f0e8d8', bg = '#0f0d0a' }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const c = ref.current
    const ctx = c.getContext('2d')
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = color
    const pos = e => { const r = c.getBoundingClientRect(); const t = e.touches?.[0] || e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) } }
    const down = e => { e.preventDefault(); drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
    const move = e => { if (!drawing.current) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true }
    const up = () => { if (drawing.current && dirty.current) onChange?.(c.toDataURL('image/png')); drawing.current = false }
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.current = false; onChange?.(null) }

  return (
    <div>
      <canvas ref={ref} width={600} height={200} style={{ width: '100%', height, background: bg, border: '1px dashed rgba(201,168,76,.35)', borderRadius: 10, touchAction: 'none', cursor: 'crosshair' }} />
      <button type="button" onClick={clear} style={{ marginTop: 6, padding: '6px 14px', borderRadius: 8, background: 'transparent', border: '1px solid #2a2520', color: '#8a8278', fontSize: 12, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif' }}>清除重簽</button>
    </div>
  )
}
