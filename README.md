# W Cigar Bar 營運平台

紳士雪茄館統一營運管理系統 — React + Vite + Supabase

## 功能

### 員工端
- 📋 首頁：今日班別、SOP 進度、GPS 打卡
- ✅ 每日 SOP 任務勾選
- 📦 庫存盤點
- 📊 我的 KPI
- 📅 排班查看 + 線上請假

### 老闆端
- 🏠 管理總覽 Dashboard
- 🏢 營運管理：全員 SOP 進度、公告管理
- 👥 人事排班：拖拉排班表、假單審核
- 💰 薪資財務：勞健保自動計算 (2026費率)、支出管理
- ⚙️ 系統設定：員工 CRUD、薪資參數

## 部署到 Vercel

### 1. 推送到 GitHub
```bash
git init
git add .
git commit -m "W Cigar Bar 營運平台 v1.0"
git remote add origin https://github.com/YOUR_USER/w-cigar-platform.git
git push -u origin main
```

### 2. Vercel 部署
1. 登入 [vercel.com](https://vercel.com)
2. Import Git Repository
3. Framework Preset: Vite
4. 點擊 Deploy

部署完成後會得到 `https://w-cigar-platform.vercel.app` 之類的網址。

### 3. Supabase RLS 設定
在 Supabase Dashboard → SQL Editor 執行：
```sql
-- 允許 anon 讀取 employees (登入驗證用)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON employees FOR SELECT USING (true);

-- 其他表格依需求設定 RLS
-- 建議：開發階段先關閉 RLS，上線後逐步啟用
```

## 技術棧
- React 18 + Vite 5
- Supabase (PostgreSQL + Realtime)
- Lucide Icons
- date-fns
- Framer Motion

## 登入方式
使用 employees 表的 `employee_id` + `pin` 欄位登入。

