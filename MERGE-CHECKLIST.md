# Merge Checklist — feat/payroll-onboarding

> 文件目的：把目前 PR #1 的 merge 前置條件、apply 順序、QA 結論、rollback 方案完整寫清楚，避免下次合併時資訊散落各處。
>
> 文件版本：v1.0 (2026-04-25)
> PR: https://github.com/wcigar/w-cigar-platform/pull/1
> Branch: `feat/payroll-onboarding`
> Latest commit:`b2e2847`（含商品 template + POS 命名統一 + Capadura 6 款）

---

## 1. 變更範圍總覽

### 新增模組（Phase 1 + 2 + 3）
- 雪茄大使 + 酒店銷售 + 自動補貨 + 總倉出貨 + 大使收貨 + 大使耗材申請 + 督導收帳 + 老闆戰情室 + 異常中心
- Hardening：狀態機、idempotency、ledger 完整性、PIN hash、role scope
- Ambassador Payroll 引擎 + 場域利潤規則 + 會計報表 + 新進人員 onboarding
- Excel-style 矩陣 Key-in（22 台北 + 5 台中 + 商品 POS 命名）

### 統計
- 16 + 18 + 16 = **50 張新表**（migration 01 + 02 + 03）
- **~30 個 RPC**（MVP + Phase 2 草稿）
- **5 個前端 service** + 9 admin 頁 + 1 ambassador 頁
- **大使端**：獨立 session、6 項 bottom nav（無打卡）、AmbassadorGuard
- **權限模型**：boss / staff / warehouse / supervisor / ambassador（5 種）

---

## 2. 商品 Template 對齊 POS 系統

### 台北 22 家
威士登 / 皇家 / 鴻欣 / Focus / 豪昇 / 威晶 / 豪威 / 紫藤 / 總裁 / 中國城 / 香閣 / 百達 / 特蘭斯 / Ｍ男模 / 香水 / 首席 / 新濠(萬豪) / 502男模 / 龍昇 / Flare / 金沙 / 金拿督

**Capadura 6 款（11 家有，價 NT$ 1,000）**：
- Capadura 888 Robusto / 898 Robusto
- Capadura 888 TORO / 898 TORO
- Capadura 888 Torpedo / 898 Torpedo

**中價段 4 款（19 家有，價 NT$ 2,000）**：
- 3T翡翠 / 帕特加斯D4號 / 蒙特二號 / 羅密歐寬丘

### 台中 5 家
紫爵 / 金麗都 / soak / 神話 / pink

紫爵/金麗都/神話：6 款 Capadura
紫爵/金麗都：3T翡翠 / 蒙特二號 / 帕特加斯D4號（NT$ 2,000）
soak/神話：3T翡翠 / 蒙特二號 / 帕特加斯D4號（NT$ 2,200）
pink：店家買斷（capadura 1100 CA）

---

## 3. QA 通過結論

### Preview UAT（commit b2e2847，bundle index-CDqBWBvN.js）
| 測項 | 結果 |
|---|---|
| 17 個新 route 全部 HTTP 200 | ✅ |
| 大使登入頁獨立樣式 | ✅ |
| ambassador_session 結構完整 | ✅ |
| localStorage 兩個 session 物理隔離 | ✅ |
| 大使可進 7 個 ambassador 路由 | ✅ |
| 大使禁止 6 個 admin/warehouse/boss 路由 | ✅（fallback 員工登入頁） |
| `/ambassador/punch` 重導 home | ✅ |
| 薪資頁不顯示他人 / 不顯示公司毛利 | ✅ |
| 登出清乾淨、不污染員工 session | ✅ |
| Console error | ✅ 0 個 |
| POS / VIP / 員工打卡 / w-cigar-dealer | ✅ 零影響 |

### 商品 Matrix Key-in
| 測項 | 結果 |
|---|---|
| 台北 22 家展開 | ✅ |
| 台中 5 家展開 | ✅ |
| 搜尋「威士登」過濾 22→1 | ✅ |
| 「只看有銷售」filter | ✅ |
| 切地區 confirm dialog | ✅ |
| 6 款 Capadura 表頭 | ✅ |
| Pre-shift 獨立區塊 | ✅ |
| Submit + 拆多筆進 list | ✅ |

---

## 4. Merge 前置條件（必做）

下面 8 項全綠才能 merge main：

- [ ] **大使端真實 PIN 登入測試**：用 Supabase ambassadors 表的真實 code + PIN 走完整 RPC 流程
- [ ] **Supabase dev/staging branch apply migration** 順序：
  1. `supabase/migrations/2026-04-25_ambassador_supply_chain.sql`
  2. `supabase/migrations/2026-04-25_02_hardening.sql`
  3. `supabase/migrations/2026-04-25_03_payroll_onboarding.sql`
- [ ] **Supabase dev/staging apply RPC** 順序：
  1. `supabase/rpc/ambassador_supply_chain.sql`
  2. `supabase/rpc/ambassador_supply_chain_v2_hardening.sql`
  3. `supabase/rpc/payroll_onboarding_v1.sql`
- [ ] **填 dev 基礎資料**：3-5 大使（含 pin_hash）+ 2-3 場域 + 對應 compensation_profile + venue_profit_rule
- [ ] **service 切 USE_MOCK=false** 第一批：`ambassadorAuth.js`、`venueSales.js`
- [ ] **Preview 重 build 後再驗一輪** 大使登入 + 矩陣 submit + 戰情室
- [ ] **跟會計 / 督導 / 大使對薪資數字** 無爭議
- [ ] **production DB 手動 apply migration + RPC**（依上面順序，建議 maintenance window）

---

## 5. Merge 操作流程

```powershell
# 確認分支
cd C:\Users\User\Downloads\w-cigar-platform
git checkout feat/payroll-onboarding
git pull origin feat/payroll-onboarding

# 確認 main 沒有衝突
git fetch origin
git merge-base feat/payroll-onboarding origin/main

# Convert PR #1 from Draft → Ready for review (在 GitHub 點按鈕)
# Reviewer approval 後

# 從 GitHub UI 按 Merge pull request（或 Squash and merge）
# Vercel 會自動把 main 部署到 wcigarbar.com

# 本地 sync
git checkout main
git pull origin main
```

⚠️ **警告**：這會立刻把 wcigarbar.com 換成新版。在前 8 項全綠之前**不要走這步**。

---

## 6. Rollback Plan

### 6.1 Production deploy 出問題
```
# Vercel dashboard → Deployments → 找上一個成功的 main commit → 「Promote to Production」
# 或在 GitHub revert merge commit
git checkout main
git revert -m 1 <merge-commit-hash>
git push origin main
# Vercel 自動重 deploy 舊版
```

### 6.2 Migration 出問題
所有 .sql 檔底部都有 rollback script，照貼到 Supabase Studio 跑：
- `2026-04-25_ambassador_supply_chain.sql` 底部 `DROP TABLE / DROP VIEW`
- `2026-04-25_02_hardening.sql` 底部 rollback
- `2026-04-25_03_payroll_onboarding.sql` 底部 rollback

順序倒著來：03 → 02 → 01。

### 6.3 RPC 出問題
RPC 比較好處理 — `DROP FUNCTION ambassador_login(...);` 等，舊 RPC 仍在資料庫不會被影響。

---

## 7. 紅線（永遠不變）

- ❌ 不要碰 `w-cigar-dealer` repo
- ❌ 不要修 POS checkout 流程（`pos/PosApp.jsx`、`pos/PosCheckout.jsx`）
- ❌ 不要破壞 VIP Cellar
- ❌ 不要刪員工打卡（`punch_records` 表、`PunchHistory` 元件）
- ❌ 大使端永遠不加打卡入口
- ❌ 不要直接操作 production DB（先 dev/staging）
- ❌ 不要把真實 PIN / token / password 寫到 chat 或 commit message

---

## 8. Phase 2 待補事項（非阻擋）

### 安全強化
- [ ] **大使薪資 API**：把前端 `find()` 改成 RPC `get_my_payroll_item(p_ambassador_id)`，避免可能的隱私洩漏
- [ ] **大使 PIN bcrypt**：service 端強制 `crypt()` hash，明碼僅在過渡期一次升級
- [ ] **RLS 啟用**：所有 ambassador / payroll 相關表開 RLS（policy 草稿在 migration 02）
- [ ] **rate limit**：登入失敗 5 次鎖定（hardening 02 已寫，但需配置 cron 解鎖）

### UX 改進
- [ ] Matrix 切地區自動重置 search + filter
- [ ] 大使下拉依地區過濾
- [ ] 大使薪資頁加「測試資料」banner（在 USE_MOCK=true 時顯示）
- [ ] Bundle code-split 處理 chunk size > 600 KB warning

### 功能擴充
- [ ] PDF / CSV 匯出會計報表
- [ ] 複製昨天模板 RPC（目前是 alert 占位）
- [ ] Onboarding 文件上傳 RPC
- [ ] Cron：補貨 48h 未 ship、大使 24h 未簽收進 exception_events

---

## 9. 已知小問題（記錄用，不阻擋）

1. **`AmbassadorPayroll.jsx` mock fallback**：`items.find(i => i.ambassador_id === session.id) || items[0]` — 找不到時 fallback 第 1 筆。Mock 階段無風險，Phase 2 改顯示空狀態
2. **chunk size warning**：`index-*.js` ~840 KB > 600 KB 警告線。功能無影響，Phase 2 用 React.lazy 切割
3. **Supabase audit_logs 401**：app boot 時某 hook 嘗試讀 audit_logs 被擋。既有問題，跟本案無關

---

## 10. 重要檔案速查

### Migration / RPC（draft，未 apply）
```
supabase/migrations/2026-04-25_ambassador_supply_chain.sql      (Phase 1)
supabase/migrations/2026-04-25_02_hardening.sql                 (Phase 2)
supabase/migrations/2026-04-25_03_payroll_onboarding.sql        (Phase 3)
supabase/rpc/ambassador_supply_chain.sql                        (Phase 1)
supabase/rpc/ambassador_supply_chain_v2_hardening.sql           (Phase 2)
supabase/rpc/payroll_onboarding_v1.sql                          (Phase 3)
```

### 核心前端
```
src/components/AmbassadorGuard.jsx                              (大使路由守衛)
src/components/AdminGuard.jsx                                   (員工角色守衛)
src/lib/services/ambassadorAuth.js                              (大使登入 service)
src/lib/services/venueSales.js                                  (49 KB，含完整商品 template)
src/lib/services/payroll.js                                     (薪資週期 + 審核)
src/pages/ambassador/AmbassadorLogin.jsx                        (黑金登入頁)
src/pages/ambassador/AmbassadorApp.jsx                          (大使子系統 root)
src/pages/admin/VenueSalesNew.jsx                               (容器：矩陣 / 進階)
src/pages/admin/VenueSalesMatrix.jsx                            (Excel-style 矩陣)
src/pages/admin/VenueSalesDetailed.jsx                          (進階明細模式)
src/App.jsx                                                     (整合路由)
```

### Proposal 文件
```
PROPOSAL-ambassador-phase.md                                    (Phase 1 設計 proposal)
MERGE-CHECKLIST.md                                              (本文件)
```

---

## 11. Preview 與 Production 對照

| 環境 | URL | 對應 commit | 狀態 |
|---|---|---|---|
| **Production** | https://wcigarbar.com | `main` 上最新 commit | 4h 前舊版，未受 PR #1 影響 |
| **Preview (branch alias)** | https://w-cigar-platform-git-feat-payroll-onboarding-wcigars-projects.vercel.app | `feat/payroll-onboarding` HEAD = `b2e2847` | ✅ 已部署，QA 通過 |
| **Dealer** | https://dealer.wcigarbar.com | 另一個 repo (w-cigar-dealer) | 完全沒碰 |

---

## 12. 給未來自己的提醒

- Vercel **branch alias URL 永遠指最新** commit 的 preview。不要再用 `oiw9ydbpt` / `g0p0jvas5` / `2k9intel4` / `Co03i3GM` / `CDqBWBvN` 之類舊 hash URL，會看到舊資料
- `git reset --hard origin/feat/payroll-onboarding` 在某些情況會表面成功但 working tree 沒同步。如果 `ls src/lib/services` 找不到，跑 `git checkout -B feat/payroll-onboarding origin/feat/payroll-onboarding`
- system reminders 裡的「modified file」內容是**本地磁碟**的狀態快照，**跟 Vercel preview 可能不同**（因為 Vercel build 自 GitHub remote）
- 大使的 ambassador_session **永遠跟員工 w_cigar_user 隔離**，兩個 localStorage key 不重疊
- 商品 template 命名要永遠跟 POS 系統一致（3T翡翠 / 帕特加斯D4號 / 蒙特二號 / 羅密歐寬丘 等）

---

**文件結束。Merge 前請從 §4 開始逐項打勾。**
