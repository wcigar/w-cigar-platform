# W Cigar 標籤列印（wcigar-label-print）

辦公室共用列印工具（TSC DH220 熱感標籤機，40×25mm），單一靜態 HTML 頁面，無建置流程。

- 線上網址：https://wcigar-label-print.vercel.app/
- Vercel 專案：`wcigar-label-print`（未串接 Git，用 `vercel deploy` 從本目錄的 `src/` 直接部署）
- 內容：`src/index.html` 就是整個 app（含所有 CSS/JS），`src/vercel.json` 是部署設定（`cleanUrls` + 關閉快取）

## 分頁

食物 / 圖案 / 學習 / 一般 是給所有員工用的日常標籤列印功能。

「報關」分頁另外需要輸入密碼才能打開（點下去會先跳密碼輸入畫面），因為裡面預存了實際報關單的品名／數量／進口國等內部資料，不希望其他員工看到。密碼驗證通過前，這些資料不會被建到畫面 DOM 裡（不是單純用 CSS 藏起來），避免用瀏覽器「檢查元素」也能撈到；但因為整個 app 是純前端純靜態檔案，密碼本身跟 `CUSTOMS_BUNDLE_PRESETS` 陣列还是都寫在 `index.html` 的原始碼裡，用「檢視網頁原始碼」還是找得到——這是純前端工具在沒有後端 API 的情況下的天花板，只能擋住一般同事直接點來看，擋不住刻意想看原始碼的人。如果之後想要更嚴密，需要另外做一個小後端（例如 Supabase Edge Function）來收密碼、驗證通過才回傳報關資料。

## 部署

這個專案沒有接 GitHub 自動部署，改完 `src/index.html` 之後要手動用 Vercel 部署（CLI 或直接呼叫 Vercel API）才會反映到線上網址，單純 `git push` 不會觸發部署。
