// w-cigar-platform/src/pages/investment/InvestmentDashboard.jsx
// 路徑：/investment-dashboard
// W Investment Watch | Wilson 投資儀表板

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

function fmtMoney(n) {
  if (n === null || n === undefined) return '-';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '-';
  return num.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}

function fmtPct(n, withSign = true) {
  if (n === null || n === undefined) return '-';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '-';
  return (withSign && num > 0 ? '+' : '') + num.toFixed(2) + '%';
}

function pnlColor(n) {
  if (n === null || n === undefined) return '#888';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num) || num === 0) return '#888';
  return num > 0 ? '#dc2626' : '#15803d';  // 台股慣例:紅漲綠跌
}

const CATEGORY_LABELS = {
  core: { label: '核心', color: '#1d4ed8' },
  underperform: { label: '套牢', color: '#dc2626' },
  defensive: { label: '防禦', color: '#15803d' },
  reference: { label: '參考', color: '#6b7280' },
};

// 前端 PIN 門 — 擋路人，不擋懂技術的人。真正的防線是 Supabase RLS。
const ACCESS_PIN = '85411458';

function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('iw_unlocked') === '1'; } catch { return false; }
  });
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (pin === ACCESS_PIN) {
      try { sessionStorage.setItem('iw_unlocked', '1'); } catch {}
      setUnlocked(true);
    } else {
      setErr(true);
      setPin('');
    }
  }

  if (unlocked) return children;

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <form onSubmit={submit} style={{ background: '#1a1a1a', padding: 32, borderRadius: 8, border: '1px solid #2a2a2a', minWidth: 320, maxWidth: 360, width: '100%' }}>
        <h2 style={{ color: '#b8956a', margin: '0 0 8px', fontSize: 26, fontWeight: 300, letterSpacing: 1, textAlign: 'center' }}>🎩 W Investment Watch</h2>
        <p style={{ color: '#666', fontSize: 15, textAlign: 'center', margin: '0 0 24px' }}>請輸入密碼</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          placeholder="••••••••"
          style={{ width: '100%', padding: 14, background: '#0f0f0f', border: `1px solid ${err ? '#dc2626' : '#2a2a2a'}`, borderRadius: 4, color: '#e5e5e5', fontSize: 21, letterSpacing: 6, textAlign: 'center', boxSizing: 'border-box', outline: 'none' }}
        />
        {err && <div style={{ color: '#dc2626', fontSize: 15, marginTop: 8, textAlign: 'center' }}>密碼錯誤</div>}
        <button type="submit" style={{ width: '100%', marginTop: 16, padding: 12, background: '#b8956a', color: '#1a1a1a', border: 'none', borderRadius: 4, fontSize: 17, fontWeight: 600, cursor: 'pointer', letterSpacing: 1 }}>解鎖</button>
      </form>
    </div>
  );
}

const SORT_OPTIONS = [
  { key: 'danger', label: '🚨 依危險度（距停損）' },
  { key: 'pnl', label: '💰 依損益' },
  { key: 'value', label: '📊 依市值' },
  { key: 'category', label: '🏷️ 依分類' },
];

function sortHoldings(holdings, sortBy) {
  const arr = [...holdings];
  const num = (v) => (v === null || v === undefined ? null : parseFloat(v));
  if (sortBy === 'danger') {
    // 距停損百分比升序；null 擺最後
    return arr.sort((a, b) => {
      const av = num(a.distance_to_stop_pct);
      const bv = num(b.distance_to_stop_pct);
      if (av === null) return 1;
      if (bv === null) return -1;
      return av - bv;
    });
  }
  if (sortBy === 'pnl') {
    return arr.sort((a, b) => (num(b.unrealized_pnl) ?? 0) - (num(a.unrealized_pnl) ?? 0));
  }
  if (sortBy === 'value') {
    return arr.sort((a, b) => (num(b.market_value) ?? 0) - (num(a.market_value) ?? 0));
  }
  if (sortBy === 'category') {
    const order = { underperform: 0, core: 1, defensive: 2, reference: 3 };
    return arr.sort((a, b) => (order[a.category] ?? 99) - (order[b.category] ?? 99));
  }
  return arr;
}

// 簡單 markdown 渲染：只處理 [text](url) link，其餘純文字（白名單，避免 XSS）
function renderMarkdownLite(text) {
  if (!text) return null;
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIdx = 0;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push({ link: { text: m[1], url: m[2] } });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.map((p, i) =>
    typeof p === 'string' ? <span key={i}>{p}</span> :
    <a key={i} href={p.link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline', wordBreak: 'break-all' }}>{p.link.text}</a>
  );
}

// 套牢回本所需漲幅：若現價 = 成本 × (1+r)，回本需 1/(1+r) - 1
function requiredRecoveryPct(returnPct) {
  if (returnPct === null || returnPct === undefined) return null;
  const r = parseFloat(returnPct) / 100;
  if (isNaN(r) || r >= 0) return null;
  return ((1 / (1 + r)) - 1) * 100;
}

// 進出場建議：用既有 stop_loss / take_profit + 現價 + 報酬率 算
// urgency 越大代表越該注意（達停損/停利優先擺前）
function computeAdvice(p) {
  const cur = parseFloat(p.current_price || 0);
  const stop = parseFloat(p.stop_loss || 0);
  const profit = parseFloat(p.take_profit || 0);
  const ret = parseFloat(p.return_pct || 0);
  const distStop = p.distance_to_stop_pct === null || p.distance_to_stop_pct === undefined ? null : parseFloat(p.distance_to_stop_pct);
  const distTarget = p.distance_to_target_pct === null || p.distance_to_target_pct === undefined ? null : parseFloat(p.distance_to_target_pct);

  // 建議買入 (加碼點): 避開停損下方 — 取 max(現價 -10%, 停損 +5%)
  let buyPrice = null;
  if (cur > 0) {
    const a = cur * 0.9;
    const b = stop > 0 ? stop * 1.05 : 0;
    buyPrice = Math.max(a, b);
  }
  // 建議賣出: 你設的停利價、或預設現價 +20%
  const sellPrice = profit > 0 ? profit : (cur > 0 ? cur * 1.2 : null);
  const sellIsDefault = profit <= 0;

  // 狀態 + 急迫度 (0=持有, 越大越緊急)
  let status, color, urgency;
  if (profit > 0 && cur >= profit) {
    status = '🎯 達停利 考慮出場'; color = '#dc2626'; urgency = 100;
  } else if (stop > 0 && cur <= stop) {
    status = '🚨 達停損 應出場'; color = '#dc2626'; urgency = 100;
  } else if (distStop !== null && distStop < 5) {
    status = '⚠️ 接近停損'; color = '#f59e0b'; urgency = 90;
  } else if (distTarget !== null && distTarget < 10) {
    status = '⏰ 接近停利'; color = '#15803d'; urgency = 80;
  } else if (ret < -30) {
    status = '📉 深度套牢 重新評估'; color = '#dc2626'; urgency = 70;
  } else if (ret < -15) {
    status = '🔻 套牢中'; color = '#f59e0b'; urgency = 50;
  } else if (ret > 20) {
    status = '📈 大幅獲利'; color = '#15803d'; urgency = 30;
  } else if (ret > 5) {
    status = '📈 獲利中'; color = '#15803d'; urgency = 20;
  } else if (ret < -5) {
    status = '🔻 小幅虧損'; color = '#f59e0b'; urgency = 15;
  } else {
    status = '— 持有'; color = '#888'; urgency = 10;
  }

  return { buyPrice, sellPrice, sellIsDefault, status, color, urgency, distStop, distTarget };
}

// 具體動作：賣幾張 / 時機（會考慮即將除息）
function computeAction(p, adv, nextDiv) {
  const shares = parseInt(p.shares || 0);
  const lots = Math.floor(shares / 1000);
  const lotOneThird = Math.max(1, Math.round(lots / 3));
  const lotQuarter = Math.max(1, Math.round(lots / 4));
  const stop = parseFloat(p.stop_loss || 0);
  const profit = parseFloat(p.take_profit || 0);
  const ret = parseFloat(p.return_pct || 0);
  const daysToDiv = nextDiv?.days_until_ex;
  const exDate = nextDiv?.ex_date;
  const cashDiv = parseFloat(nextDiv?.cash_dividend || 0);
  const divPayout = parseFloat(nextDiv?.estimated_cash_payout || 0);

  // 即將除息且金額有意義 (>NT$3000) — 接近停利的優先建議過息
  const divIncentive = daysToDiv !== null && daysToDiv !== undefined && daysToDiv >= 0 && daysToDiv <= 30 && divPayout >= 3000 && exDate;

  // 達停利
  if (profit > 0 && parseFloat(p.current_price) >= profit) {
    return { action: `分批停利 → 先賣 ${lotOneThird} 張`, when: '立即（已達停利價）', urgency: 'high' };
  }
  // 達停損
  if (stop > 0 && parseFloat(p.current_price) <= stop) {
    return { action: `全清 ${lots} 張`, when: '立即（已達停損價）', urgency: 'high' };
  }
  // 接近停損
  if (adv.distStop !== null && adv.distStop < 5) {
    return { action: `全清 ${lots} 張`, when: `達 ${stop.toFixed(2)} 元觸發`, urgency: 'high' };
  }
  // 接近停利
  if (adv.distTarget !== null && adv.distTarget < 10) {
    if (divIncentive) {
      return { action: `分批 → 賣 ${lotOneThird} 張`, when: `過 ${exDate} 息後（享 NT$ ${Math.round(divPayout).toLocaleString()}）`, urgency: 'med' };
    }
    return { action: `分批 → 賣 ${lotOneThird} 張`, when: `達 ${profit.toFixed(2)} 元觸發`, urgency: 'med' };
  }
  // 深套牢
  if (ret < -30) {
    if (divIncentive) {
      return { action: `先過息再評估`, when: `過 ${exDate} 息後（NT$ ${Math.round(divPayout).toLocaleString()}）`, urgency: 'med' };
    }
    return { action: `認賠換股 → 賣 ${lotOneThird} 張`, when: '評估基本面後', urgency: 'med' };
  }
  // 套牢中 -15% ~ -30%
  if (ret < -15) {
    return { action: '持有觀察', when: '下次季報', urgency: 'low' };
  }
  // 大幅獲利
  if (ret > 20) {
    if (divIncentive) {
      return { action: `先持有 → 過息再鎖利`, when: `過 ${exDate} 息後（NT$ ${Math.round(divPayout).toLocaleString()}）`, urgency: 'low' };
    }
    return { action: `達停利鎖利 ${lotQuarter} 張`, when: profit > 0 ? `達 ${profit.toFixed(2)} 元觸發` : '持續觀察', urgency: 'low' };
  }
  // 即將除息 — 無論其他狀態，提醒過息
  if (divIncentive) {
    return { action: '持有過息', when: `過 ${exDate} 息（NT$ ${Math.round(divPayout).toLocaleString()}）`, urgency: 'low' };
  }
  // 其他 — 獲利中、小幅虧損、持有
  return { action: '持有觀察', when: '持續監控', urgency: 'low' };
}


// 美股大盤 + AI 龍頭股區塊
function USMarketSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const r = await fetch("https://yzujoxdltvklrehphzsl.supabase.co/functions/v1/us-market-snapshot");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "fetch failed");
      setData(j);
      setError(null);
    } catch (e) {
      setError(e.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  function pctColor(pct) {
    if (pct == null) return "#999";
    return pct >= 0 ? "#ef5350" : "#26a69a";
  }
  function fmtPct(pct) {
    if (pct == null || isNaN(pct)) return "—";
    return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
  }
  function fmtPrice(p) {
    if (p == null || isNaN(p)) return "—";
    return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const indices = (data?.indices || []).filter(x => ["^DJI","^IXIC","^SOX"].includes(x.symbol));
  const leaders = data?.ai_leaders || [];

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e5e5e5", margin: 0 }}>
          🇺🇸 美股大盤 ＋ AI 龍頭
        </h2>
        <span style={{ fontSize: 11, color: "#666" }}>
          {data?.synced_at ? new Date(data.synced_at).toLocaleTimeString("zh-TW", { hour12: false }) : ""}
          {loading && " · 載入中"}
        </span>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#3a1a1a", border: "1px solid #c44d4d", borderRadius: 8, color: "#ff8a80", fontSize: 13, marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {/* 三大指數 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
        {indices.map(idx => {
          const q = idx.quote || {};
          const pct = q.change_pct;
          const chg = q.change;
          return (
            <div key={idx.symbol} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{idx.short}</div>
              <div style={{ fontSize: 13, color: "#ccc", marginBottom: 8 }}>{idx.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e5e5e5", letterSpacing: 0.3 }}>
                {fmtPrice(q.price)}
              </div>
              <div style={{ fontSize: 13, color: pctColor(pct), marginTop: 4, fontWeight: 600 }}>
                {chg != null && (chg >= 0 ? "▲ " : "▼ ") + Math.abs(chg).toFixed(2)} ({fmtPct(pct)})
              </div>
              {q.market_state && (
                <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>{q.market_state}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI 龍頭 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {leaders.map(s => {
          const q = s.quote || {};
          const pct = q.change_pct;
          return (
            <div key={s.symbol} style={{ background: "#161616", border: "1px solid #262626", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e5e5" }}>{s.symbol}</span>
                <span style={{ fontSize: 10, color: "#777" }}>{s.tag}</span>
              </div>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>{s.label}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{fmtPrice(q.price)}</span>
                <span style={{ fontSize: 11, color: pctColor(pct), fontWeight: 600 }}>{fmtPct(pct)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvestmentDashboardInner() {
  const [positions, setPositions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('danger');
  const [showRecovery, setShowRecovery] = useState(false);
  const [showAdvice, setShowAdvice] = useState(true);
  const [dividends, setDividends] = useState([]);
  const [showDividends, setShowDividends] = useState(true);
  const [divSyncing, setDivSyncing] = useState(false);
  const [divSyncMsg, setDivSyncMsg] = useState('');
  const [expandedAlerts, setExpandedAlerts] = useState({});
  const [analyzingAlerts, setAnalyzingAlerts] = useState({});
  const [news, setNews] = useState([]);
  const [showNews, setShowNews] = useState(true);
  const [newsSyncing, setNewsSyncing] = useState(false);
  const [newsSyncMsg, setNewsSyncMsg] = useState('');
  const [financials, setFinancials] = useState([]);
  const [showFinancials, setShowFinancials] = useState(true);
  const [finSyncing, setFinSyncing] = useState(false);
  const [finSyncMsg, setFinSyncMsg] = useState('');
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  async function loadData() {
    setLoading(true);
    try {
      const [posRes, sumRes, alertRes, divRes, newsRes, finRes] = await Promise.all([
        supabase.from('investment_portfolio_summary').select('*'),
        supabase.from('investment_account_summary').select('*').single(),
        supabase
          .from('investment_alerts')
          .select('*')
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('investment_upcoming_dividends').select('*'),
        supabase
          .from('investment_news')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(60),
        supabase.from('investment_latest_financials').select('*'),
      ]);
      if (posRes.data) setPositions(posRes.data);
      if (sumRes.data) setSummary(sumRes.data);
      if (alertRes.data) setAlerts(alertRes.data);
      if (divRes.data) setDividends(divRes.data);
      if (newsRes.data) setNews(newsRes.data);
      if (finRes.data) setFinancials(finRes.data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Load error:', e);
    }
    setLoading(false);
  }

  async function deleteDividend(id) {
    if (!confirm('刪除這筆除權息資料？')) return;
    const { error } = await supabase.from('investment_dividends').delete().eq('id', id);
    if (error) {
      alert('刪除失敗：' + error.message);
      return;
    }
    await loadData();
  }

  async function analyzeAlert(alertId, hasAnalysis) {
    // 已有分析 → 純展開/折疊
    if (hasAnalysis) {
      setExpandedAlerts((s) => ({ ...s, [alertId]: !s[alertId] }));
      return;
    }
    // 沒有分析 → 呼叫 EF
    setAnalyzingAlerts((s) => ({ ...s, [alertId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('investment-analyze-alert', { body: { alert_id: alertId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || '未知錯誤');
      await loadData();
      setExpandedAlerts((s) => ({ ...s, [alertId]: true }));
    } catch (e) {
      alert('分析失敗：' + (e.message || e));
    }
    setAnalyzingAlerts((s) => ({ ...s, [alertId]: false }));
  }

  async function syncFinancials() {
    setFinSyncing(true);
    setFinSyncMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('investment-fetch-fundamentals', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || '未知錯誤');
      setFinSyncMsg(`✓ 同步 ${data.inserted} 檔財報 (TWSE 損益表)`);
      await loadData();
    } catch (e) {
      setFinSyncMsg('❌ 同步失敗：' + (e.message || e));
    }
    setFinSyncing(false);
  }

  async function syncNews() {
    setNewsSyncing(true);
    setNewsSyncMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('investment-fetch-news', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || '未知錯誤');
      const symbols = Object.keys(data.by_symbol || {});
      setNewsSyncMsg(`✓ 同步 ${data.inserted} 則新聞，${symbols.length} 檔有更新`);
      await loadData();
    } catch (e) {
      setNewsSyncMsg('❌ 同步失敗：' + (e.message || e));
    }
    setNewsSyncing(false);
  }

  async function syncDividends() {
    setDivSyncing(true);
    setDivSyncMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('investment-sync-dividends', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || '未知錯誤');
      const parts = [];
      parts.push(`✓ 已同步 ${data.synced} 檔`);
      if (data.skipped_no_dividend?.length) parts.push(`不配息 ${data.skipped_no_dividend.length} 檔`);
      if (data.not_in_twse?.length) parts.push(`ETF/未公告 ${data.not_in_twse.length} 檔`);
      setDivSyncMsg(parts.join(' · '));
      await loadData();
    } catch (e) {
      setDivSyncMsg('❌ 同步失敗：' + (e.message || e));
    }
    setDivSyncing(false);
  }

  async function refreshPrices() {
    setRefreshing(true);
    try {
      await supabase.functions.invoke('investment-fetch-prices', { body: {} });
      // 等 2 秒讓資料寫入
      await new Promise((r) => setTimeout(r, 2000));
      await loadData();
    } catch (e) {
      console.error('Refresh error:', e);
    }
    setRefreshing(false);
  }

  useEffect(() => {
    loadData();
    // 每 60 秒自動刷新一次 (從資料庫讀，不打 Yahoo)
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  // 偵測新 alert → 跳通知
  useEffect(() => {
    if (notifPermission !== 'granted' || alerts.length === 0) return;
    const lastSeen = parseInt(localStorage.getItem('iw_last_alert_id') || '0');
    const newAlerts = alerts.filter((a) => a.id > lastSeen);
    newAlerts.forEach((a) => {
      let title;
      if (a.alert_type === 'big_drop') title = `🚨 快評估賣出 / 停損`;
      else if (a.alert_type === 'big_rise') title = `🎯 快評估獲利了結`;
      else title = `⚠️ 警示：${a.alert_type}`;
      try {
        new Notification(title, {
          body: a.message,
          icon: '/favicon.ico',
          tag: `alert-${a.id}`,
          requireInteraction: a.alert_level === 'critical',
        });
      } catch (_) {}
    });
    if (newAlerts.length > 0) {
      const maxId = Math.max(...alerts.map((a) => a.id));
      localStorage.setItem('iw_last_alert_id', String(maxId));
    }
  }, [alerts, notifPermission]);

  // 偵測達停利/停損 → 跳通知（純前端 derive、不需後端 alert）
  useEffect(() => {
    if (notifPermission !== 'granted' || positions.length === 0) return;
    const triggered = (() => {
      try { return JSON.parse(localStorage.getItem('iw_triggered_actions') || '{}'); }
      catch { return {}; }
    })();
    const now = Date.now();
    const COOLDOWN = 30 * 60 * 1000; // 30 分鐘同一檔同一事件只通知 1 次

    positions.filter((p) => p.shares > 0).forEach((p) => {
      const cur = parseFloat(p.current_price);
      const profit = parseFloat(p.take_profit);
      const stop = parseFloat(p.stop_loss);
      if (!cur) return;
      // 達停利
      if (profit > 0 && cur >= profit) {
        const key = `${p.symbol}:hit_profit`;
        if (!triggered[key] || now - triggered[key] > COOLDOWN) {
          try {
            new Notification(`🎯 快賣！${p.symbol} ${p.name} 達停利`, {
              body: `現價 ${cur.toFixed(2)} 元 ≥ 停利 ${profit.toFixed(2)} 元 — 考慮分批了結`,
              icon: '/favicon.ico',
              tag: `profit-${p.symbol}`,
              requireInteraction: true,
            });
          } catch (_) {}
          triggered[key] = now;
        }
      }
      // 達停損
      if (stop > 0 && cur <= stop) {
        const key = `${p.symbol}:hit_stop`;
        if (!triggered[key] || now - triggered[key] > COOLDOWN) {
          try {
            new Notification(`🚨 快停損！${p.symbol} ${p.name} 跌破停損`, {
              body: `現價 ${cur.toFixed(2)} 元 ≤ 停損 ${stop.toFixed(2)} 元 — 應出場`,
              icon: '/favicon.ico',
              tag: `stop-${p.symbol}`,
              requireInteraction: true,
            });
          } catch (_) {}
          triggered[key] = now;
        }
      }
    });
    try { localStorage.setItem('iw_triggered_actions', JSON.stringify(triggered)); }
    catch (_) {}
  }, [positions, notifPermission]);

  async function requestNotifications() {
    if (typeof Notification === 'undefined') {
      alert('此瀏覽器不支援桌面通知');
      return;
    }
    const p = await Notification.requestPermission();
    setNotifPermission(p);
    if (p === 'granted') {
      try {
        new Notification('🔔 通知已啟用', {
          body: 'W Investment Watch — 達停利停損、大跌大漲時會主動提醒',
          icon: '/favicon.ico',
        });
      } catch (_) {}
    }
  }

  const allHoldings = positions.filter((p) => p.shares > 0);
  const holdings = sortHoldings(allHoldings, sortBy);
  const references = positions.filter((p) => p.category === 'reference');
  const underwaterHoldings = allHoldings
    .filter((p) => parseFloat(p.return_pct) < 0)
    .sort((a, b) => parseFloat(a.return_pct) - parseFloat(b.return_pct));

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e5e5e5', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: '16px 0', borderBottom: '1px solid #2a2a2a' }}>
          <div>
            <h1 style={{ margin: 0, color: '#b8956a', fontSize: 30, fontWeight: 300, letterSpacing: 1 }}>
              🎩 W Investment Watch
            </h1>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: 15 }}>
              雪茄王子 Wilson Tsai · 最後更新: {lastUpdate ? lastUpdate.toLocaleTimeString('zh-TW') : '載入中'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {notifPermission === 'default' && (
              <button
                type="button"
                onClick={requestNotifications}
                style={{ background: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                title="達停利/停損、大跌大漲時主動推播到桌面"
              >🔔 啟用即時通知</button>
            )}
            {notifPermission === 'granted' && (
              <span style={{ color: '#15803d', fontSize: 14, padding: '6px 10px', background: 'rgba(21, 128, 61, 0.15)', borderRadius: 4 }} title="通知已啟用">🔔 通知已啟用</span>
            )}
            {notifPermission === 'denied' && (
              <span style={{ color: '#dc2626', fontSize: 14, padding: '6px 10px', background: 'rgba(220, 38, 38, 0.15)', borderRadius: 4 }} title="點瀏覽器網址列鎖頭可恢復通知">🔕 通知被封鎖</span>
            )}
            <button
              onClick={refreshPrices}
              disabled={refreshing}
              style={{ background: refreshing ? '#444' : '#b8956a', color: '#1a1a1a', border: 'none', padding: '10px 20px', borderRadius: 6, fontSize: 17, fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer', letterSpacing: 1 }}
            >
              {refreshing ? '抓取中…' : '🔄 立即抓取最新股價'}
            </button>
          </div>
        </div>

        {/* 美股大盤 + AI 龍頭 */}
        <USMarketSection />

        {/* Summary Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Card label="總市值" value={`NT$ ${fmtMoney(summary.total_market_value)}`} />
            <Card label="總成本" value={`NT$ ${fmtMoney(summary.total_cost)}`} subtle />
            <Card
              label="未實現損益"
              value={fmtMoney(summary.total_pnl)}
              sub={fmtPct(summary.total_return_pct)}
              color={pnlColor(summary.total_pnl)}
            />
            <Card
              label="今日損益"
              value={fmtMoney(summary.today_pnl_estimate)}
              color={pnlColor(summary.today_pnl_estimate)}
            />
            <Card label="持股檔數" value={summary.holdings_count} subtle />
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ color: '#fff', fontSize: 17, marginBottom: 12, borderBottom: '1px solid #2a2a2a', paddingBottom: 8 }}>
              🚨 警示中心 ({alerts.length})
            </h2>
            {alerts.map((a) => {
              const hasAnalysis = !!a.analysis;
              const isExpanded = !!expandedAlerts[a.id];
              const isAnalyzing = !!analyzingAlerts[a.id];
              const supportsAnalysis = a.alert_type === 'big_drop' || a.alert_type === 'big_rise';
              return (
                <div
                  key={a.id}
                  style={{
                    background: a.alert_level === 'critical' ? '#7f1d1d' : '#92400e',
                    padding: '12px 16px',
                    marginBottom: 8,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 21, marginRight: 8 }}>{a.alert_level === 'critical' ? '🔴' : '🟡'}</span>
                      <strong style={{ marginRight: 8 }}>{a.alert_type}</strong>
                      <span style={{ fontSize: 16, opacity: 0.95 }}>{a.message}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {supportsAnalysis && (
                        <button
                          type="button"
                          onClick={() => analyzeAlert(a.id, hasAnalysis)}
                          disabled={isAnalyzing}
                          style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '5px 12px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: isAnalyzing ? 'wait' : 'pointer' }}
                        >
                          {isAnalyzing ? '分析中…' : hasAnalysis ? (isExpanded ? '收合 ▲' : '📖 查看分析') : '🔍 分析原因'}
                        </button>
                      )}
                      <span style={{ fontSize: 14, opacity: 0.6, whiteSpace: 'nowrap' }}>
                        {new Date(a.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  {hasAnalysis && isExpanded && (
                    <div style={{ marginTop: 12, padding: 14, background: 'rgba(0,0,0,0.35)', borderRadius: 4, fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#f3f4f6', borderLeft: '3px solid rgba(255,255,255,0.3)' }}>
                      {renderMarkdownLite(a.analysis)}
                      {a.analyzed_at && (
                        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
                          分析時間: {new Date(a.analyzed_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Dividend Calendar */}
        <div style={{ marginBottom: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}>
          <button
            type="button"
            onClick={() => setShowDividends((s) => !s)}
            style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', padding: '14px 16px', textAlign: 'left', fontSize: 17, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>
              💰 除權息日曆
              {dividends.length > 0 && (() => {
                const confirmedTotal = dividends.filter((d) => d.days_until_ex !== null && d.days_until_ex >= 0).reduce((s, d) => s + parseFloat(d.estimated_cash_payout || 0), 0);
                const pendingTotal = dividends.filter((d) => d.ex_date === null).reduce((s, d) => s + parseFloat(d.estimated_cash_payout || 0), 0);
                return (
                  <>
                    <span style={{ color: '#b8956a', fontSize: 15, marginLeft: 12 }} title="已公告除息日的擬議/確定金額加總">
                      已排程 NT$ {fmtMoney(confirmedTotal)}
                    </span>
                    {pendingTotal > 0 && (
                      <span style={{ color: '#666', fontSize: 14, marginLeft: 8 }} title="董事會已擬議但除息日尚未公告">
                        + 待公告 NT$ {fmtMoney(pendingTotal)}
                      </span>
                    )}
                  </>
                );
              })()}
            </span>
            <span style={{ color: '#888', fontSize: 15 }}>{showDividends ? '收合 ▲' : '展開 ▼'}</span>
          </button>
          {showDividends && (
            <div style={{ padding: '0 16px 16px' }}>
              {/* Sync Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '4px 0 12px', borderBottom: '1px solid #2a2a2a', marginBottom: 12 }}>
                <span style={{ color: '#888', fontSize: 14 }}>
                  {divSyncMsg || '點右側按鈕從 TWSE OpenAPI 自動同步台股最新除權息公告'}
                </span>
                <button
                  type="button"
                  onClick={syncDividends}
                  disabled={divSyncing}
                  style={{ background: divSyncing ? '#444' : '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: divSyncing ? 'wait' : 'pointer', letterSpacing: 1 }}
                >
                  {divSyncing ? '同步中…' : '🔄 同步 TWSE'}
                </button>
              </div>
              {dividends.length === 0 ? (
                <p style={{ color: '#666', fontSize: 15, margin: '0 0 16px' }}>
                  尚無除權息資料 — 點上方「🔄 同步 TWSE」一鍵抓取，或手動從下方表單新增
                </p>
              ) : (
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                    <thead>
                      <tr style={{ color: '#888' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>股票</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>除權息日</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>倒數</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>現金股利<br/><span style={{ fontSize: 11, color: '#666' }}>元/股</span></th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>持股</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#b8956a' }}>預估可領</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>發放日</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>狀態</th>
                        <th style={{ padding: '8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividends.map((d) => {
                        const days = d.days_until_ex;
                        const isPast = days !== null && days < 0;
                        const isImminent = days !== null && days >= 0 && days <= 7;
                        const isSoon = days !== null && days > 7 && days <= 14;
                        const isProposed = d.status === 'proposed';
                        const rowBg = isImminent ? 'rgba(245, 158, 11, 0.08)' : 'transparent';
                        return (
                          <tr key={d.id} style={{ borderTop: '1px solid #2a2a2a', opacity: isPast ? 0.5 : 1, background: rowBg }}>
                            <td style={{ padding: '8px' }}>
                              <strong style={{ color: '#fff' }}>{d.symbol}</strong>
                              <span style={{ color: '#666', marginLeft: 6 }}>{d.name}</span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: d.ex_date ? '#e5e5e5' : '#666', fontStyle: d.ex_date ? 'normal' : 'italic' }}>
                              {d.ex_date || '待公告'}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: isImminent ? '#f59e0b' : isSoon ? '#fbbf24' : '#999', fontWeight: (isImminent || isSoon) ? 700 : 400 }}>
                              {days === null ? '-' : isPast ? `已過 ${-days} 天` : isImminent ? `⏰ ${days} 天` : `${days} 天`}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {d.cash_dividend ? parseFloat(d.cash_dividend).toFixed(2) : '-'}
                              {isProposed && (
                                <span title="董事會擬議中，最終金額以股東會通過為準" style={{ color: '#666', fontSize: 12, marginLeft: 4 }}>(擬)</span>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#999' }}>{d.shares?.toLocaleString()}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#b8956a', fontWeight: 600 }}>
                              NT$ {fmtMoney(d.estimated_cash_payout)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#999' }}>{d.payment_date || '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontSize: 14 }}>
                              {d.status === 'paid' ? <span style={{ color: '#15803d' }}>✓ 已發放</span>
                                : d.status === 'proposed' ? <span style={{ color: '#f59e0b' }}>● 董事會擬議</span>
                                : <span style={{ color: '#1d4ed8' }}>● 股東會通過</span>}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => deleteDividend(d.id)}
                                style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 15 }}
                                title="刪除"
                              >✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ color: '#666', fontSize: 13, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
                💡 預估可領 = 持股數 × 現金股利。<strong style={{ color: '#888' }}>「擬議」金額</strong>為董事會通過、待股東會確認；
                <strong style={{ color: '#888' }}>「待公告」</strong>為除息日尚未確定。<br/>
                📡 資料來源：TWSE OpenAPI（公司股利分派情形 t187ap45_L）— 點上方「🔄 同步 TWSE」自動更新。
              </p>
            </div>
          )}
        </div>

        {/* Action Advice — 進出場參考 */}
        {allHoldings.length > 0 && (() => {
          const divMap = {};
          dividends.forEach((d) => {
            // 只保留每檔最近一筆未過期的除息
            if (!divMap[d.symbol] && d.days_until_ex !== null && d.days_until_ex >= 0) {
              divMap[d.symbol] = d;
            }
          });
          const advices = allHoldings.map((p) => {
            const adv = computeAdvice(p);
            const action = computeAction(p, adv, divMap[p.symbol]);
            return { p, adv, action };
          });
          advices.sort((a, b) => b.adv.urgency - a.adv.urgency);
          const urgentCount = advices.filter((a) => a.adv.urgency >= 80).length;
          return (
            <div style={{ marginBottom: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}>
              <button
                type="button"
                onClick={() => setShowAdvice((s) => !s)}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', padding: '14px 16px', textAlign: 'left', fontSize: 17, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  📋 進出場參考
                  {urgentCount > 0 ? (
                    <span style={{ color: '#dc2626', fontSize: 15, marginLeft: 12, fontWeight: 600 }}>
                      ⚠️ {urgentCount} 檔需注意
                    </span>
                  ) : (
                    <span style={{ color: '#888', fontSize: 15, marginLeft: 12 }}>
                      全部持有觀望
                    </span>
                  )}
                </span>
                <span style={{ color: '#888', fontSize: 15 }}>{showAdvice ? '收合 ▲' : '展開 ▼'}</span>
              </button>
              {showAdvice && (
                <div style={{ padding: '0 16px 16px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                    <thead>
                      <tr style={{ color: '#888' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>狀態</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>股票</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>現價</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#15803d' }}>建議買入</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: '#dc2626' }}>建議賣出</th>
                        <th style={{ padding: '8px', textAlign: 'left', color: '#b8956a' }}>建議動作</th>
                        <th style={{ padding: '8px', textAlign: 'left', color: '#b8956a' }}>時機</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advices.map(({ p, adv, action }) => {
                        const actionColor = action.urgency === 'high' ? '#dc2626' : action.urgency === 'med' ? '#f59e0b' : '#15803d';
                        return (
                          <tr key={p.id} style={{ borderTop: '1px solid #2a2a2a', background: adv.urgency >= 90 ? 'rgba(220, 38, 38, 0.08)' : adv.urgency >= 80 ? 'rgba(245, 158, 11, 0.06)' : 'transparent' }}>
                            <td style={{ padding: '8px', color: adv.color, fontWeight: adv.urgency >= 80 ? 700 : 500, whiteSpace: 'nowrap' }}>{adv.status}</td>
                            <td style={{ padding: '8px' }}>
                              <strong style={{ color: '#fff' }}>{p.symbol}</strong>
                              <span style={{ color: '#666', marginLeft: 6 }}>{p.name}</span>
                              <br/>
                              <span style={{ color: '#666', fontSize: 13 }}>持有 {Math.floor(p.shares / 1000)} 張 ({p.shares?.toLocaleString()} 股)</span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{p.current_price ? parseFloat(p.current_price).toFixed(2) : '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#15803d', fontWeight: 600 }}>
                              {adv.buyPrice ? adv.buyPrice.toFixed(2) : '-'}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                              {adv.sellPrice ? adv.sellPrice.toFixed(2) : '-'}
                              {adv.sellIsDefault && <span title="未設停利價，顯示現價 +20% 作為參考" style={{ color: '#666', fontSize: 12, marginLeft: 4 }}>*</span>}
                            </td>
                            <td style={{ padding: '8px', color: actionColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{action.action}</td>
                            <td style={{ padding: '8px', color: '#999', whiteSpace: 'nowrap' }}>{action.when}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p style={{ color: '#666', fontSize: 13, marginTop: 12, marginBottom: 0, lineHeight: 1.7 }}>
                    💡 <strong style={{ color: '#15803d' }}>建議買入</strong> = max(現價 −10%, 停損 +5%)；
                    <strong style={{ color: '#dc2626' }}> 建議賣出</strong> = 你設的停利價（無則現價 +20% 加 <code>*</code>）。<br/>
                    📋 <strong style={{ color: '#b8956a' }}>建議動作</strong>規則：達停利 → 賣 1/3 分批；達停損 → 全清；深套 → 認賠 1/3 換股或先過息；大幅獲利 → 鎖利 1/4；接近停利 → 過息再決定。<br/>
                    🔄 <strong>時時更新</strong>：每 60 秒從 DB 拉最新股價、即時重算所有建議。即將除息（≤30 天 + 領取 ≥NT$3,000）會優先建議「過息再賣」。<br/>
                    ⚠️ 這只是規則參考、非投資建議。法人目標價 / 公司消息 / 財報待後續整合。
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Stock News */}
        {(() => {
          const newsBySymbol = {};
          news.forEach((n) => {
            if (!newsBySymbol[n.symbol]) newsBySymbol[n.symbol] = [];
            newsBySymbol[n.symbol].push(n);
          });
          const symbolsWithNews = Object.keys(newsBySymbol).sort((a, b) => newsBySymbol[b].length - newsBySymbol[a].length);
          const totalNews = news.length;
          const stockNameMap = {};
          positions.forEach((p) => { stockNameMap[p.symbol] = p.name; });

          return (
            <div style={{ marginBottom: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}>
              <button
                type="button"
                onClick={() => setShowNews((s) => !s)}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', padding: '14px 16px', textAlign: 'left', fontSize: 17, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  📰 個股新聞
                  {totalNews > 0 ? (
                    <span style={{ color: '#888', fontSize: 15, marginLeft: 12 }}>
                      {totalNews} 則 · {symbolsWithNews.length} 檔有更新
                    </span>
                  ) : (
                    <span style={{ color: '#888', fontSize: 15, marginLeft: 12 }}>尚無資料</span>
                  )}
                </span>
                <span style={{ color: '#888', fontSize: 15 }}>{showNews ? '收合 ▲' : '展開 ▼'}</span>
              </button>
              {showNews && (
                <div style={{ padding: '0 16px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '4px 0 12px', borderBottom: '1px solid #2a2a2a', marginBottom: 12 }}>
                    <span style={{ color: '#888', fontSize: 14 }}>
                      {newsSyncMsg || '點右側按鈕從鉅亨網抓取最近 150 則台股新聞中與你持股相關的'}
                    </span>
                    <button
                      type="button"
                      onClick={syncNews}
                      disabled={newsSyncing}
                      style={{ background: newsSyncing ? '#444' : '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: newsSyncing ? 'wait' : 'pointer', letterSpacing: 1 }}
                    >
                      {newsSyncing ? '同步中…' : '🔄 同步新聞'}
                    </button>
                  </div>
                  {symbolsWithNews.length === 0 ? (
                    <p style={{ color: '#666', fontSize: 15, margin: '0 0 12px' }}>
                      尚無相關新聞 — 點「🔄 同步新聞」抓取（資料來源：鉅亨網 tw_stock_news）
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                      {symbolsWithNews.map((symbol) => {
                        const list = newsBySymbol[symbol].slice(0, 3);
                        return (
                          <div key={symbol} style={{ background: '#0f0f0f', padding: 12, borderRadius: 6, border: '1px solid #2a2a2a' }}>
                            <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #2a2a2a' }}>
                              <strong style={{ color: '#fff', fontSize: 16 }}>{symbol}</strong>
                              <span style={{ color: '#666', marginLeft: 6, fontSize: 14 }}>{stockNameMap[symbol] || ''}</span>
                              <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>· {newsBySymbol[symbol].length} 則</span>
                            </div>
                            {list.map((n) => (
                              <div key={n.id} style={{ marginBottom: 8 }}>
                                <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color: '#e5e5e5', fontSize: 14, lineHeight: 1.5, textDecoration: 'none' }}>
                                  {n.title}
                                </a>
                                <div style={{ color: '#666', fontSize: 12, marginTop: 2 }}>
                                  {n.source}
                                  {n.published_at && ` · ${new Date(n.published_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' })}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p style={{ color: '#666', fontSize: 13, marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
                    📡 資料來源：鉅亨網 tw_stock_news 分類前 150 則、依新聞自帶的 stock array 精準對應到持股 — 不靠關鍵字、無誤判。<br/>
                    冷門股可能短期內無新聞屬正常。Phase 2 可整合 Yahoo / 經濟日報 擴大涵蓋。
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Financials Summary */}
        {(() => {
          const finMap = {};
          financials.forEach((f) => { finMap[f.symbol] = f; });
          const stocksWithFin = positions.filter((p) => p.shares > 0 && finMap[p.symbol]);
          const lossCount = stocksWithFin.filter((p) => parseFloat(finMap[p.symbol].eps) < 0).length;

          return (
            <div style={{ marginBottom: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}>
              <button
                type="button"
                onClick={() => setShowFinancials((s) => !s)}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', padding: '14px 16px', textAlign: 'left', fontSize: 17, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  📊 基本面 / 財報摘要
                  {financials.length > 0 ? (
                    <>
                      <span style={{ color: '#888', fontSize: 15, marginLeft: 12 }}>{stocksWithFin.length} 檔已更新</span>
                      {lossCount > 0 && (
                        <span style={{ color: '#dc2626', fontSize: 15, marginLeft: 8, fontWeight: 600 }}>
                          ⚠️ {lossCount} 檔虧損
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#888', fontSize: 15, marginLeft: 12 }}>尚無資料</span>
                  )}
                </span>
                <span style={{ color: '#888', fontSize: 15 }}>{showFinancials ? '收合 ▲' : '展開 ▼'}</span>
              </button>
              {showFinancials && (
                <div style={{ padding: '0 16px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '4px 0 12px', borderBottom: '1px solid #2a2a2a', marginBottom: 12 }}>
                    <span style={{ color: '#888', fontSize: 14 }}>
                      {finSyncMsg || '點右側按鈕從 TWSE 損益表 (t187ap14_L) 抓最新季財報 EPS / 營業收入'}
                    </span>
                    <button
                      type="button"
                      onClick={syncFinancials}
                      disabled={finSyncing}
                      style={{ background: finSyncing ? '#444' : '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: finSyncing ? 'wait' : 'pointer', letterSpacing: 1 }}
                    >
                      {finSyncing ? '同步中…' : '🔄 同步財報'}
                    </button>
                  </div>
                  {stocksWithFin.length === 0 ? (
                    <p style={{ color: '#666', fontSize: 15, margin: '0 0 12px' }}>
                      尚無財報資料 — 點「🔄 同步財報」抓取
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                        <thead>
                          <tr style={{ color: '#888' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>股票</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>產業</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>季別</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>EPS<br/><span style={{ fontSize: 11, color: '#666' }}>元/股</span></th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>營收<br/><span style={{ fontSize: 11, color: '#666' }}>千元</span></th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>評級</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stocksWithFin.map((p) => {
                            const f = finMap[p.symbol];
                            const eps = parseFloat(f.eps);
                            const rev = parseFloat(f.revenue || 0);
                            let tag, tagColor;
                            if (eps < 0) { tag = '🔴 虧損'; tagColor = '#dc2626'; }
                            else if (eps < 0.5) { tag = '🟠 微利'; tagColor = '#f59e0b'; }
                            else if (eps < 2) { tag = '🟡 一般'; tagColor = '#fbbf24'; }
                            else if (eps < 5) { tag = '🟢 不錯'; tagColor = '#15803d'; }
                            else { tag = '⭐ 優異'; tagColor = '#15803d'; }
                            return (
                              <tr key={p.symbol} style={{ borderTop: '1px solid #2a2a2a', background: eps < 0 ? 'rgba(220, 38, 38, 0.08)' : 'transparent' }}>
                                <td style={{ padding: '8px' }}>
                                  <strong style={{ color: '#fff' }}>{p.symbol}</strong>
                                  <span style={{ color: '#666', marginLeft: 6 }}>{p.name}</span>
                                </td>
                                <td style={{ padding: '8px', color: '#999' }}>{f.industry || '-'}</td>
                                <td style={{ padding: '8px', textAlign: 'center', color: '#999' }}>{f.fiscal_year}Q{f.fiscal_quarter}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: eps < 0 ? '#dc2626' : eps > 2 ? '#15803d' : '#e5e5e5' }}>
                                  {eps >= 0 ? eps.toFixed(2) : eps.toFixed(2)}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right', color: '#999' }}>
                                  {rev > 0 ? Math.round(rev).toLocaleString() : '-'}
                                </td>
                                <td style={{ padding: '8px', color: tagColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{tag}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p style={{ color: '#666', fontSize: 13, marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
                    📡 資料來源：TWSE OpenAPI t187ap14_L 損益表（最新季）。<br/>
                    💡 評級：⭐ EPS≥5 / 🟢 ≥2 / 🟡 ≥0.5 / 🟠 ≥0 / 🔴 虧損。<br/>
                    ETF (00915) 不發財報、新上市或財報未報送的股票無資料。
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Underwater Recovery Analysis */}
        {underwaterHoldings.length > 0 && (
          <div style={{ marginBottom: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setShowRecovery((s) => !s)}
              style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', padding: '14px 16px', textAlign: 'left', fontSize: 17, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>
                📉 套牢回本分析 <span style={{ color: '#888', fontSize: 15, marginLeft: 8 }}>({underwaterHoldings.length} 檔負損益)</span>
              </span>
              <span style={{ color: '#888', fontSize: 15 }}>{showRecovery ? '收合 ▲' : '展開 ▼'}</span>
            </button>
            {showRecovery && (
              <div style={{ padding: '0 16px 16px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                  <thead>
                    <tr style={{ color: '#888' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>股票</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>成本</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>現價</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>損益%</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>需回本%</th>
                      <th style={{ padding: '8px', textAlign: 'right' }} title="現價再跌 5% 的價位">再跌 5%</th>
                      <th style={{ padding: '8px', textAlign: 'right' }} title="現價再跌 10% 的價位">再跌 10%</th>
                      <th style={{ padding: '8px', textAlign: 'right' }} title="現價再跌 15% 的價位">再跌 15%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {underwaterHoldings.map((p) => {
                      const cost = parseFloat(p.avg_cost);
                      const needPct = requiredRecoveryPct(p.return_pct);
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid #2a2a2a' }}>
                          <td style={{ padding: '8px' }}>
                            <strong style={{ color: '#fff' }}>{p.symbol}</strong>
                            <span style={{ color: '#666', marginLeft: 6 }}>{p.name}</span>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#999' }}>{cost ? cost.toFixed(2) : '-'}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{p.current_price ? parseFloat(p.current_price).toFixed(2) : '-'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{fmtPct(p.return_pct)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                            {needPct !== null ? `+${needPct.toFixed(1)}%` : '-'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#666' }}>{p.current_price ? (parseFloat(p.current_price) * 0.95).toFixed(2) : '-'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#666' }}>{p.current_price ? (parseFloat(p.current_price) * 0.90).toFixed(2) : '-'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#666' }}>{p.current_price ? (parseFloat(p.current_price) * 0.85).toFixed(2) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ color: '#666', fontSize: 14, marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
                  💡 「需回本%」= 從現價回到成本價所需漲幅。套牢越深、回本越難（-50% 需要 +100% 回本）。<br/>
                  「再跌 X%」= 現價往下 5/10/15% 的分批加碼參考點，非建議；攤平有風險，請評估資金與基本面。
                </p>
              </div>
            )}
          </div>
        )}

        {/* Holdings Table */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #2a2a2a', paddingBottom: 8 }}>
          <h2 style={{ color: '#fff', fontSize: 17, margin: 0 }}>
            📊 持股明細 ({holdings.length})
          </h2>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid #2a2a2a', borderRadius: 4, padding: '6px 10px', fontSize: 15, cursor: 'pointer' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#2a2a2a', color: '#999', fontSize: 15 }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>分類</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>股票</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>股數</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>成本價</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>現價</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>今日</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>市值</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>未實現損益</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>距停損</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((p) => {
                const cat = CATEGORY_LABELS[p.category] || { label: p.category, color: '#888' };
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #2a2a2a', fontSize: 16 }}>
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: cat.color, color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 14 }}>
                        {cat.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <strong style={{ color: '#fff' }}>{p.symbol}</strong>
                      <br />
                      <span style={{ color: '#888', fontSize: 14 }}>{p.name}</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{p.shares}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#999' }}>{p.avg_cost ? parseFloat(p.avg_cost).toFixed(2) : '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                      {p.current_price ? parseFloat(p.current_price).toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: pnlColor(p.today_change_pct) }}>
                      {fmtPct(p.today_change_pct)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{fmtMoney(p.market_value)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: pnlColor(p.unrealized_pnl), fontWeight: 600 }}>
                      {fmtMoney(p.unrealized_pnl)}
                      <br />
                      <span style={{ fontSize: 14 }}>{fmtPct(p.return_pct)}</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 15 }}>
                      {p.distance_to_stop_pct !== null && p.distance_to_stop_pct !== undefined ? (
                        <span style={{ color: parseFloat(p.distance_to_stop_pct) < 10 ? '#f59e0b' : '#666' }}>
                          {parseFloat(p.distance_to_stop_pct).toFixed(1)}%
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Market Reference */}
        <h2 style={{ color: '#fff', fontSize: 17, marginBottom: 12, borderBottom: '1px solid #2a2a2a', paddingBottom: 8 }}>
          📈 市場參考指標
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          {references.map((r) => (
            <div key={r.id} style={{ background: '#1a1a1a', padding: 16, borderRadius: 6, border: '1px solid #2a2a2a' }}>
              <div style={{ color: '#999', fontSize: 15 }}>
                {r.name} ({r.symbol})
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6 }}>{r.current_price ? parseFloat(r.current_price).toFixed(2) : '-'}</div>
              <div style={{ color: pnlColor(r.today_change_pct), fontSize: 17, marginTop: 4 }}>{fmtPct(r.today_change_pct)}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ background: '#1a1a1a', padding: 16, borderRadius: 6, marginTop: 24, fontSize: 15, color: '#888', textAlign: 'center', border: '1px solid #2a2a2a' }}>
          ⚠️ 本頁面為資料監控工具，不構成投資建議。所有買賣決策請以自身謹慎評估為主。
          <br />
          資料來源：Yahoo Finance (15 分鐘延遲) · 每 60 秒自動從資料庫讀取最新值
          <br />
          <strong style={{ color: '#b8956a' }}>W Cigar Bar 紳士雪茄館 · Investment Watch v1.0</strong>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, sub, color, subtle }) {
  return (
    <div style={{ background: '#1a1a1a', padding: 16, borderRadius: 8, border: '1px solid #2a2a2a' }}>
      <div style={{ color: '#888', fontSize: 15 }}>{label}</div>
      <div style={{ fontSize: subtle ? 21 : 26, fontWeight: 600, marginTop: 6, color: color || '#fff' }}>{value}</div>
      {sub && <div style={{ color: color || '#888', fontSize: 16, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function InvestmentDashboard() {
  return (
    <PasswordGate>
      <InvestmentDashboardInner />
    </PasswordGate>
  );
}
