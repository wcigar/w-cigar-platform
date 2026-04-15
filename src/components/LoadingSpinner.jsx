export default function LoadingSpinner({ text = '載入中...' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 40
    }}>
      <div style={{
        width: 36, height: 36,
        border: '3px solid rgba(201,168,76,.2)',
        borderTop: '3px solid #c9a84c',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ color: '#6b5a3a', fontSize: 13 }}>{text}</span>
    </div>
  )
}
