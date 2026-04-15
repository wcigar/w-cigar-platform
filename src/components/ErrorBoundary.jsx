import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[WCB Error]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', background: '#0f0d0a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, padding: 24
      }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ color: '#c9a84c', fontSize: 18, fontWeight: 700 }}>
          系統發生錯誤
        </div>
        <div style={{ color: '#666', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
          {this.state.error?.message || '未知錯誤'}
        </div>
        <button
          onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
          style={{
            marginTop: 8, padding: '12px 28px', borderRadius: 12,
            border: 'none', background: '#c9a84c', color: '#1a1410',
            fontSize: 14, fontWeight: 700, cursor: 'pointer'
          }}>
          重新載入
        </button>
        <div style={{ color: '#333', fontSize: 11 }}>
          W Cigar Bar {import.meta.env.VITE_STORE_NAME || '大安總店'} · 如持續發生請聯繫系統管理員
        </div>
      </div>
    )
  }
}
