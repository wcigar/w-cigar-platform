// 敏感資料存取分級：廠商成本、VIP/客戶名單等「重點資料」只開放正職與主管。
// PT / 外部 / 未設定 emp_type 一律視為受限，看不到全部（防同行派人短期入職撈資料）。
export function canViewSensitive(user) {
  return !!(user && (
    user.is_admin === true ||
    user.role === 'boss' ||
    user.employee_id === 'ADMIN' ||
    user.employee_type === '正職'
  ))
}
