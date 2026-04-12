// Add employee name + date/time watermark to bottom-right of image
export function stampWatermark(file, employeeName, maxWidth = 1200, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth }
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // Watermark
        const now = new Date()
        const timeStr = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        const nameStr = employeeName || ''
        const fontSize = Math.max(14, Math.round(w / 40))
        ctx.font = `bold ${fontSize}px sans-serif`
        const nameW = ctx.measureText(nameStr).width
        ctx.font = `${fontSize - 2}px sans-serif`
        const timeW = ctx.measureText(timeStr).width
        const boxW = Math.max(nameW, timeW) + 20
        const boxH = fontSize * 2 + 16
        const bx = w - boxW - 8, by = h - boxH - 8
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(bx, by, boxW, boxH)
        ctx.textAlign = 'right'
        ctx.fillStyle = '#FFD700'
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.fillText(nameStr, w - 18, by + fontSize + 4)
        ctx.fillStyle = '#fff'
        ctx.font = `${fontSize - 2}px sans-serif`
        ctx.fillText(timeStr, w - 18, by + fontSize * 2 + 8)
        ctx.textAlign = 'left'
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' }))
        }, 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    if (file.size < 500000) { resolve(file); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }))
        }, 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
