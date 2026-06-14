import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { GraduationCap, FileText, CheckCircle2, XCircle, RotateCcw, ChevronLeft } from 'lucide-react'

const GOLD = '#c9a84c'

export default function StaffTraining() {
  const { user } = useAuth()
  const [mods, setMods] = useState(null)
  const [view, setView] = useState('list')      // list | quiz | result
  const [active, setActive] = useState(null)     // 進行中的 module
  const [quiz, setQuiz] = useState([])
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [trainer, setTrainer] = useState(null) // 教官待現場考核名單
  const [material, setMaterial] = useState(null) // 目前閱讀中的教材

  async function loadList() {
    const { data } = await supabase.rpc('training_list', { p_employee_id: user.employee_id })
    setMods(data || [])
    if (user?.hr_token) {
      const { data: tr } = await supabase.rpc('trainer_pending', { p_token: user.hr_token })
      setTrainer(tr?.ok && tr.is_trainer ? tr : null)
    }
  }
  useEffect(() => { if (user?.employee_id) loadList() }, [user?.employee_id])

  async function fieldSignoff(traineeId, moduleId, traineeName) {
    if (!confirm(`確認 ${traineeName} 已當面操作 SIMPOS 通過、由你現場考核簽核？`)) return
    const note = prompt('現場考核備註（選填）') ?? ''
    const { data } = await supabase.rpc('trainer_field_signoff', { p_token: user.hr_token, p_trainee_id: traineeId, p_module_id: moduleId, p_note: note })
    if (data?.ok) loadList(); else alert('簽核失敗：' + (data?.error || ''))
  }

  async function openMaterial(m) {
    setBusy(true)
    const { data } = await supabase.rpc('training_get_material', { p_module_id: m.id })
    setBusy(false)
    if (!data?.ok) return alert('教材整理中，請稍候或洽主管')
    setActive(m); setMaterial(data); setView('material'); window.scrollTo(0, 0)
  }

  async function startQuiz(m) {
    setBusy(true)
    const { data, error } = await supabase.rpc('training_get_quiz', { p_module_id: m.id })
    setBusy(false)
    if (error) return alert('載入失敗：' + error.message)
    setActive(m); setQuiz(data || []); setAnswers({}); setResult(null); setView('quiz')
    window.scrollTo(0, 0)
  }

  async function submitQuiz() {
    if (Object.keys(answers).length < quiz.length) { if (!confirm(`還有 ${quiz.length - Object.keys(answers).length} 題未作答，確定交卷？`)) return }
    setBusy(true)
    const { data, error } = await supabase.rpc('training_submit', { p_employee_id: user.employee_id, p_module_id: active.id, p_answers: answers })
    setBusy(false)
    if (error) return alert('交卷失敗：' + error.message)
    setResult(data); setView('result'); window.scrollTo(0, 0)
    loadList()
  }

  if (!mods) return <div style={{ padding: 24 }}><div className="loading-shimmer" style={{ height: 120, borderRadius: 14 }} /></div>

  // ── 結果頁 ──
  if (view === 'result' && result) {
    return (
      <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '40px 0 20px' }}>
          {result.passed ? <CheckCircle2 size={56} color="#7faa7f" /> : <XCircle size={56} color="#d9534f" />}
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 28, fontWeight: 600, color: result.passed ? '#7faa7f' : '#d9534f', marginTop: 10 }}>{result.percent} 分</div>
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 14, color: '#a89f90', marginTop: 4 }}>{result.score}/{result.total} 題正確 · 及格 {result.pass_score} 分 · {result.passed ? '通過 ✅' : '未通過'}</div>
        </div>
        {result.wrong.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 13, color: '#d68c46', marginBottom: 10 }}>錯題檢討（{result.wrong.length} 題）— 找時間重考前請複習</div>
            {result.wrong.map((w, i) => {
              const opt = (w.options || []).reduce((a, o) => ({ ...a, [o.key]: o.text }), {})
              return (
                <div key={i} style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: '1px solid rgba(217,83,79,.25)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 13.5, color: '#f0e8d8', marginBottom: 8 }}>{w.question}</div>
                  <div style={{ fontSize: 12, color: '#d9534f', marginBottom: 3 }}>你的答案：{w.your ? `${w.your}. ${opt[w.your] || ''}` : '（未作答）'}</div>
                  <div style={{ fontSize: 12, color: '#7faa7f', marginBottom: 6 }}>正解：{w.correct}. {opt[w.correct] || ''}</div>
                  {w.explanation && <div style={{ fontSize: 11.5, color: '#8a8278', lineHeight: 1.6, paddingTop: 6, borderTop: '1px solid rgba(201,168,76,.08)' }}>💡 {w.explanation}</div>}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setView('list'); loadList() }} style={{ flex: 1, padding: 13, borderRadius: 10, background: 'transparent', border: '1px solid #2a2520', color: '#a89f90', fontSize: 14, cursor: 'pointer' }}>返回列表</button>
          {!result.passed && <button onClick={() => startQuiz(active)} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}><RotateCcw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />立即重考</button>}
        </div>
      </div>
    )
  }

  // ── 教材閱讀頁 ──
  if (view === 'material' && material && active) {
    return (
      <div style={{ padding: '0 20px 100px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(10,9,8,.96)', padding: '16px 0 10px' }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#8a8278', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} />返回列表</button>
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 18, fontWeight: 500, color: '#f0e8d8', marginTop: 6 }}>{material.title}</div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 2, marginTop: 2 }}>STUDY MATERIAL · 培訓教材</div>
        </div>

        <div style={{ background: 'rgba(201,168,76,.05)', border: '1px solid rgba(201,168,76,.18)', borderRadius: 10, padding: '10px 13px', margin: '4px 0 16px', fontSize: 12, color: 'rgba(201,168,76,.85)', lineHeight: 1.7 }}>📖 請仔細研讀以下重點，測驗題目皆出自此教材。研讀完成後點下方按鈕開始測驗。</div>

        {(material.material || []).map((sec, i) => (
          <div key={i} style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: '1px solid rgba(201,168,76,.1)', borderRadius: 13, padding: 16, marginBottom: 12 }}>
            <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 15, fontWeight: 600, color: GOLD, marginBottom: sec.p ? 6 : 10, paddingLeft: 10, borderLeft: `3px solid ${GOLD}` }}>{sec.h}</div>
            {sec.p && <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 12.5, color: '#a89f90', lineHeight: 1.7, marginBottom: 10, paddingLeft: 10 }}>{sec.p}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(sec.items || []).map((it, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: GOLD, fontSize: 13, lineHeight: 1.7, flexShrink: 0 }}>·</span>
                  <span style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 13.5, color: '#e0d8c8', lineHeight: 1.75 }}>{it}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {material.pdf_url && <a href={material.pdf_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', padding: 11, borderRadius: 9, background: 'transparent', border: '1px solid #2a2520', color: '#a89f90', fontSize: 13, textDecoration: 'none', fontFamily: 'Noto Serif TC,serif', marginBottom: 12 }}><FileText size={13} style={{ verticalAlign: -2, marginRight: 5 }} />延伸閱讀：完整教材 PDF</a>}

        <button onClick={() => startQuiz(active)} disabled={busy} style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 15, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '載入中…' : '我已研讀 · 開始測驗'}</button>
      </div>
    )
  }

  // ── 測驗頁 ──
  if (view === 'quiz' && active) {
    const answered = Object.keys(answers).length
    return (
      <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(10,9,8,.96)', padding: '16px 0 10px' }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#8a8278', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} />放棄</button>
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 16, fontWeight: 500, color: '#f0e8d8', marginTop: 6 }}>{active.title}</div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${answered / quiz.length * 100}%`, background: GOLD, transition: 'width .3s' }} />
          </div>
          <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: GOLD, marginTop: 4 }}>{answered}/{quiz.length} 已作答</div>
        </div>

        {quiz.map((q, i) => (
          <div key={q.id} style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: `1px solid ${answers[q.id] ? 'rgba(201,168,76,.22)' : 'rgba(201,168,76,.08)'}`, borderRadius: 13, padding: 16, marginBottom: 10 }}>
            <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 14, color: '#f0e8d8', marginBottom: 12, lineHeight: 1.6 }}><span style={{ color: GOLD }}>{i + 1}.</span> {q.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(q.options || []).map(o => {
                const sel = answers[q.id] === o.key
                return (
                  <button key={o.key} onClick={() => setAnswers(a => ({ ...a, [q.id]: o.key }))}
                    style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 9, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif', fontSize: 13.5, transition: 'all .15s',
                      background: sel ? 'rgba(201,168,76,.14)' : 'rgba(255,255,255,.02)',
                      border: `1px solid ${sel ? GOLD : '#2a2520'}`, color: sel ? '#f0e8d8' : '#cdc4b2' }}>
                    <span style={{ color: sel ? GOLD : '#8a8278', fontWeight: 600, marginRight: 8 }}>{o.key}</span>{o.text}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <button onClick={submitQuiz} disabled={busy} style={{ width: '100%', marginTop: 6, padding: 15, borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 15, fontWeight: 700, letterSpacing: 2, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '評分中…' : '交卷'}</button>
      </div>
    )
  }

  // ── 列表頁 ──
  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '40px 0 20px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', marginBottom: 12 }}>
          <GraduationCap size={22} color={GOLD} />
        </div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>教育訓練與考核</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 3, marginTop: 4 }}>TRAINING & ASSESSMENT</div>
      </div>

      {/* 教官現場考核專區（Daniel/Ricky）*/}
      {trainer?.is_trainer && (
        <div style={{ marginBottom: 16, padding: 16, borderRadius: 14, background: 'rgba(100,140,170,.07)', border: '1px solid rgba(100,140,170,.3)' }}>
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 14, color: '#7fa0bd', marginBottom: 4 }}>🧑‍🏫 教官現場考核專區</div>
          <div style={{ fontSize: 11, color: '#888078', marginBottom: 10 }}>下列同仁已通過線上測驗，請現場帶他操作 SIMPOS、確認無誤後簽核：</div>
          {trainer.pending.length === 0
            ? <div style={{ fontSize: 12, color: '#5a554e', padding: '6px 0' }}>目前沒有待現場考核的同仁。</div>
            : trainer.pending.map(p => (
              <div key={p.employee_id + p.module_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(201,168,76,.06)' }}>
                <span style={{ fontSize: 13, color: '#e8e0d0' }}>{p.name}<span style={{ fontSize: 11, color: '#888078', marginLeft: 8 }}>{p.module}</span></span>
                <button onClick={() => fieldSignoff(p.employee_id, p.module_id, p.name)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(100,140,170,.5)', background: 'rgba(100,140,170,.12)', color: '#7fa0bd', cursor: 'pointer', fontFamily: 'Noto Serif TC,serif' }}>✍ 現場考核簽核</button>
              </div>
            ))}
        </div>
      )}

      {mods.length === 0 && <div style={{ textAlign: 'center', color: '#5a554e', padding: '40px 0', fontFamily: 'Noto Serif TC,serif' }}>目前尚無培訓課程</div>}

      {mods.map(m => (
        <div key={m.id} style={{ background: 'linear-gradient(160deg,rgba(22,18,14,.92),rgba(12,10,8,.96))', border: `1px solid ${m.passed ? 'rgba(100,170,100,.25)' : 'rgba(201,168,76,.12)'}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
            <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 16, fontWeight: 500, color: '#f0e8d8', flex: 1 }}>{m.title}</div>
            {m.passed && m.requires_field_exam && !m.signed_off
              ? <span style={{ fontSize: 11, color: '#d68c46', whiteSpace: 'nowrap' }}>線上通過 · 待現場考核</span>
              : m.passed
                ? <span style={{ fontSize: 11, color: '#7faa7f', whiteSpace: 'nowrap' }}><CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> 已通過 {m.best_percent}分</span>
                : m.attempts > 0
                  ? <span style={{ fontSize: 11, color: '#d68c46', whiteSpace: 'nowrap' }}>未通過（最高 {m.best_percent || 0}分）</span>
                  : <span style={{ fontSize: 11, color: '#8a8278', whiteSpace: 'nowrap' }}>未測驗</span>}
          </div>
          {m.requires_field_exam && <div style={{ fontSize: 10.5, color: '#7fa0bd', marginBottom: 8 }}>🧑‍🏫 此模組需線上測驗 + 教官（Daniel／Ricky）現場操作考核簽核</div>}
          {m.description && <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 12, color: '#888078', lineHeight: 1.6, marginBottom: 10 }}>{m.description}</div>}
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#6a655c', marginBottom: 12, fontFamily: 'JetBrains Mono,monospace' }}>
            <span>{m.question_count} 題</span><span>及格 {m.pass_score} 分</span>{m.attempts > 0 && <span>已考 {m.attempts} 次</span>}{m.wrong_count > 0 && <span style={{ color: '#d68c46' }}>錯題 {m.wrong_count}</span>}
          </div>
          {m.signed_off && <div style={{ fontSize: 11, color: '#7faa7f', marginBottom: 10 }}>✍ 現場考核已簽核{m.last_trainer ? `（${m.last_trainer}）` : ''}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            {(m.has_material || m.pdf_url) && <button onClick={() => openMaterial(m)} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 9, background: 'transparent', border: '1px solid #2a2520', color: '#a89f90', fontSize: 13, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif' }}><FileText size={13} style={{ verticalAlign: -2, marginRight: 5 }} />培訓教材</button>}
            <button onClick={() => startQuiz(m)} disabled={busy} style={{ flex: 1.4, padding: 11, borderRadius: 9, border: 'none', background: m.passed ? 'rgba(201,168,76,.1)' : `linear-gradient(135deg,${GOLD},#a8863a)`, color: m.passed ? GOLD : '#0f0d0a', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif' }}>{m.attempts > 0 ? '重新測驗' : '開始測驗'}</button>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: '#6a655c', textAlign: 'center', padding: '12px 0', lineHeight: 1.7 }}>線上測驗及格後，需由現場培訓人完成現場考核簽核，方為完成。</div>
    </div>
  )
}
