import { useState, useEffect, useCallback } from 'react';
import { getStatus, printReceipt, openDrawer } from '../../utils/printer';

/**
 * PrinterSettings — 列印機設定與測試頁面
 * Route: /pos/printer-settings
 */
export default function PrinterSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await getStatus();
      setStatus(data);
      setMessage(
        data.printer === 'online'
          ? '印表機連線正常'
          : '印表機離線，請檢查電源與網路'
      );
    } catch (err) {
      setStatus(null);
      setMessage(`無法連線列印伺服器: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleTestPrint = async () => {
    setLoading(true);
    setMessage('');
    try {
      await printReceipt({
        id: 'TEST',
        items: [
          { name: 'Cohiba Siglo VI', qty: 1, price: 3200 },
          { name: 'Macallan 18yr', qty: 2, price: 800 },
          { name: 'Sparkling Water', qty: 1, price: 120 },
        ],
        subtotal: 4920,
        tax: 246,
        total: 5166,
        payment: 'Credit Card',
        cashier: 'Wilson',
        createdAt: new Date().toLocaleString('zh-TW'),
      });
      setMessage('測試列印成功！請檢查印表機輸出。');
    } catch (err) {
      setMessage(`測試列印失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrawer = async () => {
    setLoading(true);
    setMessage('');
    try {
      await openDrawer();
      setMessage('錢箱已開啟');
    } catch (err) {
      setMessage(`開啟錢箱失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const online = status?.printer === 'online';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>列印機設定</h2>

      {/* Status Card */}
      <div
        style={{
          border: '1px solid #333',
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
          background: '#1a1a1a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: status == null ? '#666' : online ? '#22c55e' : '#ef4444',
            }}
          />
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            {status == null ? '檢查中...' : online ? '印表機在線' : '印表機離線'}
          </span>
        </div>

        {status && (
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.8 }}>
            <div>伺服器狀態: {status.server}</div>
            <div>印表機位址: {status.host}:{status.port}</div>
            <div>最後檢查: {status.timestamp}</div>
          </div>
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: 16,
            borderRadius: 6,
            fontSize: 14,
            background: message.includes('成功') || message.includes('正常') || message.includes('已開啟')
              ? 'rgba(34,197,94,0.15)'
              : 'rgba(239,68,68,0.15)',
            color: message.includes('成功') || message.includes('正常') || message.includes('已開啟')
              ? '#22c55e'
              : '#ef4444',
          }}
        >
          {message}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={fetchStatus} disabled={loading} style={btnStyle}>
          重新檢查連線
        </button>
        <button
          onClick={handleTestPrint}
          disabled={loading || !online}
          style={{ ...btnStyle, background: online ? '#2563eb' : '#333' }}
        >
          測試列印
        </button>
        <button
          onClick={handleOpenDrawer}
          disabled={loading || !online}
          style={{ ...btnStyle, background: online ? '#7c3aed' : '#333' }}
        >
          開啟錢箱
        </button>
      </div>

      {/* Info */}
      <div style={{ marginTop: 32, fontSize: 13, color: '#666', lineHeight: 1.8 }}>
        <p>
          列印伺服器運行在 Raspberry Pi 上，透過 TCP 9100 埠連接熱感式印表機。
          如需更改印表機 IP，請修改 Pi 上的環境變數 <code>PRINTER_HOST</code>。
        </p>
        <p>
          前端連線位址可透過 <code>.env</code> 中的{' '}
          <code>VITE_PRINT_SERVER_URL</code> 設定。
        </p>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '10px 20px',
  borderRadius: 6,
  border: 'none',
  background: '#333',
  color: '#fff',
  fontSize: 14,
  cursor: 'pointer',
  fontWeight: 500,
};
