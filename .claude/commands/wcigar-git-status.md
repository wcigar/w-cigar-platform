---
description: 雙 repo git 狀態紅綠燈 — 揪「以為 vs 實際」差距，預防多 push 點 / stash 失敗 / lock 殘留
---

# 角色定位

你是 W Cigar 的 git 紀律守門員。Wilson 過去 24 小時被「我以為 X 但實際 Y」咬了 3 次（dealer 12 天 git 鴻溝、BossHome 重構漏海關 menu cards、Commission.jsx stash「以為成功實際沒成功」）。

你的任務：**純讀取雙 repo（platform + dealer）狀態，把「想像」跟「現實」的所有差距列在一頁內**。

**這個指令不執行任何 git 寫操作**（commit / push / pull / merge / reset / rebase / stash drop / stash pop / stash apply / stash push 全禁）。`git fetch` 例外，視為「讀遠端 ref」，因為「up to date with origin/main」常常是過期 local 快取。

---

# 工作流程

每一步用顯式 `cd <絕對路徑>`，**不要依賴 bash session 的 cwd 繼承**（這個 bug 在 2026-05-03 早上誤導過分析）。

## Step 0：上次跑記錄（先讀後寫，分兩端）

**讀**（先做，不要寫）：
```powershell
$f = "$env:USERPROFILE\.claude\wcigar-git-status-last-run.timestamp"
if (Test-Path $f) { Get-Content $f } else { "(never)" }
```

計算「距現在多少小時/天」：
- 🟢 < 24 小時：正常頻率
- ⚠️ 24-72 小時：建議每天早上開工跑一次
- 🚨 > 72 小時：久未檢查，異常風險增高
- ⚪ 從未跑過：第一次使用

**寫**：在 Step 6 報告產出**之後**才寫，避免中途 abort 留假紀錄：
```powershell
$ts = Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"
Set-Content -Path "$env:USERPROFILE\.claude\wcigar-git-status-last-run.timestamp" -Value $ts -Encoding utf8
```

## Step 1：雙 repo 同步刷新 + 基本狀態

對 `~/w-cigar-platform` 跟 `~/w-cigar-dealer` 各做（**顯式 cd**）：

```bash
cd <絕對路徑> && \
  git fetch origin --quiet 2>&1 && \
  git branch --show-current && \
  git log -1 --format='%h %ai %s' && \
  git log -1 --format='%h' origin/main && \
  git rev-list --count origin/main..HEAD && \
  git rev-list --count HEAD..origin/main && \
  git status --porcelain | wc -l
```

紅綠燈規則：
- 🟢 branch=main + working tree clean + ahead=0 + behind=0
- ⚠️ branch≠main / behind>0 / working tree dirty
- 🚨 main 上 ahead>0（鐵律：main 不准 push，但本地超前代表已 commit 沒 push 或誤 push 後 reset，必須查）

## Step 2：stash 詳情（含 stat）

對兩 repo 各跑：
```bash
cd <絕對路徑> && git stash list
# 對每筆 stash：
git stash show stash@{N} --stat
```

顯示：
- stash 編號 + base commit short hash + 訊息
- **動到的檔案 + 每檔行數**（這是防「以為 stash 了實際沒」的核心欄位）

紅綠燈：
- 🟢 stash 數 = 0
- ⚠️ stash 數 1-2（不一定壞，但要記得它在）
- 🚨 stash 數 ≥ 3（堆積中，建議清理）

## Step 3：working tree 動態警示（不 hardcode 任何檔名）

對 Step 1 取到的「working tree dirty」檔案逐筆：

```bash
git status --porcelain
```

對每個 modified (`M`) / added (`A`) / untracked (`??`) 檔：

```powershell
(Get-Item <絕對路徑>).LastWriteTime
```

或 bash：
```bash
stat -c '%y %n' <絕對路徑>
```

計算「距現在多少小時 / 天」：
- 🟢 < 24 小時：正常工作中
- ⚠️ 24 小時 - 7 天：留太久，可能忘了
- 🚨 > 7 天：強烈建議 commit / stash / discard，不該繼續晾

**禁止 hardcode 任何特定檔名**（不要寫「Commission.jsx」「StaffHome.jsx」等）— 永遠動態列當下 dirty 檔。

## Step 4：鐵律 #6 違規偵測

掃**第一層**（不遞迴，避免誤觸 node_modules）：

```bash
ls -la ~/ | grep -i "w-cigar"
ls -la ~/Downloads/ | grep -i "w-cigar"
```

判定每個結果：
- ✅ 合法：`~/w-cigar-platform`、`~/w-cigar-dealer`
- ✅ 容忍：`_OLD_*` 開頭的歸檔（不再活動）
- ⚠️ 嫌疑：其他 `w-cigar*` 名字的目錄 → 進一步檢查 `.git/` 是否存在
  - 含 `.git/` → 🚨 **鐵律 #6 違規**，列出 HEAD + 建議歸檔指令
  - 不含 `.git/` → ⚪ 是裸 source / zip 解壓，提及但不警告
- ⚪ 任何 `*.zip` 含 w-cigar 字樣 → 列出 metadata，不警告

## Step 5：lock file 殘留

對兩 repo 檢查：
```bash
ls ~/w-cigar-platform/.git/index.lock 2>/dev/null && echo FOUND
ls ~/w-cigar-dealer/.git/index.lock 2>/dev/null && echo FOUND
```

- 存在 → 🚨 紅字警告「前次 git 操作卡住，**先別動 git 直到查清**」
- 不存在 → 不在報告中提（綠燈無聲）

## Step 6：產出最終報告

格式（一頁、一個 code block 內看完）：

```
# 🔍 W Cigar Git Status — YYYY-MM-DD HH:MM

上次跑：YYYY-MM-DD HH:MM (X 小時前) [紅綠燈]

## 📦 platform (~/w-cigar-platform)
[紅綠燈] branch: main
[紅綠燈] HEAD: <hash> (<date>) <subject>
[紅綠燈] origin/main: <hash> | ahead=N / behind=N
[紅綠燈] working tree: clean / N files dirty
   - <path> (<status>, <age> 前) [紅綠燈]
   ...
[紅綠燈] stash (N)
   - stash@{0} on <base> — <files> (+N 行)
[🚨 only if found] .git/index.lock：殘留 ← 不要動 git！

## 📦 dealer (~/w-cigar-dealer)
（同 platform 格式）

## 🔒 鐵律 #6 違規掃描
[紅綠燈] ~/ 第一層：[結論]
[紅綠燈] ~/Downloads/ 第一層：[結論]
[列出嫌疑項，若有]

## 🎯 建議下一步
- 具體指令 / 動作（不要「請檢查」這種廢話）
- 例：「Commission.jsx 已 1.5 小時未 commit — 是 RLS 工作中？確認後 commit 或保留」

---
✅ 本次純讀取，未動任何 git 狀態。
```

## Step 7：寫入 last-run timestamp

只在 Step 6 報告完整產出後才執行：
```powershell
$ts = Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"
Set-Content -Path "$env:USERPROFILE\.claude\wcigar-git-status-last-run.timestamp" -Value $ts -Encoding utf8
```

---

# 輸出格式範例

```
# 🔍 W Cigar Git Status — 2026-05-03 11:42

上次跑：2026-05-02 19:30 (16 小時前) ✅

## 📦 platform (~/w-cigar-platform)
🟢 branch: main
🟢 HEAD: 8331d60 (2026-05-02 23:06) fix(boss-home): 補回...海關...庫存盤點...
🟢 origin/main: 8331d60 | ahead=0 / behind=0
⚠️ working tree: 1 file dirty
   - src/pages/boss/Commission.jsx (modified, 1.5 小時前) 🟢
⚠️ stash (1)
   - stash@{0} on 34a1a66 — src/pages/staff/StaffHome.jsx (+16 行)

## 📦 dealer (~/w-cigar-dealer)
🟢 branch: main
🟢 HEAD: d16c727 (2026-05-02 17:25) feat: 安裝 W Cigar Claude Code slash commands 完整 7 件套
🟢 origin/main: d16c727 | ahead=0 / behind=0
🟢 working tree: clean
🟢 stash: 0

## 🔒 鐵律 #6 違規掃描
🟢 ~/ 第一層：只有 w-cigar-platform / w-cigar-dealer
✅ ~/Downloads/ 第一層：2 個 _OLD_* 歸檔（容忍）+ 2 個 ⚪ 非 git 裸 source + 5 個 ⚪ zip 備份

## 🎯 建議下一步
- platform Commission.jsx 1.5 小時未 commit — 是 RLS 配套（直查 → RPC）工作中？確認後 commit 或 stash
- platform stash@{0} 還在 — StaffHome 業績階梯卡半成品，要繼續或 drop 請決定

---
✅ 本次純讀取，未動任何 git 狀態。
```

關鍵原則：
- 一頁內看完，無滾動
- 紅綠燈分區（🟢 / ⚠️ / 🚨 / ⚪ / ✅）
- 數字精確（小時 / 天 / 檔案數）
- 「建議下一步」要具體（不要「請檢查」這種廢話）

---

# 禁止事項

- ❌ 不執行 `git commit` / `git push` / `git pull` / `git merge` / `git reset` / `git checkout` / `git rebase` / `git revert`
- ❌ 不執行 `git stash drop` / `git stash pop` / `git stash apply` / `git stash push`
- ❌ 不修改任何 source code 檔
- ❌ 不刪除 `.git/index.lock`（即使偵測到也只警告，不主動清）
- ❌ 不對 `~/Downloads/` 任何資料夾做 `mv` / `rm` / `Rename-Item`
- ❌ 不 hardcode 特定檔名（Commission.jsx / StaffHome.jsx 等）— 永遠動態列當下 dirty 檔
- ❌ 不依賴 bash cwd 繼承 — 每個 git 指令前顯式 `cd <絕對路徑>`
- ✅ 例外：`git fetch origin --quiet` 允許（純讀遠端 ref，避免 origin/main pointer 過期）
- ✅ 例外：寫入 `~/.claude/wcigar-git-status-last-run.timestamp`（指令自己的紀錄檔）
