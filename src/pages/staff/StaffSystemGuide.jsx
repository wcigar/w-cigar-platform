import { useNavigate } from 'react-router-dom'
import { Smartphone, LogIn, Sun, LayoutGrid, ShieldAlert, ChevronRight, Clipboard, Package, Calendar, ShoppingCart, BarChart3, BookOpen, GraduationCap, LogOut, MapPin, Camera } from 'lucide-react'

const GOLD = '#c9a84c'

function Section({ icon, title, eng, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
        <div>
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 16, fontWeight: 500, color: '#f0e8d8' }}>{title}</div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 10, fontStyle: 'italic', color: `${GOLD}55`, letterSpacing: 2 }}>{eng}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

function Step({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(201,168,76,.12)', border: '1px solid rgba(201,168,76,.3)', color: GOLD, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
      <div style={{ flex: 1, fontFamily: 'Noto Serif TC,serif', fontSize: 13.5, color: '#cdc4b2', lineHeight: 1.7, paddingTop: 1 }}>{children}</div>
    </div>
  )
}

export default function StaffSystemGuide() {
  const navigate = useNavigate()

  const NavRow = ({ icon, name, desc, route }) => (
    <div onClick={() => route && navigate(route)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 10, background: 'rgba(255,255,255,.02)', border: '1px solid #2a2520', marginBottom: 8, cursor: route ? 'pointer' : 'default' }}>
      <div style={{ flexShrink: 0, color: GOLD }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 13.5, color: '#e8e0d0' }}>{name}</div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 11, color: '#888078', marginTop: 1 }}>{desc}</div>
      </div>
      {route && <ChevronRight size={15} color="#5a554e" style={{ flexShrink: 0 }} />}
    </div>
  )

  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '40px 0 20px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', marginBottom: 12 }}><Smartphone size={22} color={GOLD} /></div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>新人系統操作指南</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 3, marginTop: 4 }}>SYSTEM ORIENTATION</div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 12, color: '#888078', marginTop: 8, lineHeight: 1.6 }}>開好帳號後，照這份指南操作，就能順利在 W Cigar 上班。</div>
      </div>

      {/* 1. 第一次登入 */}
      <Section icon={<LogIn size={17} color={GOLD} />} title="① 第一次登入 & 入職" eng="FIRST LOGIN">
        <Step n="1">用主管給你的<b style={{ color: '#e8e0d0' }}> PIN 碼</b>登入（帳號=你的名字）。</Step>
        <Step n="2">先完成<b style={{ color: '#e8e0d0' }}>「新人入職流程」</b>五步：個人建檔 → 證件上傳（身分證正反面・存摺）→ 電子簽署（聘用＋保密）→ 讀規章 → 培訓考核。</Step>
        <Step n="3"><b style={{ color: '#d68c46' }}>五步全綠並送出、主管啟用後</b>，你才算正式在職、可以排班上班。</Step>
        <button onClick={() => navigate('/onboarding')} style={{ width: '100%', marginTop: 4, padding: 11, borderRadius: 9, border: `1px solid ${GOLD}`, background: 'rgba(201,168,76,.1)', color: GOLD, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Noto Serif TC,serif' }}>前往新人入職流程 →</button>
      </Section>

      {/* 2. 每日上班 SOP */}
      <Section icon={<Sun size={17} color={GOLD} />} title="② 每日上班 SOP" eng="DAILY ROUTINE">
        <Step n="1"><b style={{ color: '#e8e0d0' }}>上班打卡</b>：到店後在「首頁」按上班打卡，需<MapPin size={12} style={{ verticalAlign: -1 }} /> 開定位（限店內 100m 內）＋<Camera size={12} style={{ verticalAlign: -1 }} /> 自拍。<b style={{ color: '#d68c46' }}>本人打卡，嚴禁代打。</b></Step>
        <Step n="2">看「首頁」<b style={{ color: '#e8e0d0' }}>今日班別、即時行動、待辦任務</b>。</Step>
        <Step n="3">到<b style={{ color: '#e8e0d0' }}>「任務」</b>頁做每日 SOP（清潔、檢查、恆濕櫃溫濕度），逐項<b style={{ color: '#d68c46' }}>真做完才拍照送出打勾</b>。</Step>
        <Step n="4">月底到<b style={{ color: '#e8e0d0' }}>「盤點」</b>盤你負責的雪茄/酒水品項。</Step>
        <Step n="5">有客人就用<b style={{ color: '#e8e0d0' }}>「收銀」</b>點單結帳；晚上依交班＋關帳流程結帳對帳。</Step>
        <Step n="6"><b style={{ color: '#e8e0d0' }}>下班打卡</b>（晚班跨午夜系統會自動接昨天的班）。</Step>
      </Section>

      {/* 3. 各功能導覽 */}
      <Section icon={<LayoutGrid size={17} color={GOLD} />} title="③ 各功能怎麼用" eng="FEATURES">
        <NavRow icon={<Clipboard size={17} />} name="任務（每日 SOP）" desc="每日清潔/檢查、大掃除、交班、請假調班" route="/sop" />
        <NavRow icon={<Package size={17} />} name="盤點" desc="月底庫存盤點你負責的品項" route="/inventory" />
        <NavRow icon={<Calendar size={17} />} name="排班" desc="填下個月的排班偏好" route="/schedule" />
        <NavRow icon={<ShoppingCart size={17} />} name="收銀" desc="點單、結帳、開發票、關帳" route="/pos" />
        <NavRow icon={<BarChart3 size={17} />} name="KPI" desc="看你的績效排行與獎金" route="/kpi" />
        <NavRow icon={<BookOpen size={17} />} name="員工手冊" desc="查規章：加班/特休/獎金/福利…" route="/handbook" />
        <NavRow icon={<GraduationCap size={17} />} name="教育訓練" desc="古巴/CAPADURA/進階 專業測驗（必過）" route="/training" />
        <NavRow icon={<LogOut size={17} />} name="離職交接" desc="要離職時線上填交接單" route="/resign" />
      </Section>

      {/* 4. 鐵則 */}
      <Section icon={<ShieldAlert size={17} color="#d68c46" />} title="④ 系統使用鐵則" eng="GROUND RULES">
        <div style={{ background: 'rgba(214,140,70,.06)', border: '1px solid rgba(214,140,70,.25)', borderRadius: 11, padding: '14px 16px', fontFamily: 'Noto Serif TC,serif', fontSize: 13, color: '#cdc4b2', lineHeight: 1.9 }}>
          • 打卡<b style={{ color: '#d68c46' }}>本人親自</b>，嚴禁代打、冒名。<br />
          • SOP / 盤點<b style={{ color: '#d68c46' }}>真做完才打勾</b>，系統會留紀錄供主管抽查。<br />
          • 客戶資料、會員名單、消費內容、監視器畫面<b style={{ color: '#d68c46' }}>絕不外傳</b>（你已簽保密條款）。<br />
          • 你上傳的身分證/存摺存在<b style={{ color: '#e8e0d0' }}>私密保險庫</b>，只有你和 HR 主管能看，安全無虞。<br />
          • 有突發狀況用「首頁 → 異常回報」拍照即時通報。
        </div>
      </Section>

      <div style={{ textAlign: 'center', padding: '8px 0', fontFamily: 'Cormorant Garamond,serif', fontSize: 10, fontStyle: 'italic', color: 'rgba(201,168,76,.2)', letterSpacing: 4 }}>W CIGAR BAR · 卓越是唯一標準</div>
    </div>
  )
}
