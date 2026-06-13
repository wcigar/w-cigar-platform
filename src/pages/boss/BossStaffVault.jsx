import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Users, ShieldCheck, FileText, PenLine, GraduationCap, ChevronLeft, Eye, CheckCircle2, XCircle, AlertCircle, Download } from 'lucide-react'
import { generateSignedPdf } from '../../lib/signedPdf'

const GOLD = '#c9a84c'
const DOC_LABEL = { id_front: '身分證正面', id_back: '身分證反面', bankbook: '存摺封面', other: '其他' }
const SIG_LABEL = { privacy_consent: '保密與個資保護條款', employment_contract: '正職聘用契約', nda: '保密協議', confidentiality_pledge: '保密切結書', part_time_addendum: '兼職附加條款' }

function StatusDot({ done }) { return <span style={{ color: done ? '#7faa7f' : '#5a554e', fontSize: 13 }}>{done ? '●' : '○'}</span> }

export default function BossStaffVault() {
  const { user } = useAuth()
  const token = user?.hr_token
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null)      // 選中員工 detail
  const [busy, setBusy] = useState(false)
  const [resigns, setResigns] = useState([])
  const [injuries, setInjuries] = useState([])

  async function loadList() {
    const [ov, rs, inj] = await Promise.all([
      supabase.rpc('hr_overview', { p_token: token }),
      supabase.rpc('hr_resignations', { p_token: token }),
      supabase.rpc('hr_injury_reports', { p_token: token }),
    ])
    setList(ov.data?.ok ? ov.data.employees : [])
    setResigns(rs.data?.ok ? rs.data.list : [])
    setInjuries(inj.data?.ok ? inj.data.list : [])
  }
  useEffect(() => { if (token) loadList(); else setList([]) }, [token])

  async function reviewResign(id, status) {
    if (status === 'rejected' && !confirm('確定駁回此離職交接單？')) return
    const note = status === 'approved' ? (prompt('核准備註（選填）') ?? '') : ''
    await supabase.rpc('hr_review_resignation', { p_token: token, p_id: id, p_status: status, p_note: note })
    loadList()
  }

  async function reviewInjury(id, status) {
    await supabase.rpc('hr_review_injury', { p_token: token, p_id: id, p_status: status })
    loadList()
  }

  async function openDetail(empId) {
    setBusy(true)
    const { data } = await supabase.rpc('hr_employee_detail', { p_token: token, p_employee_id: empId })
    setBusy(false)
    if (data?.ok) setSel({ employee_id: empId, ...data }); else alert('讀取失敗')
  }

  async function viewFile(kind, id) {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('hr-doc-url', { body: { token, kind, id } })
    setBusy(false)
    if (error || !data?.ok) return alert('無法開啟：' + (data?.error || error?.message || '未知'))
    window.open(data.url, '_blank')
  }

  async function downloadSig(sigId) {
    setBusy(true)
    try {
      const { data } = await supabase.rpc('hr_signature_detail', { p_token: token, p_sig_id: sigId })
      if (!data?.ok) return alert('讀取失敗：' + (data?.error || ''))
      let sigDataUrl = null
      const { data: u } = await supabase.functions.invoke('hr-doc-url', { body: { token, kind: 'signature', id: sigId } })
      if (u?.ok) {
        const blob = await (await fetch(u.url)).blob()
        sigDataUrl = await new Promise(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result); fr.readAsDataURL(blob) })
      }
      await generateSignedPdf(data, sigDataUrl)
    } catch (e) { alert('產生 PDF 失敗：' + e.message) }
    finally { setBusy(false) }
  }

  async function verifyDoc(docId, status) {
    await supabase.rpc('hr_verify_document', { p_token: token, p_doc_id: docId, p_status: status })
    openDetail(sel.employee_id)
  }

  async function signoff(moduleId) {
    const note = prompt('現場考核簽核備註（選填）') ?? ''
    const { data } = await supabase.rpc('hr_training_signoff', { p_token: token, p_employee_id: sel.employee_id, p_module_id: moduleId, p_trainer_name: user.name, p_note: note })
    if (data?.ok) openDetail(sel.employee_id); else alert('簽核失敗')
  }

  async function approve() {
    if (!confirm('確認此員工已完成所有入職程序、啟用為在職？')) return
    const { data } = await supabase.rpc('hr_approve_onboarding', { p_token: token, p_employee_id: sel.employee_id })
    if (data?.ok) { openDetail(sel.employee_id); loadList() } else alert('啟用失敗')
  }

  if (!token) return <div style={{ padding: 30, textAlign: 'center', color: '#d68c46', fontFamily: 'Noto Serif TC,serif' }}>此功能需重新登入以取得授權（登出後再登入一次即可）。</div>
  if (!list) return <div style={{ padding: 24 }}><div className="loading-shimmer" style={{ height: 120, borderRadius: 14 }} /></div>

  // ── 員工詳情 ──
  if (sel) {
    const p = sel.profile || {}
    return (
      <div style={{ padding: '0 20px 100px', maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', color: '#8a8278', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '20px 0 10px' }}><ChevronLeft size={16} />返回員工列表</button>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 20, fontWeight: 500, color: '#f0e8d8', marginBottom: 4 }}>{p.full_name || sel.employee_id}</div>
        <div style={{ fontSize: 12, color: '#888078', marginBottom: 16 }}>狀態：{p.status === 'active' ? '✅ 在職' : p.status === 'submitted' ? '待審核' : p.status === 'in_progress' ? '入職中' : p.status || '—'}</div>

        {/* 完整個資（君姐報勞健保用）*/}
        <Section icon={<ShieldCheck size={14} />} title="個人資料（機密 · 限報勞健保用途）">
          <Row k="姓名" v={p.full_name} /><Row k="出生年月日" v={p.birth_date} />
          <Row k="身分證字號" v={p.id_number} mono /><Row k="聯絡電話" v={p.phone} />
          <Row k="地址" v={p.address} /><Row k="緊急聯絡人" v={p.emergency_contact} />
          <Row k="銀行/帳號" v={p.bank_code || p.bank_account ? `${p.bank_code || ''} ${p.bank_account || ''}` : null} mono />
          <Row k="到職日" v={p.start_date} />
        </Section>

        {/* 證件 */}
        <Section icon={<FileText size={14} />} title={`證件（${sel.documents.length}）`}>
          {sel.documents.length === 0 ? <Empty /> : sel.documents.map(d => (
            <div key={d.id} style={rowStyle}>
              <span style={{ color: '#e8e0d0', fontSize: 13 }}>{DOC_LABEL[d.doc_type] || d.doc_type}
                <span style={{ marginLeft: 8, fontSize: 11, color: d.status === 'verified' ? '#7faa7f' : d.status === 'rejected' ? '#d9534f' : '#d68c46' }}>{d.status === 'verified' ? '已驗證' : d.status === 'rejected' ? '駁回' : '待審'}</span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <IconBtn onClick={() => viewFile('document', d.id)} label="檢視"><Eye size={13} /></IconBtn>
                <IconBtn onClick={() => verifyDoc(d.id, 'verified')} color="#7faa7f"><CheckCircle2 size={13} /></IconBtn>
                <IconBtn onClick={() => verifyDoc(d.id, 'rejected')} color="#d9534f"><XCircle size={13} /></IconBtn>
              </span>
            </div>
          ))}
        </Section>

        {/* 簽署文件 */}
        <Section icon={<PenLine size={14} />} title={`電子簽署（${sel.signatures.length}）`}>
          {sel.signatures.length === 0 ? <Empty /> : sel.signatures.map(sg => (
            <div key={sg.id} style={rowStyle}>
              <span style={{ color: '#e8e0d0', fontSize: 13 }}>{SIG_LABEL[sg.doc_kind] || sg.doc_kind}
                <span style={{ marginLeft: 8, fontSize: 11, color: '#888078' }}>{sg.signed_at ? new Date(sg.signed_at).toLocaleDateString('zh-TW') : ''} · {sg.doc_version}</span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <IconBtn onClick={() => viewFile('signature', sg.id)} label="簽名"><Eye size={13} /></IconBtn>
                <IconBtn onClick={() => downloadSig(sg.id)} color={GOLD} label="簽署版PDF"><Download size={13} /></IconBtn>
              </span>
            </div>
          ))}
        </Section>

        {/* 培訓 + 現場考核 */}
        <Section icon={<GraduationCap size={14} />} title="培訓與現場考核">
          {sel.training.length === 0 ? <Empty /> : sel.training.map(t => (
            <div key={t.module_id} style={{ ...rowStyle, flexWrap: 'wrap' }}>
              <span style={{ color: '#e8e0d0', fontSize: 13, flex: 1 }}>{t.module}
                <span style={{ marginLeft: 8, fontSize: 11, color: t.passed ? '#7faa7f' : '#d68c46' }}>{t.passed ? `線上 ${t.best}分 通過` : t.best != null ? `最高 ${t.best}分 未過` : '未測驗'}</span>
              </span>
              {t.signed_off
                ? <span style={{ fontSize: 11, color: '#7faa7f' }}>✍ 已簽核{t.trainer ? `（${t.trainer}）` : ''}</span>
                : <button onClick={() => signoff(t.module_id)} disabled={!t.passed} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: `1px solid ${t.passed ? GOLD : '#2a2520'}`, background: 'transparent', color: t.passed ? GOLD : '#5a554e', cursor: t.passed ? 'pointer' : 'not-allowed' }}>現場簽核</button>}
            </div>
          ))}
        </Section>

        {p.status !== 'active' && (
          <button onClick={approve} disabled={busy} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 15, fontWeight: 700, letterSpacing: 2, cursor: 'pointer' }}>啟用為正式在職</button>
        )}
      </div>
    )
  }

  // ── 員工列表 ──
  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '36px 0 18px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', marginBottom: 12 }}><Users size={22} color={GOLD} /></div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>人事檔案庫</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 3, marginTop: 4 }}>STAFF VAULT · HR</div>
      </div>

      {/* 離職交接待審 */}
      {resigns.length > 0 && (
        <div style={{ marginBottom: 14, padding: 14, borderRadius: 13, background: 'rgba(214,140,70,.06)', border: '1px solid rgba(214,140,70,.3)' }}>
          <div style={{ fontSize: 13, color: '#d68c46', marginBottom: 10 }}>📤 離職交接待審（{resigns.length}）</div>
          {resigns.map(r => (
            <div key={r.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(201,168,76,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#f0e8d8' }}>{r.name || r.employee_id}<span style={{ fontSize: 11, color: '#888078', marginLeft: 8 }}>最後工作日 {r.last_work_day || '—'}</span></span>
                <span style={{ fontSize: 11, color: r.status === 'approved' ? '#7faa7f' : '#d68c46' }}>{r.status === 'approved' ? '已核准' : '待審'}</span>
              </div>
              {r.reason && <div style={{ fontSize: 12, color: '#a89f90', marginTop: 4 }}>原因：{r.reason}</div>}
              <div style={{ fontSize: 11, color: '#888078', marginTop: 4 }}>鑰匙 {r.key_returned ? '✅' : '❌'}　制服 {r.uniform_returned ? '✅' : '❌'}　業務移交 {r.handover_done ? '✅' : '❌'}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {r.has_file && <IconBtn onClick={() => viewFile('resignation', r.id)} label="交接檔"><Eye size={13} /></IconBtn>}
                {r.status === 'submitted' && <>
                  <IconBtn onClick={() => reviewResign(r.id, 'approved')} color="#7faa7f"><CheckCircle2 size={13} /></IconBtn>
                  <IconBtn onClick={() => reviewResign(r.id, 'rejected')} color="#d9534f"><XCircle size={13} /></IconBtn>
                </>}
                {r.status === 'approved' && <IconBtn onClick={() => reviewResign(r.id, 'completed')} color={GOLD} label="完成結案"><CheckCircle2 size={13} /></IconBtn>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 職災通報待處理 */}
      {injuries.length > 0 && (
        <div style={{ marginBottom: 14, padding: 14, borderRadius: 13, background: 'rgba(217,83,79,.06)', border: '1px solid rgba(217,83,79,.3)' }}>
          <div style={{ fontSize: 13, color: '#d9534f', marginBottom: 10 }}>🚑 職災事故通報（{injuries.length}）</div>
          {injuries.map(i => (
            <div key={i.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(201,168,76,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#f0e8d8' }}>{i.employee_name}<span style={{ fontSize: 11, color: '#888078', marginLeft: 8 }}>{i.incident_at ? new Date(i.incident_at).toLocaleString('zh-TW') : ''}</span></span>
                <span style={{ fontSize: 11, color: i.status === 'processing' ? '#d68c46' : '#d9534f' }}>{i.status === 'processing' ? '處理中' : '待處理'}</span>
              </div>
              <div style={{ fontSize: 12, color: '#cdc4b2', marginTop: 4 }}>{i.description}</div>
              <div style={{ fontSize: 11, color: '#888078', marginTop: 4 }}>{i.injury_part ? `傷勢：${i.injury_part}　` : ''}{i.hospitalized ? `已送醫${i.hospital ? '（' + i.hospital + '）' : ''}` : '未送醫'}{i.witness ? `　證人：${i.witness}` : ''}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {i.status === 'reported' && <IconBtn onClick={() => reviewInjury(i.id, 'processing')} color="#d68c46" label="標記處理中"><CheckCircle2 size={13} /></IconBtn>}
                <IconBtn onClick={() => reviewInjury(i.id, 'closed')} color={GOLD} label="結案"><CheckCircle2 size={13} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {list.map(e => {
        const o = e.onboarding
        return (
          <div key={e.employee_id} onClick={() => openDetail(e.employee_id)} style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: '1px solid rgba(201,168,76,.12)', borderRadius: 13, padding: 15, marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 15, color: '#f0e8d8', fontWeight: 500 }}>{e.name} <span style={{ fontSize: 11, color: '#888078' }}>{e.title}</span></span>
              <span style={{ fontSize: 11, color: o?.status === 'active' ? '#7faa7f' : o?.status === 'submitted' ? '#d68c46' : '#888078' }}>{o?.status === 'active' ? '在職' : o?.status === 'submitted' ? '待審核' : o ? '入職中' : '未建檔'}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#a89f90', alignItems: 'center', flexWrap: 'wrap' }}>
              <span><StatusDot done={o?.profile_done} /> 建檔</span>
              <span><StatusDot done={o?.docs_done} /> 證件({e.doc_count})</span>
              <span><StatusDot done={o?.sign_done} /> 簽署({e.sig_count})</span>
              <span><StatusDot done={o?.handbook_done} /> 規章</span>
              <span><StatusDot done={o?.training_done} /> 培訓({e.training_passed}/{e.training_total})</span>
              {e.training_wrong > 0 && <span style={{ color: '#d68c46' }}>錯題 {e.training_wrong}</span>}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 11, color: '#6a655c', textAlign: 'center', padding: '14px 0', lineHeight: 1.7 }}>🔒 員工個資、證件、簽署文件僅限授權人員檢視，存取均經角色驗證，請勿外流。</div>
    </div>
  )
}

const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(201,168,76,.06)', gap: 8 }
function Section({ icon, title, children }) {
  return (
    <div style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: '1px solid rgba(201,168,76,.1)', borderRadius: 13, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: GOLD, letterSpacing: 1, marginBottom: 8 }}>{icon}{title}</div>
      {children}
    </div>
  )
}
function Row({ k, v, mono }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(201,168,76,.05)', fontSize: 13 }}>
    <span style={{ color: '#888078' }}>{k}</span>
    <span style={{ color: v ? '#e8e0d0' : '#5a554e', fontFamily: mono ? 'JetBrains Mono,monospace' : 'Noto Serif TC,serif', textAlign: 'right' }}>{v || '—'}</span>
  </div>
}
function Empty() { return <div style={{ fontSize: 12, color: '#5a554e', padding: '8px 0' }}>尚無資料</div> }
function IconBtn({ onClick, children, color = '#a89f90', label }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, border: `1px solid ${color}44`, background: 'transparent', color, fontSize: 11, cursor: 'pointer' }}>{children}{label}</button>
}
