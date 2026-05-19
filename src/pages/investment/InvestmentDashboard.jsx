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

// 套牢回本所需漲幅：若現價 = 成本 × (1+r)，回本需 1/(1+r) - 1
function requiredRecoveryPct(returnPct) {
  if (returnPct === null || returnPct === undefined) return null;
  const r = parseFloat(returnPct) / 100;
  if (isNaN(r) || r >= 0) return null;
  return ((1 / (1 + r)) - 1) * 100;
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
  const [dividends, setDividends] = useState([]);
  const [showDividends, setShowDividends] = useState(true);
  const [divForm, setDivForm] = useState({ symbol: '', ex_date: '', cash_dividend: '', payment_date: '' });
  const [divSaving, setDivSaving] = useState(false);
  const [divError, setDivError] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const [posRes, sumRes, alertRes, divRes] = await Promise.all([
        supabase.from('investment_portfolio_summary').select('*'),
        supabase.from('investment_account_summary').select('*').single(),
        supabase
          .from('investment_alerts')
          .select('*')
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('investment_upcoming_dividends').select('*'),
      ]);
      if (posRes.data) setPositions(posRes.data);
      if (sumRes.data) setSummary(sumRes.data);
      if (alertRes.data) setAlerts(alertRes.data);
      if (divRes.data) setDividends(divRes.data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Load error:', e);
    }
    setLoading(false);
  }

  async function addDividend(e) {
    e.preventDefault();
    setDivError('');
    if (!divForm.symbol || !divForm.ex_date || !divForm.cash_dividend) {
      setDivError('股票、除權息日、現金股利必填');
      return;
    }
    setDivSaving(true);
    const stock = positions.find((p) => p.symbol === divForm.symbol);
    const { error } = await supabase.from('investment_dividends').insert({
      symbol: divForm.symbol,
      market: stock?.market || 'TW',
      ex_date: divForm.ex_date,
      payment_date: divForm.payment_date || null,
      cash_dividend: parseFloat(divForm.cash_dividend),
      fiscal_year: new Date(divForm.ex_date).getFullYear() - 1,
      status: 'announced',
      source: 'manual',
    });
    setDivSaving(false);
    if (error) {
      setDivError(error.message);
      return;
    }
    setDivForm({ symbol: '', ex_date: '', cash_dividend: '', payment_date: '' });
    await loadData();
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
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            style={{ background: refreshing ? '#444' : '#b8956a', color: '#1a1a1a', border: 'none', padding: '10px 20px', borderRadius: 6, fontSize: 17, fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer', letterSpacing: 1 }}
          >
            {refreshing ? '抓取中…' : '🔄 立即抓取最新股價'}
          </button>
        </div>

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
            {alerts.map((a) => (
              <div
                key={a.id}
                style={{
                  background: a.alert_level === 'critical' ? '#7f1d1d' : '#92400e',
                  padding: '12px 16px',
                  marginBottom: 8,
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontSize: 21, marginRight: 8 }}>{a.alert_level === 'critical' ? '🔴' : '🟡'}</span>
                  <strong style={{ marginRight: 8 }}>{a.alert_type}</strong>
                  <span style={{ fontSize: 16, opacity: 0.95 }}>{a.message}</span>
                </div>
                <span style={{ fontSize: 14, opacity: 0.6 }}>
                  {new Date(a.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
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
              {dividends.length > 0 && (
                <span style={{ color: '#b8956a', fontSize: 15, marginLeft: 12 }}>
                  未來可領 NT$ {fmtMoney(dividends.filter((d) => d.days_until_ex !== null && d.days_until_ex >= 0).reduce((s, d) => s + parseFloat(d.estimated_cash_payout || 0), 0))}
                </span>
              )}
            </span>
            <span style={{ color: '#888', fontSize: 15 }}>{showDividends ? '收合 ▲' : '展開 ▼'}</span>
          </button>
          {showDividends && (
            <div style={{ padding: '0 16px 16px' }}>
              {dividends.length === 0 ? (
                <p style={{ color: '#666', fontSize: 15, margin: '0 0 16px' }}>
                  尚無除權息資料 — 從下方表單新增第一筆（資料來源建議：MOPS 公開資訊觀測站、Goodinfo、券商 App）
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
                        const isSoon = days !== null && days >= 0 && days <= 14;
                        return (
                          <tr key={d.id} style={{ borderTop: '1px solid #2a2a2a', opacity: isPast ? 0.5 : 1 }}>
                            <td style={{ padding: '8px' }}>
                              <strong style={{ color: '#fff' }}>{d.symbol}</strong>
                              <span style={{ color: '#666', marginLeft: 6 }}>{d.name}</span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{d.ex_date || '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: isSoon ? '#f59e0b' : '#999', fontWeight: isSoon ? 600 : 400 }}>
                              {days === null ? '-' : isPast ? `已過 ${-days} 天` : `${days} 天`}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{d.cash_dividend ? parseFloat(d.cash_dividend).toFixed(2) : '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#999' }}>{d.shares?.toLocaleString()}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#b8956a', fontWeight: 600 }}>
                              NT$ {fmtMoney(d.estimated_cash_payout)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#999' }}>{d.payment_date || '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontSize: 14, color: '#666' }}>
                              {d.status === 'paid' ? '✓ 已發放' : d.status === 'proposed' ? '提案中' : '已公告'}
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
              {/* Add Form */}
              <form onSubmit={addDividend} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 12, background: '#0f0f0f', borderRadius: 6, border: '1px dashed #2a2a2a' }}>
                <select
                  value={divForm.symbol}
                  onChange={(e) => setDivForm((f) => ({ ...f, symbol: e.target.value }))}
                  style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid #2a2a2a', borderRadius: 4, padding: '6px 10px', fontSize: 15, minWidth: 160 }}
                >
                  <option value="">— 選股票 —</option>
                  {positions.filter((p) => p.shares > 0).map((p) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol} {p.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={divForm.ex_date}
                  onChange={(e) => setDivForm((f) => ({ ...f, ex_date: e.target.value }))}
                  placeholder="除權息日"
                  style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid #2a2a2a', borderRadius: 4, padding: '6px 10px', fontSize: 15 }}
                />
                <input
                  type="number"
                  step="0.01"
                  value={divForm.cash_dividend}
                  onChange={(e) => setDivForm((f) => ({ ...f, cash_dividend: e.target.value }))}
                  placeholder="現金股利 元/股"
                  style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid #2a2a2a', borderRadius: 4, padding: '6px 10px', fontSize: 15, width: 150 }}
                />
                <input
                  type="date"
                  value={divForm.payment_date}
                  onChange={(e) => setDivForm((f) => ({ ...f, payment_date: e.target.value }))}
                  placeholder="發放日 (選填)"
                  style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid #2a2a2a', borderRadius: 4, padding: '6px 10px', fontSize: 15 }}
                  title="發放日（選填）"
                />
                <button
                  type="submit"
                  disabled={divSaving}
                  style={{ background: divSaving ? '#444' : '#b8956a', color: '#1a1a1a', border: 'none', padding: '7px 16px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: divSaving ? 'wait' : 'pointer' }}
                >
                  {divSaving ? '儲存中…' : '+ 新增'}
                </button>
                {divError && <span style={{ color: '#dc2626', fontSize: 14 }}>{divError}</span>}
              </form>
              <p style={{ color: '#666', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                💡 預估可領 = 持股數 × 現金股利。同一檔同年度不能重複新增（如要改，請先刪除）。
              </p>
            </div>
          )}
        </div>

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
