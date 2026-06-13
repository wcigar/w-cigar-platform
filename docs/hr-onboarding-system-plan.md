# W Cigar 人事系統（員工全生命週期）架構計畫 v1

> 2026-06-13 起草。角色：Claude = 雪茄館人事總監。
> 目標：員工開帳號 → 登入逐步走完 ①建檔 ②上傳證件 ③讀規章 ④培訓 ⑤考核 → 進員工存檔；
> 君姐報勞健保可在後台看完整資料。可複製到二店 / 三店 / 加盟店。
> 來源系統：Netlify「Legacy Elite 員工規章系統」(Firebase project `w-cigar`)，20 章已備份於 `scripts/legacy-elite.html` + `scripts/legacy-firestore.json`。

## 0. 平台現況（已查證）

- **技術**：Vite + React Router SPA（**不是** Next.js）。路由 `src/App.jsx`，員工頁 `src/pages/staff/*`，後台 `src/pages/admin/*`。
- **登入**：PIN → `staff_login` RPC，回 `is_admin` 決定 boss/staff；`_raw.role` 可為 warehouse/supervisor。
  存在 `localStorage.w_cigar_user`（30 天）。**沒有用 Supabase Auth**（沒有 `auth.uid()`）。
- **資料存取**：前端用 **anon key**，多數讀寫直接 `supabase.from()`。
- **既有 onboarding**：`src/pages/admin/Onboarding*.jsx` 存在但 **全是 mock**（`onboarding.js` `USE_MOCK=true`、`OnboardingNew.jsx:24` alert mock）。
- **已設計但未套用**的 onboarding schema 在 `supabase/migrations/2026-04-25_03_payroll_onboarding.sql`（標記 `DRAFT — DO NOT APPLY`，DB 內查無這些表）。內含：
  - `staff_onboarding_profiles`（含 status 機：draft→pending_documents→pending_review→approved→account_created→compensation_configured→training→active）
  - `staff_onboarding_documents`（`document_type` 已含 `id_card`/`bank_book`/`contract`/`nda`/`personal_data_consent`/`training_acknowledgement`，`file_url` + status missing/uploaded/verified/rejected）
  - `staff_onboarding_tasks`、`staff_account_provisioning`
  - **可直接沿用、補欄位即可**，不用重畫。
- **多店基礎**：`stores` 表已存在（1 列）。`venues`(32) 是寄賣酒店≠W 門市。加盟要靠 `stores` 擴 tenant。
- **檔案上傳現況**：全部走 **單一 public bucket `photos`** + `getPublicUrl()`（打卡/清潔/支出/簽名照都在這）。

## 1. 資安漏洞清單（Wilson 指派揪出 / 2026-06-13 稽核）

| # | 嚴重度 | 漏洞 | 影響 | 處置 |
|---|---|---|---|---|
| V1 | 🔴 critical | **59 張表 RLS 關閉**，anon key 全表可讀寫 | 含 `payroll_records`、`gate_pins`(門禁PIN)、`investment_*`(Wilson 持股)、`vip_cabinets/orders/payments/withdrawals`(VIP 金流)、`venue_pricing/sales`(毛利機密)、`customs_*`。anon key 是公開在前端 JS 的 | **不可盲開 RLS**（會炸 venue-hub/VIP/庫存）。在**測試分支**逐表配 policy + 改走 RPC，分批上。見 §6 |
| V2 | 🔴 critical | 所有上傳走 **public bucket** + getPublicUrl | 若身分證/存摺照沿用這套 = 任何人有 URL 即看光國民身分證+銀行帳號（個資法重大） | **新 PII 文件一律走獨立 private bucket + Edge Function 簽名 URL**，永不 getPublicUrl。見 §3 |
| V3 | 🟠 high | 無 Supabase Auth，PIN session 存 localStorage、anon key 公開 | DB 端無法用 `auth.uid()` 做 per-user RLS；敏感操作只能靠 SECURITY DEFINER RPC 傳 actor_id 自行驗證 | 敏感讀寫一律 Edge Function/RPC 驗 PIN+role，不靠前端判斷 |
| V4 | 🟡 med | onboarding 存 `id_number_masked`(末4碼)但報勞健保需完整身分證字號 | 完整字號要嘛不存、要嘛加密存且只 HR 角色經 Edge Function 解 | 設計時決定：完整字號只存證件照(private)、欄位存遮罩；君姐看照片 |

> V1/V2 是**既有平台漏洞**，非本專案造成；但本專案加身分證上傳會**踩中 V2**，所以 PII 文件保險庫必須先做對。

## 2. 員工端流程（要做的主體）

開帳號後，員工登入看到「入職進度」精靈，**逐步解鎖**：

1. **個人建檔** — 姓名/電話/email/地址/生日/緊急聯絡人；報到日。
2. **證件上傳** — 身分證正面、反面、存摺封面（→ private bucket）；簽個資同意書。
3. **規章研讀** — 員工手冊 20 章（§4 手冊中心），逐章標記已讀，關鍵章要「我已詳閱並同意」。
4. **培訓** — 古巴雪茄評鑑 / Capadura / 進階（PDF + 線上測驗），記錄進度。
5. **考核** — 線上測驗（自動評分）+ 現場考核（主管評 pass/fail）。
6. 全綠 → status `active`，進員工存檔，可正式排班。

主管/老闆端：onboarding 看板（誰卡在哪步）、審核證件(verified/rejected)、打現場考核成績、一鍵啟用開帳號。

## 3. PII 文件保險庫（最高優先、最敏感）

- Private bucket `staff-docs`（**非** public，無 public policy）。
- 路徑 `staff-docs/{store_id}/{employee_id}/{doc_type}_{ts}.jpg`。
- **上傳**：Edge Function `staff-doc-upload`（service_role）→ 驗 PIN session + 限本人 → 寫檔 + insert `staff_onboarding_documents`。
- **檢視**：Edge Function `staff-doc-view` → 驗 role（boss / hr）→ 回 60 秒 signed URL。員工本人只能看自己的。
- 前端**永遠拿不到 service_role**、永遠不 getPublicUrl。
- 完整身分證字號不落一般欄位；報勞健保看證件照即可（或加密欄位 + HR Edge Function 解）。

## 4. 員工手冊 / 規章中心（Phase 0，可先獨立上）

- 表 `staff_handbook`(id, chapter_no, category, title, content, tags[], enabled, updated_at)，灌 20 章。
- 頁 `src/pages/staff/StaffHandbook.jsx`：搜尋 + 4 分類 chips + 點卡展開全文 + 內文 Google 連結變按鈕。
- 進入點：StaffHome 大卡 + route `/handbook`。
- 之後成為流程 step ③；download 章節(請假單)未來改接平台原生 LeaveRequest。
- 無 PII、低風險 → **先做這個練手 + 馬上有價值**。

## 4.5 全原生化要求（2026-06-13 Wilson 追加，取消所有 Google）

> 鐵律：**所有原本連 Google 表單/文件/Gemini 的東西，一律改成系統內原生完成**，取消外部連結。

| 原本（外部） | 改成（系統原生） | 模組 |
|---|---|---|
| 請假/調班 Google 表單 | 已有原生 `LeaveRequest`，直接接上 | 表單引擎 |
| 新進員工入職登記表 | 原生建檔精靈（§2 step1） | 表單引擎 |
| 離職交接 Google 表單 | 原生離職交接單 | 表單引擎 |
| 兼職保險聲明書 / 存酒領取單 / 職災各表單 / 福利雪茄領用 | 原生表單 + 記錄入 DB | 表單引擎 |
| 合約 PDF（正職/兼職/NDA/個資/業務競業）下載 | 系統內**閱讀 + 電子簽名**，存簽署版 | 簽署保險庫 |
| 古巴雪茄評鑑 / Capadura / 進階 Gemini 測驗 | 系統內**原生線上測驗**（題庫+自動評分+及格門檻+記錄） | 測驗引擎 |
| 身分證正反面 / 存摺上傳 | 系統內上傳（private bucket，§3） | 文件保險庫 |

**電子簽名（個資同意書 + 保密協議 + 合約）法律存證要求**：
- 簽署時凍結：員工 id、簽名圖、時間戳、IP/裝置、**當下同意的完整條文版本**。
- 產生**簽署版 PDF**（條文全文 + 簽名 + 時間）存 private bucket，**日後法律糾紛可下載原始初簽文件**。
- 依《電子簽章法》成立；法律條文用 Wilson 現有律師版（非自創）。

**保密 / 防資料外流（Wilson 強調）**：
- 入職必簽**保密切結書**：明示不得解讀、外傳、提供同行店家；違者公司**依法追償損害賠償**＋行業聲譽後果。
- ⚠️ 合規修正（人事總監把關）：①「重罰」**不可**設薪資固定扣罰（違勞基法、且抵觸本手冊第22條）→ 一律「依實際損害**法律追償**」。②「同行黑名單」對外**具名列冊散布**有個資法/名譽風險 → 建議**只做系統內嚇阻 + 依法追償**，不建對外黑名單庫。
- 技術防臥底偷資料：敏感資料（證件/簽署文件/薪資）**只 boss/HR(君姐) 可看**、每次檢視/下載寫 `audit_logs`、下載 PDF **浮水印**（檢視者 id+時間），便於追查外流源頭。

## 5. 多店 / 加盟 ready

- 一切員工資料掛 `store_id`（FK `stores`）。
- 加盟：`stores` 加 `tenant_type`(direct/franchise) + `franchise_owner`；onboarding/手冊/培訓可「總部範本 + 分店覆寫」。
- 角色加 `store_scope`：店長只看本店員工、總部看全部。
- 手冊/培訓內容做「全域範本」可被分店 clone（類似 sop_definitions owner 概念）。

## 6. RLS 硬化（獨立 track、測試環境先行）

- 不在 production 盲開。流程：測試分支 → 逐表寫 policy（員工只讀自己、boss/hr 全看）→ 對應前端改走 RPC → smoke test → 分批上 prod。
- 新表（staff_handbook 唯讀 enabled、staff_onboarding_* 透過 Edge Function）**從第一天就配好 RLS**，不進 V1 技術債。

## 7. 分期路線圖

- **Phase 0** 員工手冊中心（§4）— ✅ **2026-06-13 完成**（表 `staff_handbook` 20 章 RLS 鎖唯讀 / `StaffHandbook.jsx` / 首頁入口 / build 過 / 本機 preview 驗證搜尋+分類+展開+連結全通）。**待 Wilson 決定部署方式**。
- **Phase 1** 員工自助建檔 + PII 文件保險庫（§2 step1-2 + §3）— 套 onboarding 表 + private bucket + 2 Edge Function + 員工精靈。**最敏感、要最小心**。
- **Phase 2** 培訓 + 考核（§2 step3-5）。
- **Phase 3** 君姐 HR 後台（報勞健保檢視 / 匯出，role 'hr'）。
- **Phase 4** 多店 / 加盟（§5）。
- **Track S** RLS 硬化（§6，與上面平行、慢慢來）。

## 8. 鐵律（本專案適用）

- 每步 `npm run build` 過才 push（Vercel build 失敗炸 prod）。
- DB 改動先出 SQL 預覽給 Wilson 看。
- 證件/PII 永不進 public bucket、永不 getPublicUrl、永不進員工 LINE 群。
- 合規：菸防法/個資法；員工手冊屬內部、非對外促銷。
- service_role 只在 Edge Function；前端只 anon。
