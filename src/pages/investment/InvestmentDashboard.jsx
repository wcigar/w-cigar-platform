// w-cigar-platform/src/pages/investment/InvestmentDashboard.jsx
// 路徑：/investment-dashboard
// W Investment Watch | Wilson 投資儀表板

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SUPABASE_FUNC_BASE = `${supabaseUrl}/functions/v1`;

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
        <h2 style={{ color: '#b8956a', margin: '0 0 8px', fontSize: 22, fontWeight: 300, letterSpacing: 1, textAlign: 'center' }}>🎩 W Investment Watch</h2>
        <p style={{ color: '#666', fontSize: 12, textAlign: 'center', margin: '0 0 24px' }}>請輸入密碼</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          placeholder="••••••••"
          style={{ width: '100%', padding: 14, background: '#0f0f0f', border: `1px solid ${err ? '#dc2626' : '#2a2a2a'}`, borderRadius: 4, color: '#e5e5e5', fontSize: 18, letterSpacing: 6, textAlign: 'center', boxSizing: 'border-box', outline: 'none' }}
        />
        {err && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8, textAlign: 'center' }}>密碼錯誤</div>}
        <button type="submit" style={{ width: '100%', marginTop: 16, padding: 12, background: '#b8956a', color: '#1a1a1a', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: 1 }}>解鎖</button>
      </form>
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

  async function loadData() {
    setLoading(true);
    try {
      const [posRes, sumRes, alertRes] = await Promise.all([
        supabase.from('investment_portfolio_summary').select('*'),
        supabase.from('investment_account_summary').select('*').single(),
        supabase
          .from('investment_alerts')
          .select('*')
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (posRes.data) setPositions(posRes.data);
      if (sumRes.data) setSummary(sumRes.data);
      if (alertRes.data) setAlerts(alertRes.data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Load error:', e);
    }
    setLoading(false);
  }

  async function refreshPrices() {
    setRefreshing(true);
    try {
      await fetch(`${SUPABASE_FUNC_BASE}/investment-fetch-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
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

  const holdings = positions.filter((p) => p.shares > 0);
  const references = positions.filter((p) => p.category === 'reference');

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e5e5e5', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: '16px 0', borderBottom: '1px solid #2a2a2a' }}>
          <div>
            <h1 style={{ margin: 0, color: '#b8956a', fontSize: 24, fontWeight: 300, letterSpacing: 1 }}>
              🎩 W Investment Watch
            </h1>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: 12 }}>
              雪茄王子 Wilson Tsai · 最後更新: {lastUpdate ? lastUpdate.toLocaleTimeString('zh-TW') : '載入中'}
            </p>
          </div>
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            style={{ background: refreshing ? '#444' : '#b8956a', color: '#1a1a1a', border: 'none', padding: '10px 20px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer', letterSpacing: 1 }}
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
            <h2 style={{ color: '#fff', fontSize: 14, marginBottom: 12, borderBottom: '1px solid #2a2a2a', paddingBottom: 8 }}>
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
                  <span style={{ fontSize: 18, marginRight: 8 }}>{a.alert_level === 'critical' ? '🔴' : '🟡'}</span>
                  <strong style={{ marginRight: 8 }}>{a.alert_type}</strong>
                  <span style={{ fontSize: 13, opacity: 0.95 }}>{a.message}</span>
                </div>
                <span style={{ fontSize: 11, opacity: 0.6 }}>
                  {new Date(a.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Holdings Table */}
        <h2 style={{ color: '#fff', fontSize: 14, marginBottom: 12, borderBottom: '1px solid #2a2a2a', paddingBottom: 8 }}>
          📊 持股明細 ({holdings.length})
        </h2>
        <div style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#2a2a2a', color: '#999', fontSize: 12 }}>
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
                  <tr key={p.id} style={{ borderBottom: '1px solid #2a2a2a', fontSize: 13 }}>
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: cat.color, color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                        {cat.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <strong style={{ color: '#fff' }}>{p.symbol}</strong>
                      <br />
                      <span style={{ color: '#888', fontSize: 11 }}>{p.name}</span>
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
                      <span style={{ fontSize: 11 }}>{fmtPct(p.return_pct)}</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 12 }}>
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
        <h2 style={{ color: '#fff', fontSize: 14, marginBottom: 12, borderBottom: '1px solid #2a2a2a', paddingBottom: 8 }}>
          📈 市場參考指標
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          {references.map((r) => (
            <div key={r.id} style={{ background: '#1a1a1a', padding: 16, borderRadius: 6, border: '1px solid #2a2a2a' }}>
              <div style={{ color: '#999', fontSize: 12 }}>
                {r.name} ({r.symbol})
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{r.current_price ? parseFloat(r.current_price).toFixed(2) : '-'}</div>
              <div style={{ color: pnlColor(r.today_change_pct), fontSize: 14, marginTop: 4 }}>{fmtPct(r.today_change_pct)}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ background: '#1a1a1a', padding: 16, borderRadius: 6, marginTop: 24, fontSize: 12, color: '#888', textAlign: 'center', border: '1px solid #2a2a2a' }}>
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
      <div style={{ color: '#888', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: subtle ? 18 : 22, fontWeight: 600, marginTop: 6, color: color || '#fff' }}>{value}</div>
      {sub && <div style={{ color: color || '#888', fontSize: 13, marginTop: 4 }}>{sub}</div>}
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
