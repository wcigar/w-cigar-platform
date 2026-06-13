// 產生「簽署版存證 PDF」：凍結條款全文 + 親簽圖 + 簽署人/身分證/時間/IP
// 法律自保用，依電子簽章法具證據效力
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'

const KIND_TITLE = {
  privacy_consent: '員工保密與個資保護條款',
  employment_contract: '正職人員聘用契約書',
  part_time_addendum: '兼職員工聘用附加條款',
  nda: '保密協議',
  confidentiality_pledge: '保密切結書',
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function generateSignedPdf(detail, signatureDataUrl) {
  const title = KIND_TITLE[detail.doc_kind] || detail.doc_kind
  const signedAt = detail.signed_at
    ? new Date(detail.signed_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    : '—'

  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;color:#1a1a1a;padding:48px 56px;font-family:"Noto Serif TC",serif;box-sizing:border-box;'
  el.innerHTML = `
    <div style="text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:14px;margin-bottom:20px;">
      <div style="font-size:15px;letter-spacing:2px;color:#555;">勝茄股份有限公司　Sheng Qie Co., Ltd.</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:#777;margin-top:4px;">電子簽署存證　版本 ${escapeHtml(detail.doc_version || 'v1')}</div>
    </div>
    <div style="font-size:13px;line-height:2;white-space:pre-wrap;color:#222;">${escapeHtml(detail.agreed_text)}</div>
    <div style="margin-top:30px;border-top:1px dashed #999;padding-top:18px;font-size:13px;line-height:2;">
      <div>本人已充分閱讀並理解上開條款全部內容，同意遵守，並以電子方式親自簽署如下：</div>
      <table style="width:100%;margin-top:14px;font-size:13px;border-collapse:collapse;">
        <tr><td style="width:96px;color:#555;padding:4px 0;vertical-align:top;">簽署人</td><td>${escapeHtml(detail.signer_name)}</td></tr>
        <tr><td style="color:#555;padding:4px 0;">身分證字號</td><td>${escapeHtml(detail.id_number || '—')}</td></tr>
        <tr><td style="color:#555;padding:4px 0;">簽署時間</td><td>${escapeHtml(signedAt)}（台北時間）</td></tr>
        <tr><td style="color:#555;padding:4px 0;">簽署 IP</td><td>${escapeHtml(detail.ip || '—')}</td></tr>
      </table>
      <div style="margin-top:16px;color:#555;">親筆簽名：</div>
      <div style="margin-top:8px;border:1px solid #ddd;border-radius:6px;display:inline-block;padding:6px;background:#fafafa;">
        ${signatureDataUrl ? `<img src="${signatureDataUrl}" style="height:90px;display:block;" />` : '<span style="color:#bbb;">（簽名影像缺失）</span>'}
      </div>
    </div>
    <div style="margin-top:24px;font-size:10px;color:#999;text-align:center;line-height:1.6;">本文件由 W Cigar Bar 人事系統於簽署當下凍結條款全文，依《電子簽章法》具證據效力。下載時間：${escapeHtml(new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))}</div>
  `
  document.body.appendChild(el)
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = pdf.internal.pageSize.getWidth()
    const ph = pdf.internal.pageSize.getHeight()
    const imgH = canvas.height * pw / canvas.width
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    let remaining = imgH
    let position = 0
    while (remaining > 0) {
      pdf.addImage(imgData, 'JPEG', 0, position, pw, imgH)
      remaining -= ph
      if (remaining > 0) { pdf.addPage(); position -= ph }
    }
    pdf.save(`簽署存證_${title}_${detail.signer_name || detail.employee_id}.pdf`)
  } finally {
    document.body.removeChild(el)
  }
}
