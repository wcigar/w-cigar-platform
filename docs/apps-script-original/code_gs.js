const APP_VERSION = 'W_CIGAR_BAR_V11_LINE';
const DB_ID_KEY = 'WCIGAR_DB_SHEET_ID';
const DEFAULT_DB_ID = '12YpBvwclR4d-TAhuD9PoSo_PVL6iEgcWP-Ro8Nu49oE';
const ADMIN_PASSWORD_KEY = 'WCIGAR_ADMIN_PASSWORD';
const DEFAULT_ADMIN_PASSWORD = '123456';

// LINE Messaging API
const LINE_CHANNEL_TOKEN = '5mTHfVVUCdQ0yTzvAIyy0imeA0OCiI1Q4eyQJD+CYw/IXi92tNJq71AuUSZ2gUjU7zQ0EtLlTxYZKuMBfsvCMTfXXy7Hp5dN5fHpiDskEAs0lxoKSYgSQx8OnPlLB0nj8PMGYSVoisN9MQCInkSVEY9PbdgDzCFqoOLOYbqAITQ=';
const LINE_LOW_STOCK_THRESHOLD = 5;
const LINE_EXPIRY_WARNING_DAYS = 30;
const LINE_TOKEN_KEY = 'WCIGAR_LINE_TOKEN';
const LINE_GROUP_KEY = 'WCIGAR_LINE_GROUP_ID';

const DEFAULT_OPERATOR_ACCOUNTS = [
  { code: '81001', name: '潔西卡', role: 'staff' },
  { code: '81002', name: 'Ricky', role: 'staff' },
  { code: '81003', name: '丹尼爾', role: 'staff' },
  { code: '91001', name: '主管理員', role: 'master' }
];

// ========== 8 張工作表定義 ==========
const SHEET_NAMES = {
  VIPS:       '會員主檔',
  ORDERS:     '訂單總表',
  ORDER_ITEMS:'訂單明細',
  PAYMENTS:   '收款紀錄',
  INVENTORY:  '庫存明細',
  RETRIEVALS: '領取紀錄',
  LOGS:       '操作紀錄',
  STAFF:      '員工帳號'
};

const VIP_HEADERS       = ['會員編號','會員姓名','開櫃日期','現貨總數量','現貨總市值','歷史購買總額','未付尾款','最後更新時間'];
const ORDERS_HEADERS    = ['訂單編號','會員編號','會員姓名','訂單總額','已付金額','未付餘額','訂單狀態','負責員工','建立時間'];
const ORDER_ITEMS_HEADERS = ['訂單編號','雪茄名稱','訂購數量','已入櫃數量','未到貨數量','單價','狀態'];
const PAYMENTS_HEADERS  = ['收款時間','訂單編號','會員編號','收款金額','負責員工','單據照片連結','支付方式','備註'];
const INVENTORY_HEADERS = ['會員編號','櫃位編號','雪茄名稱','數量','入櫃日期','單價','最後更新時間'];
const RETRIEVAL_HEADERS = ['領取時間','會員編號','會員姓名','櫃位編號','雪茄名稱','領取數量','領取後剩餘數量','操作人員','人員代碼','備註','簽名圖檔連結'];
const LOG_HEADERS       = ['時間','操作人員','人員代碼','動作','會員編號','櫃位/訂單編號','異動細節','備註'];
const STAFF_HEADERS     = ['員工代碼','員工姓名','角色','狀態','建立時間'];

// ========== 入口與驗證 ==========
function doGet() {
  ensureDatabase_();
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('W CIGAR BAR VIP 系統')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
function include(f) { return HtmlService.createHtmlOutputFromFile(f).getContent(); }

function verifyAdminPassword(p, op) {
  if (String(p).trim() !== getAdminPassword_()) throw new Error('密碼錯誤');
  return { ok: true };
}
function verifyOperatorCode(c) {
  const op = findOperatorByCode_(String(c).trim());
  if (!op) throw new Error('代碼錯誤');
  return { ok: true, operator: op, message: op.name + ' 已登入' };
}
function changeAdminPassword(currentPwd, newPwd) {
  if (String(currentPwd).trim() !== getAdminPassword_()) throw new Error('目前密碼不正確');
  if (!newPwd || String(newPwd).trim().length < 4) throw new Error('新密碼至少需要 4 個字元');
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_KEY, String(newPwd).trim());
  return { ok: true, message: '密碼已成功更新！' };
}

// ========== 資料讀取 ==========
function getBootstrapData() { ensureDatabase_(); return getAppData(); }

// 手動執行用（在 Apps Script 下拉選單可見）
function refreshAllVipStats() { updateVipStatsInSheet_(); return '會員主檔已更新完成'; }
function runAutoBackup() { return autoBackup(); }
function setupAllTriggers() { setupDailyTrigger(); setupWeeklyBackup(); return '已設定每日檢查 + 每週備份'; }

// ========== 台銀人民幣匯率 ==========
function getCnyExchangeRate() {
  try {
    var url = 'https://rate.bot.com.tw/xrt/fxRateAjax?lang=zh-TW';
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var html = res.getContentText();
    // 找人民幣 CNY 的即期匯率
    var cnyIdx = html.indexOf('人民幣');
    if (cnyIdx === -1) cnyIdx = html.indexOf('CNY');
    if (cnyIdx === -1) throw new Error('找不到人民幣匯率');
    // 從 CNY 位置往後找數字（即期買入和賣出）
    var after = html.substring(cnyIdx);
    var nums = after.match(/[\d]+\.[\d]+/g);
    if (!nums || nums.length < 4) throw new Error('解析匯率失敗');
    // 即期匯率通常是第3和第4個數字（前兩個是現金匯率）
    var cashBuy = parseFloat(nums[0]);
    var cashSell = parseFloat(nums[1]);
    var spotBuy = parseFloat(nums[2]);
    var spotSell = parseFloat(nums[3]);
    var mid = Math.round((spotBuy + spotSell) / 2 * 10000) / 10000;
    return {
      ok: true,
      spotBuy: spotBuy,
      spotSell: spotSell,
      cashBuy: cashBuy,
      cashSell: cashSell,
      mid: mid,
      updated: formatDateTime_(new Date()),
      source: '臺灣銀行牌告匯率'
    };
  } catch(e) {
    // 備用方案：直接抓網頁
    try {
      var url2 = 'https://rate.bot.com.tw/xrt?Lang=zh-TW';
      var res2 = UrlFetchApp.fetch(url2, { muteHttpExceptions: true });
      var html2 = res2.getContentText();
      var cnyIdx2 = html2.indexOf('人民幣');
      if (cnyIdx2 === -1) return { ok: false, message: '無法取得匯率' };
      var after2 = html2.substring(cnyIdx2);
      var nums2 = after2.match(/[\d]+\.[\d]+/g);
      if (!nums2 || nums2.length < 4) return { ok: false, message: '解析匯率失敗' };
      var sb = parseFloat(nums2[2]);
      var ss = parseFloat(nums2[3]);
      return { ok: true, spotBuy: sb, spotSell: ss, mid: Math.round((sb + ss) / 2 * 10000) / 10000, updated: formatDateTime_(new Date()), source: '臺灣銀行牌告匯率' };
    } catch(e2) {
      return { ok: false, message: '網路錯誤：' + e2.message };
    }
  }
}

// ========== 臺灣銀行人民幣匯率 ==========
function getCnyExchangeRate() {
  try {
    var url = 'https://rate.bot.com.tw/xrt?Lang=zh-TW';
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var html = resp.getContentText();
    // 找人民幣那一行
    var cnyIdx = html.indexOf('人民幣');
    if (cnyIdx === -1) throw new Error('找不到人民幣匯率');
    // 往後找即期匯率的數字（買入和賣出）
    var chunk = html.substring(cnyIdx, cnyIdx + 2000);
    // 找 rate-content-cash 和 rate-content-sight 的值
    var rates = [];
    var regex = /data-table="即期"[^>]*>[\s\S]*?<td[^>]*>([\d.]+)<\/td>/g;
    var match;
    // 更簡單的方法：找所有數字模式 4.xxxx
    var numRegex = />(4\.\d{3,5})</g;
    while ((match = numRegex.exec(chunk)) !== null) {
      rates.push(parseFloat(match[1]));
    }
    if (rates.length < 2) {
      // 備用方法：找所有類似匯率的數字
      var allNums = chunk.match(/\d+\.\d{3,5}/g) || [];
      var cnyRates = allNums.filter(function(n) { var v = parseFloat(n); return v > 3.5 && v < 6; });
      if (cnyRates.length >= 4) {
        // 通常順序：現金買入、現金賣出、即期買入、即期賣出
        var cashBuy = parseFloat(cnyRates[0]);
        var cashSell = parseFloat(cnyRates[1]);
        var spotBuy = parseFloat(cnyRates[2]);
        var spotSell = parseFloat(cnyRates[3]);
        return {
          ok: true,
          spotBuy: spotBuy,
          spotSell: spotSell,
          midRate: Math.round((spotBuy + spotSell) / 2 * 10000) / 10000,
          cashBuy: cashBuy,
          cashSell: cashSell,
          source: '臺灣銀行牌告匯率',
          updated: formatDateTime_(new Date())
        };
      }
    }
    if (rates.length >= 2) {
      var buy = Math.min.apply(null, rates);
      var sell = Math.max.apply(null, rates);
      return {
        ok: true,
        spotBuy: buy,
        spotSell: sell,
        midRate: Math.round((buy + sell) / 2 * 10000) / 10000,
        source: '臺灣銀行牌告匯率',
        updated: formatDateTime_(new Date())
      };
    }
    throw new Error('解析失敗');
  } catch(e) {
    return { ok: false, error: e.message, midRate: 4.5, spotBuy: 0, spotSell: 0, source: '無法取得即時匯率，使用預設值' };
  }
}

// ========== 老闆儀表板 ==========
function getBossDashboard() {
  var ss = getDatabaseSpreadsheet_();
  var vData = getSheetValues_(ss.getSheetByName(SHEET_NAMES.VIPS));
  var oData = getSheetValues_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  var logData = getSheetValues_(ss.getSheetByName(SHEET_NAMES.LOGS));

  // 全店概覽
  var totalPurchased = 0, totalUnpaid = 0, vipCount = 0, owingList = [];
  for (var i = 1; i < vData.length; i++) {
    var vid = String(vData[i][0] || '').trim(); if (!vid) continue;
    vipCount++;
    var purchased = toSafeInt_(vData[i][5]);
    var unpaid = toSafeInt_(vData[i][6]);
    totalPurchased += purchased;
    totalUnpaid += unpaid;
    if (unpaid > 0) owingList.push({ id: vid, name: String(vData[i][1] || '').trim(), purchased: purchased, unpaid: unpaid, stockQty: toSafeInt_(vData[i][3]) });
  }
  owingList.sort(function(a, b) { return b.unpaid - a.unpaid; });

  // 本月統計
  var now = new Date();
  var ym = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy/MM');
  var monthOrders = 0, monthAmount = 0, monthPaid = 0;
  for (var oi = 1; oi < oData.length; oi++) {
    var oDate = oData[oi][8] ? formatDateTime_(oData[oi][8]) : String(oData[oi][8] || '');
    if (oDate.indexOf(ym) !== 0) continue;
    if (String(oData[oi][6] || '').indexOf('作廢') !== -1) continue;
    monthOrders++;
    monthAmount += toSafeInt_(oData[oi][3]);
    monthPaid += toSafeInt_(oData[oi][4]);
  }

  // 最近操作紀錄
  var recentLogs = [];
  for (var li = Math.max(1, logData.length - 20); li < logData.length; li++) {
    recentLogs.push({
      time: logData[li][0] ? formatDateTime_(logData[li][0]) : '',
      staff: String(logData[li][1] || '').trim(),
      action: String(logData[li][3] || '').trim(),
      vipId: String(logData[li][4] || '').trim(),
      detail: String(logData[li][6] || '').trim()
    });
  }
  recentLogs.reverse();

  // 作廢訂單
  var voidOrders = [];
  for (var vi = 1; vi < oData.length; vi++) {
    var status = String(oData[vi][6] || '');
    if (status.indexOf('作廢') !== -1) {
      voidOrders.push({ orderId: String(oData[vi][0]).trim(), vipName: String(oData[vi][2]).trim(), amount: toSafeInt_(oData[vi][3]), reason: status, date: String(oData[vi][8] || '').trim() });
    }
  }

  return {
    vipCount: vipCount,
    totalPurchased: totalPurchased,
    totalPaid: totalPurchased - totalUnpaid,
    totalUnpaid: totalUnpaid,
    owingCount: owingList.length,
    owingList: owingList.slice(0, 15),
    monthLabel: ym,
    monthOrders: monthOrders,
    monthAmount: monthAmount,
    monthPaid: monthPaid,
    recentLogs: recentLogs,
    voidOrders: voidOrders
  };
}

// ========== 會計格式優化（手動執行） ==========
function optimizeAccountingFormat() {
  var ss = getDatabaseSpreadsheet_();

  // === 1. 收款紀錄格式化 ===
  var pS = ss.getSheetByName(SHEET_NAMES.PAYMENTS);
  if (pS) {
    // 確保表頭正確
    pS.getRange(1, 1, 1, 8).setValues([PAYMENTS_HEADERS]).setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
    pS.setFrozenRows(1);
    // D欄收款金額：貨幣格式
    var pLast = Math.max(pS.getLastRow(), 2);
    pS.getRange(2, 4, pLast - 1, 1).setNumberFormat('$#,##0');
    // 加入會員姓名輔助欄（I欄）
    pS.getRange(1, 9).setValue('會員姓名').setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
    var vMap = buildVipNameMap_(ss);
    var pData = getSheetValues_(pS);
    for (var pi = 1; pi < pData.length; pi++) {
      var vid = String(pData[pi][2] || '').trim();
      if (vid && vMap[vid]) pS.getRange(pi + 1, 9).setValue(vMap[vid]);
    }
    // 自動欄寬
    pS.autoResizeColumns(1, 9);
  }

  // === 2. 訂單總表格式化 ===
  var oS = ss.getSheetByName(SHEET_NAMES.ORDERS);
  if (oS) {
    oS.getRange(1, 1, 1, ORDERS_HEADERS.length).setValues([ORDERS_HEADERS]).setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
    oS.setFrozenRows(1);
    var oLast = Math.max(oS.getLastRow(), 2);
    // D~F欄貨幣格式
    oS.getRange(2, 4, oLast - 1, 3).setNumberFormat('$#,##0');
    // 紅綠字
    var oData = getSheetValues_(oS);
    for (var oi = 1; oi < oData.length; oi++) {
      var bal = toSafeInt_(oData[oi][5]);
      var status = String(oData[oi][6] || '');
      if (status.indexOf('作廢') !== -1) {
        oS.getRange(oi + 1, 1, 1, ORDERS_HEADERS.length).setFontColor('#999999').setFontStyle('italic');
      } else if (bal > 0) {
        oS.getRange(oi + 1, 6).setFontColor('#cc0000').setFontWeight('bold');
        oS.getRange(oi + 1, 7).setFontColor('#cc0000');
      } else {
        oS.getRange(oi + 1, 6).setFontColor('#0a7a3e').setFontWeight('bold');
        oS.getRange(oi + 1, 7).setFontColor('#0a7a3e');
      }
    }
    oS.autoResizeColumns(1, ORDERS_HEADERS.length);
  }

  // === 3. 會員主檔格式化 ===
  var vS = ss.getSheetByName(SHEET_NAMES.VIPS);
  if (vS) {
    vS.setFrozenRows(1);
    var vLast = Math.max(vS.getLastRow(), 2);
    // D~G欄貨幣格式
    vS.getRange(2, 4, vLast - 1, 1).setNumberFormat('#,##0');
    vS.getRange(2, 5, vLast - 1, 3).setNumberFormat('$#,##0');
    vS.autoResizeColumns(1, 8);
  }

  // === 4. 建立/更新「會計總覽」工作表 ===
  var sumName = '會計總覽';
  var sumS = ss.getSheetByName(sumName);
  if (!sumS) { sumS = ss.insertSheet(sumName); } else { sumS.clear(); }

  var vData = getSheetValues_(ss.getSheetByName(SHEET_NAMES.VIPS));
  var oData2 = getSheetValues_(ss.getSheetByName(SHEET_NAMES.ORDERS));

  // 標題
  sumS.getRange(1, 1).setValue('W CIGAR BAR — 會計總覽報表').setFontSize(14).setFontWeight('bold').setFontColor('#b8860b');
  sumS.getRange(2, 1).setValue('更新時間：' + formatDateTime_(new Date())).setFontColor('#888888');

  // --- 全店概覽 ---
  sumS.getRange(4, 1).setValue('全店財務概覽').setFontSize(12).setFontWeight('bold').setFontColor('#1f1f1f');
  var totalPurchased = 0, totalPaid = 0, totalUnpaid = 0, vipCount = 0, owingCount = 0;
  for (var vi = 1; vi < vData.length; vi++) {
    if (!String(vData[vi][0]).trim()) continue;
    vipCount++;
    totalPurchased += toSafeInt_(vData[vi][5]);
    var un = toSafeInt_(vData[vi][6]);
    totalUnpaid += un;
    if (un > 0) owingCount++;
  }
  totalPaid = totalPurchased - totalUnpaid;

  var sumHeaders = [['項目', '金額']];
  var sumData = [
    ['VIP 會員總數', vipCount + ' 位'],
    ['歷史累計營業額', totalPurchased],
    ['累計已收款', totalPaid],
    ['全店待收餘額', totalUnpaid],
    ['有欠款的會員數', owingCount + ' 位']
  ];
  sumS.getRange(5, 1, 1, 2).setValues(sumHeaders).setFontWeight('bold').setBackground('#f5f0e6');
  sumS.getRange(6, 1, sumData.length, 2).setValues(sumData);
  sumS.getRange(6, 2, sumData.length, 1).setNumberFormat('$#,##0');
  sumS.getRange(6, 2).setNumberFormat('@'); // VIP count as text
  sumS.getRange(10, 2).setNumberFormat('@'); // owing count as text
  sumS.getRange(9, 2).setFontColor('#cc0000').setFontWeight('bold'); // 待收紅字

  // --- 會員欠款明細 ---
  var startRow = 12;
  sumS.getRange(startRow, 1).setValue('會員欠款明細（未結清）').setFontSize(12).setFontWeight('bold').setFontColor('#cc0000');
  var owingHeaders = [['會員編號', '會員姓名', '歷史購買總額', '已付金額', '未付尾款', '現貨庫存數', '現貨市值']];
  sumS.getRange(startRow + 1, 1, 1, 7).setValues(owingHeaders).setFontWeight('bold').setBackground('#fadbd8');
  var owingRows = [];
  for (var vi2 = 1; vi2 < vData.length; vi2++) {
    var un2 = toSafeInt_(vData[vi2][6]);
    if (un2 > 0) {
      owingRows.push([
        String(vData[vi2][0]).trim(),
        String(vData[vi2][1]).trim(),
        toSafeInt_(vData[vi2][5]),
        toSafeInt_(vData[vi2][5]) - un2,
        un2,
        toSafeInt_(vData[vi2][3]),
        toSafeInt_(vData[vi2][4])
      ]);
    }
  }
  owingRows.sort(function(a, b) { return b[4] - a[4]; }); // 欠最多的排前面
  if (owingRows.length > 0) {
    sumS.getRange(startRow + 2, 1, owingRows.length, 7).setValues(owingRows);
    sumS.getRange(startRow + 2, 3, owingRows.length, 1).setNumberFormat('$#,##0');
    sumS.getRange(startRow + 2, 4, owingRows.length, 1).setNumberFormat('$#,##0');
    sumS.getRange(startRow + 2, 5, owingRows.length, 1).setNumberFormat('$#,##0').setFontColor('#cc0000').setFontWeight('bold');
    sumS.getRange(startRow + 2, 7, owingRows.length, 1).setNumberFormat('$#,##0');
  } else {
    sumS.getRange(startRow + 2, 1).setValue('所有會員帳款已結清 ✅').setFontColor('#0a7a3e');
  }

  // --- 已結清會員 ---
  var clearRow = startRow + 2 + owingRows.length + 2;
  sumS.getRange(clearRow, 1).setValue('已結清會員').setFontSize(12).setFontWeight('bold').setFontColor('#0a7a3e');
  sumS.getRange(clearRow + 1, 1, 1, 5).setValues([['會員編號', '會員姓名', '歷史購買總額', '現貨庫存數', '現貨市值']]).setFontWeight('bold').setBackground('#d4efdf');
  var clearRows = [];
  for (var vi3 = 1; vi3 < vData.length; vi3++) {
    if (toSafeInt_(vData[vi3][6]) <= 0 && String(vData[vi3][0]).trim()) {
      clearRows.push([String(vData[vi3][0]).trim(), String(vData[vi3][1]).trim(), toSafeInt_(vData[vi3][5]), toSafeInt_(vData[vi3][3]), toSafeInt_(vData[vi3][4])]);
    }
  }
  if (clearRows.length > 0) {
    sumS.getRange(clearRow + 2, 1, clearRows.length, 5).setValues(clearRows);
    sumS.getRange(clearRow + 2, 3, clearRows.length, 1).setNumberFormat('$#,##0');
    sumS.getRange(clearRow + 2, 5, clearRows.length, 1).setNumberFormat('$#,##0');
  }

  sumS.autoResizeColumns(1, 7);
  sumS.setColumnWidth(1, 100);
  sumS.setColumnWidth(2, 140);
  SpreadsheetApp.flush();
  Logger.log('會計格式優化完成');
  return '會計格式優化完成，已建立「會計總覽」工作表';
}

function buildVipNameMap_(ss) {
  var vS = ss.getSheetByName(SHEET_NAMES.VIPS);
  var data = getSheetValues_(vS);
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || '').trim();
    if (id) map[id] = String(data[i][1] || '').trim();
  }
  return map;
}

// 輕量版：只更新會計總覽數據（每次收款自動呼叫）
function refreshAccountingSummary_(ss) {
  if (!ss) ss = getDatabaseSpreadsheet_();
  var sumS = ss.getSheetByName('會計總覽');
  if (!sumS) return; // 尚未建立就跳過

  var vData = getSheetValues_(ss.getSheetByName(SHEET_NAMES.VIPS));
  sumS.getRange(2, 1).setValue('更新時間：' + formatDateTime_(new Date()));

  var totalPurchased = 0, totalUnpaid = 0, vipCount = 0, owingCount = 0;
  for (var vi = 1; vi < vData.length; vi++) {
    if (!String(vData[vi][0]).trim()) continue;
    vipCount++;
    totalPurchased += toSafeInt_(vData[vi][5]);
    var un = toSafeInt_(vData[vi][6]);
    totalUnpaid += un;
    if (un > 0) owingCount++;
  }
  var totalPaid = totalPurchased - totalUnpaid;
  // 更新全店概覽數字
  sumS.getRange(6, 2).setValue(vipCount + ' 位');
  sumS.getRange(7, 2).setValue(totalPurchased).setNumberFormat('$#,##0');
  sumS.getRange(8, 2).setValue(totalPaid).setNumberFormat('$#,##0');
  sumS.getRange(9, 2).setValue(totalUnpaid).setNumberFormat('$#,##0').setFontColor('#cc0000').setFontWeight('bold');
  sumS.getRange(10, 2).setValue(owingCount + ' 位');

  // 更新欠款明細
  var startRow = 14;
  var lastClear = sumS.getLastRow();
  if (lastClear > startRow) sumS.getRange(startRow, 1, lastClear - startRow + 1, 7).clear();
  var owingRows = [];
  for (var vi2 = 1; vi2 < vData.length; vi2++) {
    var un2 = toSafeInt_(vData[vi2][6]);
    if (un2 > 0) {
      owingRows.push([String(vData[vi2][0]).trim(), String(vData[vi2][1]).trim(), toSafeInt_(vData[vi2][5]), toSafeInt_(vData[vi2][5]) - un2, un2, toSafeInt_(vData[vi2][3]), toSafeInt_(vData[vi2][4])]);
    }
  }
  owingRows.sort(function(a, b) { return b[4] - a[4]; });
  if (owingRows.length > 0) {
    sumS.getRange(startRow, 1, owingRows.length, 7).setValues(owingRows);
    sumS.getRange(startRow, 5, owingRows.length, 1).setFontColor('#cc0000').setFontWeight('bold').setNumberFormat('$#,##0');
    sumS.getRange(startRow, 3, owingRows.length, 1).setNumberFormat('$#,##0');
    sumS.getRange(startRow, 4, owingRows.length, 1).setNumberFormat('$#,##0');
    sumS.getRange(startRow, 7, owingRows.length, 1).setNumberFormat('$#,##0');
  }
}

function getAppData() {
  const ss = getDatabaseSpreadsheet_();
  return {
    ok: true,
    inventory: readInventoryData_(),
    erpData: readErpData_(),
    vipOptions: buildVipLookupOptions_(),
    lastUpdated: getSpreadsheetLastUpdated_(ss),
    dbInfo: getDatabaseInfo_()
  };
}

function buildVipLookupOptions_() {
  const inv = readInventoryData_();
  return Object.keys(inv).map(function(id) {
    return { vipId: id, vipName: inv[id].name, label: inv[id].name + '｜' + id, searchText: (inv[id].name + ' ' + id).toLowerCase() };
  }).sort(function(a, b) { return a.vipName.localeCompare(b.vipName, 'zh-Hant'); });
}

function readInventoryData_() {
  const ss = getDatabaseSpreadsheet_();
  const vS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.VIPS));
  const iS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.INVENTORY));
  const rS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.RETRIEVALS));
  const res = {}, vM = {};

  // 會員主檔
  for (let i = 1; i < vS.length; i++) {
    const id = String(vS[i][0]).trim();
    if (!id) continue;
    const nm = String(vS[i][1] || 'VIP ' + id).trim();
    vM[id] = nm;
    res[id] = { name: nm, startDate: normalizeSlashDate_(vS[i][2]), cabinets: {}, retrievals: [], stats: { smoked: 0, taken: 0 } };
  }
  // 庫存明細
  for (let i = 1; i < iS.length; i++) {
    const id = String(iS[i][0]).trim();
    const cab = String(iS[i][1] || '未指定櫃位').trim();
    const itm = String(iS[i][2]).trim();
    if (!id || !itm) continue;
    if (!res[id]) res[id] = { name: vM[id] || 'VIP ' + id, startDate: '', cabinets: {}, retrievals: [], stats: { smoked: 0, taken: 0 } };
    if (!res[id].cabinets[cab]) res[id].cabinets[cab] = {};
    res[id].cabinets[cab][itm] = { qty: toSafeInt_(iS[i][3], 0), date: normalizeSlashDate_(iS[i][4]), price: toSafeInt_(iS[i][5], 0) };
  }
  // 領取紀錄 (逐行智慧偵測欄位，完全相容新舊格式)
  for (let i = 1; i < rS.length; i++) {
    const id = String(rS[i][1]).trim();
    if (!id) continue;
    if (!res[id]) res[id] = { name: vM[id] || 'VIP ' + id, startDate: '', cabinets: {}, retrievals: [], stats: { smoked: 0, taken: 0 } };
    const q = toSafeInt_(rS[i][5], 0);
    // 從第9~11欄中智慧識別「備註(去向)」和「簽名」
    var foundNote = '', foundSig = '';
    for (var ci = 9; ci <= 11 && ci < rS[i].length; ci++) {
      var val = String(rS[i][ci] || '').trim();
      if (!val) continue;
      if (val.indexOf('data:image') === 0 || val.indexOf('https://') === 0) {
        if (!foundSig) foundSig = val;
      } else if (val.indexOf('現場') !== -1 || val.indexOf('外帶') !== -1 || val.indexOf('轉贈') !== -1 || val.indexOf('招待') !== -1 || val.indexOf('領取') !== -1) {
        if (!foundNote) foundNote = val;
      } else if (val === '管家' || val === '客戶' || val === 'VIP') {
        // 舊版「身分」欄，跳過
      } else {
        if (!foundNote) foundNote = val;
      }
    }
    if (foundNote.indexOf('現場') !== -1) res[id].stats.smoked += q;
    else if (foundNote.indexOf('外帶') !== -1) res[id].stats.taken += q;
    res[id].retrievals.push({
      time: rS[i][0] ? formatDateTime_(rS[i][0]) : '',
      vipName: String(rS[i][2]).trim(),
      cabinetNo: String(rS[i][3] || '未指定櫃位').trim(),
      itemName: String(rS[i][4]).trim(),
      qty: q,
      remainingQty: toSafeInt_(rS[i][6], 0),
      operatorName: String(rS[i][7]).trim(),
      note: foundNote,
      signature: foundSig
    });
  }
  Object.keys(res).forEach(function(v) {
    res[v].retrievals.sort(function(a, b) { return String(b.time).localeCompare(String(a.time)); });
  });
  return res;
}

function readErpData_() {
  const ss = getDatabaseSpreadsheet_();
  const erp = {};
  const oS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  const iS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.ORDER_ITEMS));
  const pS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.PAYMENTS));
  if (!oS.length) return erp;

  for (let i = 1; i < oS.length; i++) {
    const oId = String(oS[i][0]).trim(), vId = String(oS[i][1]).trim();
    if (!oId || !vId) continue;
    if (!erp[vId]) erp[vId] = { orders: {}, summary: { totalPurchased: 0, totalPreOrder: 0, totalUnpaid: 0 } };
    const t = toSafeInt_(oS[i][3]), b = toSafeInt_(oS[i][5]), s = String(oS[i][6]);
    var isVoid = s.indexOf('作廢') !== -1;
    // 作廢訂單不計入財務統計
    if (!isVoid) {
      erp[vId].summary.totalPurchased += t;
      erp[vId].summary.totalUnpaid += b;
    }
    erp[vId].orders[oId] = { orderId: oId, total: t, paid: toSafeInt_(oS[i][4]), balance: isVoid ? 0 : b, status: s, staff: String(oS[i][7]), date: oS[i][8] ? formatDateTime_(oS[i][8]) : '', items: [], payments: [], isVoid: isVoid };
  }
  for (let i = 1; i < iS.length; i++) {
    const oId = String(iS[i][0]).trim();
    for (let v in erp) { if (erp[v].orders[oId]) { erp[v].orders[oId].items.push({ name: String(iS[i][1]), orderQty: toSafeInt_(iS[i][2]), arriveQty: toSafeInt_(iS[i][3]), missingQty: toSafeInt_(iS[i][4]), price: toSafeInt_(iS[i][5]), status: String(iS[i][6]) }); break; } }
  }
  for (let i = 1; i < pS.length; i++) {
    const oId = String(pS[i][1]).trim(), vId = String(pS[i][2]).trim();
    if (erp[vId] && erp[vId].orders[oId]) erp[vId].orders[oId].payments.push({ date: pS[i][0] ? formatDateTime_(pS[i][0]) : '', amt: toSafeInt_(pS[i][3]), staff: String(pS[i][4]), url: String(pS[i][5] || ''), method: String(pS[i][6] || ''), note: String(pS[i][7] || '') });
  }
  return erp;
}

// ========== 雙向同步引擎 ==========
function updateVipStatsInSheet_() {
  const ss = getDatabaseSpreadsheet_();
  const vs = ss.getSheetByName(SHEET_NAMES.VIPS);
  let vd = vs.getDataRange().getValues();
  if (vd.length <= 1) return;

  // 確保表頭正確
  let needFix = false;
  for (let i = 0; i < VIP_HEADERS.length; i++) { if (vd[0][i] !== VIP_HEADERS[i]) needFix = true; }
  if (needFix) { vs.getRange(1, 1, 1, VIP_HEADERS.length).setValues([VIP_HEADERS]).setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f'); vd = vs.getDataRange().getValues(); }

  const inv = readInventoryData_(), erp = readErpData_(), now = formatDateTime_(new Date()), out = [];
  for (let i = 1; i < vd.length; i++) {
    const vId = String(vd[i][0]).trim();
    let cQ = 0, cV = 0, hV = 0, un = 0;
    if (vId) {
      const iD = inv[vId] || { cabinets: {} };
      const eD = erp[vId] || { summary: { totalPurchased: 0, totalUnpaid: 0 } };
      Object.values(iD.cabinets).forEach(function(c) { Object.values(c).forEach(function(t) { cQ += toSafeInt_(t.qty, 0); cV += toSafeInt_(t.qty, 0) * toSafeInt_(t.price, 0); }); });
      hV = toSafeInt_(eD.summary.totalPurchased, 0);
      if (hV < cV) hV = cV;
      un = toSafeInt_(eD.summary.totalUnpaid, 0);
    }
    out.push([vd[i][0] || '', vd[i][1] || ('VIP ' + vId), normalizeSlashDate_(vd[i][2]), cQ, cV, hV, un, now]);
  }
  vs.getRange(2, 1, out.length, VIP_HEADERS.length).setValues(out);
  // 會計格式：未付尾款紅字、已結清綠字
  for (var fi = 0; fi < out.length; fi++) {
    var unpaid = toSafeInt_(out[fi][6]);
    var row = fi + 2;
    if (unpaid > 0) {
      vs.getRange(row, 7).setFontColor('#cc0000').setFontWeight('bold');
    } else {
      vs.getRange(row, 7).setFontColor('#0a7a3e').setFontWeight('normal');
    }
  }
}

// ========== 員工開櫃建單 ==========
function createNewOrder(orderData) {
  var vipId = String(orderData.vipId || '').trim();
  if (!vipId) throw new Error('請輸入會員編號');
  if (!orderData.items || !orderData.items.length) throw new Error('請至少新增一個品項');

  var ss = getDatabaseSpreadsheet_();
  var now = formatDateTime_(new Date());
  var op = orderData.operator || {};
  var staffName = op.name || '系統';

  // 確保會員存在
  var vS = ss.getSheetByName(SHEET_NAMES.VIPS);
  var vData = getSheetValues_(vS);
  var vipExists = false;
  var vipName = orderData.vipName || '';
  for (var vi = 1; vi < vData.length; vi++) {
    if (String(vData[vi][0]).trim() === vipId) { vipExists = true; vipName = String(vData[vi][1]).trim(); break; }
  }
  if (!vipExists) {
    if (!vipName) vipName = 'VIP ' + vipId;
    vS.appendRow([vipId, vipName, normalizeSlashDate_(new Date()), 0, 0, 0, 0, now]);
  }

  // 生成訂單編號
  var orderId = 'ORD-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');

  // 計算金額
  var orderType = String(orderData.orderType || '現貨購買').trim();
  var orderNote = String(orderData.orderNote || '').trim();
  var isStorage = (orderType === '客戶寄存');

  var orderTotal = 0;
  for (var i = 0; i < orderData.items.length; i++) {
    var item = orderData.items[i];
    item.cabinetQty = parseInt(item.cabinetQty) || 0;
    item.takeQty = parseInt(item.takeQty) || 0;
    item.smokeQty = parseInt(item.smokeQty) || 0;
    item.pendingQty = parseInt(item.pendingQty) || 0;
    item.qty = item.cabinetQty + item.takeQty + item.smokeQty + item.pendingQty;
    item.price = isStorage ? 0 : (parseInt(item.price) || 0);
    if (!item.name || item.qty <= 0) continue;
    orderTotal += item.qty * item.price;
  }
  if (!isStorage && orderTotal <= 0) throw new Error('訂單金額不能為 0');

  var paidAmount = isStorage ? 0 : (parseInt(orderData.paidAmount) || 0);
  var balance = orderTotal - paidAmount;
  var orderStatus = isStorage ? '客戶寄存' : (balance <= 0 ? '已沖平結清' : (paidAmount > 0 ? '部分沖銷' : '未付款'));

  // 寫入訂單總表
  var oS = ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDERS, ORDERS_HEADERS);
  oS.appendRow([orderId, vipId, vipName, orderTotal, paidAmount, balance, orderStatus + (orderNote ? ' (' + orderNote + ')' : ''), staffName, now]);

  // 寫入訂單明細 + 庫存
  var oiS = ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDER_ITEMS, ORDER_ITEMS_HEADERS);
  var ivS = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  var itemCount = 0, cabinetCount = 0, takeawayCount = 0, smokeCount = 0, pendingCount = 0;
  for (var j = 0; j < orderData.items.length; j++) {
    var itm = orderData.items[j];
    if (!itm.name || itm.qty <= 0) continue;
    var cabinetNo = String(itm.cabinet || '').trim();
    var smokeQty = parseInt(itm.smokeQty) || 0;
    var arriveQty = itm.cabinetQty + itm.takeQty + smokeQty;

    // 組合狀態描述
    var parts = [];
    if (itm.cabinetQty > 0) parts.push('入櫃' + itm.cabinetQty + '支' + (cabinetNo ? '(NO.' + cabinetNo + ')' : ''));
    if (itm.takeQty > 0) parts.push('外帶' + itm.takeQty + '支');
    if (smokeQty > 0) parts.push('現場享用' + smokeQty + '支');
    if (itm.pendingQty > 0) parts.push('未到貨' + itm.pendingQty + '支');
    var itemStatus = isStorage ? '客戶寄存' : (parts.join('／') || '已到齊');

    oiS.appendRow([orderId, itm.name, itm.qty, arriveQty, itm.pendingQty, itm.price, itemStatus]);

    // 入櫃的部分寫入庫存
    if (itm.cabinetQty > 0) {
      ivS.appendRow([vipId, cabinetNo, itm.name, itm.cabinetQty, normalizeSlashDate_(new Date()), itm.price, now]);
      cabinetCount += itm.cabinetQty;
    }
    takeawayCount += itm.takeQty;
    smokeCount += smokeQty;
    pendingCount += itm.pendingQty;
    itemCount++;

    // 現場享用 → 自動寫入領取紀錄
    if (smokeQty > 0) {
      var rtS = ensureSheetWithHeaders_(ss, SHEET_NAMES.RETRIEVALS, RETRIEVAL_HEADERS);
      rtS.appendRow([now, vipId, vipName, cabinetNo || '未指定櫃位', itm.name, smokeQty, itm.cabinetQty, staffName, op.code || '', '現場享用', orderData.signatureBase64 || '']);
    }
    // 外帶 → 自動寫入領取紀錄
    if (itm.takeQty > 0) {
      var rtS2 = ensureSheetWithHeaders_(ss, SHEET_NAMES.RETRIEVALS, RETRIEVAL_HEADERS);
      rtS2.appendRow([now, vipId, vipName, cabinetNo || '未指定櫃位', itm.name, itm.takeQty, itm.cabinetQty, staffName, op.code || '', '外帶離店', orderData.signatureBase64 || '']);
    }
  }

  // 寫入收款紀錄（如果有付款）
  var payCount = 0;
  if (paidAmount > 0) {
    var pmS = ensureSheetWithHeaders_(ss, SHEET_NAMES.PAYMENTS, PAYMENTS_HEADERS);
    var photoUrl = '';
    if (orderData.receiptPhoto) {
      var fols = DriveApp.getFoldersByName("W_CIGAR_RECEIPTS");
      var fol = fols.hasNext() ? fols.next() : DriveApp.createFolder("W_CIGAR_RECEIPTS");
      fol.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var blob = Utilities.newBlob(Utilities.base64Decode(orderData.receiptPhoto.split(',')[1]), 'image/jpeg', 'ORD_' + orderId + '_' + new Date().getTime() + '.jpg');
      var file = fol.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoUrl = 'https://lh3.googleusercontent.com/d/' + file.getId();
    }
    var payMethod = String(orderData.payMethod || '').trim();
    var bankNote = '';
    if (payMethod === '銀行匯款' && orderData.bankLast5) {
      bankNote = '匯款帳號末5碼：' + String(orderData.bankLast5).trim();
    }
    var payRemark = bankNote || ('員工建單收款');
    pmS.appendRow([now, orderId, vipId, paidAmount, staffName, photoUrl, payMethod, payRemark]);
    payCount = 1;
  }

  updateVipStatsInSheet_();
  try { refreshAccountingSummary_(ss); } catch(e) {}
  logAction_('建單開櫃', vipId, orderId, itemCount + '品項, 總額' + orderTotal + ', 收' + paidAmount, '', op);
  SpreadsheetApp.flush();
  try { notifyNewOrder_(vipName, vipId, orderId, itemCount, orderTotal, paidAmount, staffName); } catch(e){}

  return {
    ok: true,
    message: '訂單建立成功！[' + orderType + '] 共 ' + itemCount + ' 品項' + (cabinetCount > 0 ? '，' + cabinetCount + ' 支入櫃' : '') + (takeawayCount > 0 ? '，' + takeawayCount + ' 支外帶' : '') + (smokeCount > 0 ? '，' + smokeCount + ' 支現場享用' : '') + (pendingCount > 0 ? '，' + pendingCount + ' 支待到貨' : '') + (payCount > 0 ? '，收款 ' + formatCurrency_(paidAmount) + ' 已記錄' : ''),
    inventory: readInventoryData_(),
    erpData: readErpData_(),
    lastUpdated: formatDateTime_(new Date())
  };
}

function formatCurrency_(n) { return 'NT$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// ========== 交易操作 ==========
function consumeItemsBatch(vipId, items, consumeType, signatureBase64, operator) {
  vipId = String(vipId).trim();
  if (!vipId || !items.length) throw new Error('未選擇項目');
  const ss = getDatabaseSpreadsheet_();
  const sh = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  const vls = getSheetValues_(sh);
  const now = formatDateTime_(new Date());
  const op = normalizeOperator_(operator);
  const vN = getVipNameById_(vipId);
  let tot = 0;

  items.forEach(function(req) {
    const cab = String(req.cabinetNo).trim(), itm = String(req.itemName).trim(), q = toSafeInt_(req.qty, 1);
    if (q <= 0) throw new Error('數量錯誤');
    let r = -1, c = 0;
    for (let i = vls.length - 1; i >= 1; i--) {
      if (String(vls[i][0]) === vipId && (String(vls[i][1]).trim() || '未指定櫃位') === cab && String(vls[i][2]) === itm) { r = i + 1; c = toSafeInt_(vls[i][3]); break; }
    }
    if (r === -1 || c < q) throw new Error('庫存不足');
    req.r = r; req.c = c; req.d = vls[r - 1][4]; req.p = vls[r - 1][5];
  });

  const rtS = ss.getSheetByName(SHEET_NAMES.RETRIEVALS);
  items.forEach(function(req) {
    const n = req.c - req.qty;
    sh.getRange(req.r, 1, 1, 7).setValues([[vipId, req.cabinetNo === '未指定櫃位' ? '' : req.cabinetNo, req.itemName, n, req.d, req.p, now]]);
    // 新版領取紀錄：11 欄（無「身分」欄）
    rtS.appendRow([now, vipId, vN, req.cabinetNo, req.itemName, req.qty, n, op.name || '客戶', op.code || '', consumeType, signatureBase64 || '']);
    logAction_('領取:' + consumeType, vipId, req.cabinetNo, req.itemName + ' x' + req.qty + ' → 剩餘' + n, '', op);
    tot += req.qty;
  });

  updateVipStatsInSheet_();
  SpreadsheetApp.flush();
  try { notifyConsume_(vN, items, consumeType, op.name || '客戶'); } catch(e){}
  return { ok: true, message: '成功領取 ' + tot + ' 支', inventory: readInventoryData_(), erpData: readErpData_(), lastUpdated: getSpreadsheetLastUpdated_(ss) };
}

function addPaymentWithPhoto(vipId, orderId, amount, base64Photo, operator, payMethod) {
  const ss = getDatabaseSpreadsheet_();
  let url = '';
  if (base64Photo) {
    const fols = DriveApp.getFoldersByName("W_CIGAR_RECEIPTS");
    const fol = fols.hasNext() ? fols.next() : DriveApp.createFolder("W_CIGAR_RECEIPTS");
    fol.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const b = Utilities.newBlob(Utilities.base64Decode(base64Photo.split(',')[1]), 'image/jpeg', 'R_' + orderId + '_' + new Date().getTime() + '.jpg');
    var file = fol.createFile(b);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    url = 'https://lh3.googleusercontent.com/d/' + file.getId();
  }
  var methodStr = payMethod || '現場刷卡/匯款';
  var receiptNo = 'REC-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
  ss.getSheetByName(SHEET_NAMES.PAYMENTS).appendRow([formatDateTime_(new Date()), orderId, vipId, amount, operator.name || '', url, methodStr, receiptNo]);

  // 更新訂單已付金額 + 紅字標示未付款
  const oS = ss.getSheetByName(SHEET_NAMES.ORDERS);
  const oV = getSheetValues_(oS);
  for (let i = 1; i < oV.length; i++) {
    if (String(oV[i][0]).trim() === orderId) {
      const t = toSafeInt_(oV[i][3]), p = toSafeInt_(oV[i][4]) + amount, bal = t - p;
      oS.getRange(i + 1, 5, 1, 3).setValues([[p, bal, bal <= 0 ? '已沖平結清' : '部分沖銷']]);
      // 未付餘額紅字，已結清綠字
      if (bal > 0) {
        oS.getRange(i + 1, 6).setFontColor('#cc0000').setFontWeight('bold');
        oS.getRange(i + 1, 7).setFontColor('#cc0000');
      } else {
        oS.getRange(i + 1, 6).setFontColor('#0a7a3e').setFontWeight('bold');
        oS.getRange(i + 1, 7).setFontColor('#0a7a3e');
      }
      break;
    }
  }
  logAction_('收款', vipId, orderId, '收 ' + amount + ' 元 (' + methodStr + ')', '', operator);
  updateVipStatsInSheet_();
  // 自動更新會計總覽
  try { refreshAccountingSummary_(ss); } catch(e) {}
  SpreadsheetApp.flush();
  try { sendPaymentNotification_(vipId, amount, orderId); } catch(e) {}
  return { ok: true, message: '收款完成', inventory: readInventoryData_(), erpData: readErpData_(), lastUpdated: formatDateTime_(new Date()) };
}

// 補上傳歷史單據照片（不動金額，僅附加照片）
function addReceiptPhoto(vipId, orderId, base64Photo, note, operator) {
  var ss = getDatabaseSpreadsheet_();
  var url = '';
  if (base64Photo) {
    var fols = DriveApp.getFoldersByName("W_CIGAR_RECEIPTS");
    var fol = fols.hasNext() ? fols.next() : DriveApp.createFolder("W_CIGAR_RECEIPTS");
    fol.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var b = Utilities.newBlob(Utilities.base64Decode(base64Photo.split(',')[1]), 'image/jpeg', 'DOC_' + orderId + '_' + new Date().getTime() + '.jpg');
    var file = fol.createFile(b);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    url = 'https://lh3.googleusercontent.com/d/' + file.getId();
  }
  var staffName = (operator && operator.name) ? operator.name : '系統';
  var remark = note ? ('補上傳：' + note) : '補上傳歷史單據';
  ss.getSheetByName(SHEET_NAMES.PAYMENTS).appendRow([formatDateTime_(new Date()), orderId, vipId, 0, staffName, url, '補上傳單據', remark]);
  logAction_('補上傳單據', vipId, orderId, remark, '', operator);
  SpreadsheetApp.flush();
  return { ok: true, message: '單據上傳成功！', inventory: readInventoryData_(), erpData: readErpData_(), lastUpdated: formatDateTime_(new Date()) };
}

// ========== 整理資料庫 ==========
function optimizeDatabaseLayout(operator) {
  var ss = getDatabaseSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  var vls = sh.getDataRange().getValues();
  if (vls.length <= 1) return { ok: true, message: '無需整理。' };

  // 建立會員姓名對照表
  var vipNames = {};
  var vipSheet = getSheetValues_(ss.getSheetByName(SHEET_NAMES.VIPS));
  for (var vi = 1; vi < vipSheet.length; vi++) {
    var vid = String(vipSheet[vi][0]).trim();
    if (vid) vipNames[vid] = String(vipSheet[vi][1] || '').trim();
  }

  // 過濾空白行
  var h = vls[0], d = [];
  for (var i = 1; i < vls.length; i++) {
    if (String(vls[i][0]).trim() !== '' && String(vls[i][2]).trim() !== '') d.push(vls[i]);
  }
  if (!d.length) return { ok: true, message: '無有效資料。' };

  // 排序：會員編號 → 櫃位編號 → 雪茄名稱
  d.sort(function(a, b) {
    var vA = String(a[0]).trim(), vB = String(b[0]).trim();
    if (vA !== vB) return vA.localeCompare(vB, 'zh-Hant');
    var nA = parseInt(String(a[1]).trim()) || 999, nB = parseInt(String(b[1]).trim()) || 999;
    if (nA !== nB) return nA - nB;
    return String(a[2]).trim().localeCompare(String(b[2]).trim(), 'zh-Hant');
  });

  // 清除舊資料（含第8欄姓名欄）
  var clearCols = Math.max(sh.getLastColumn(), 8);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, clearCols).clearContent().clearFormat();
  }

  // 寫入排序後的資料
  sh.getRange(2, 1, d.length, h.length).setValues(d).setVerticalAlignment('middle').setFontSize(11);

  // 加入會員姓名（H欄）+ 金色分隔線
  sh.getRange(1, 8).setValue('會員姓名').setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
  var lastVip = '';
  for (var j = 0; j < d.length; j++) {
    var curVip = String(d[j][0]).trim();
    var nameCell = sh.getRange(j + 2, 8);
    // 每位會員第一行寫入姓名，並加粗金色
    if (curVip !== lastVip) {
      var name = vipNames[curVip] || 'VIP ' + curVip;
      nameCell.setValue(name).setFontWeight('bold').setFontColor('#d0a54f');
      // 加金色分隔線（第一位會員不加）
      if (lastVip !== '') {
        sh.getRange(j + 2, 1, 1, 8).setBorder(true, null, null, null, null, null, '#d0a54f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
      lastVip = curVip;
    }
  }

  // 表頭格式
  sh.getRange(1, 1, 1, 7).setValues([INVENTORY_HEADERS]).setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
  sh.setFrozenRows(1);

  updateVipStatsInSheet_();
  logAction_('整理庫存', '', '', '移除空行並排序，共 ' + d.length + ' 筆', '', operator);
  return { ok: true, message: '庫存整理完成！共 ' + d.length + ' 筆，已標註會員姓名。', inventory: readInventoryData_() };
}

// ========== CSV 匯入主入口 ==========
function importCsvContent(csvText, options) {
  const p = parseCSV_(String(csvText || ''));
  if (p.length < 2) throw new Error('CSV 內容為空或格式錯誤');
  const h = p[0].map(function(x) { return String(x).trim(); });

  // 偵測 POS 格式：含「取單號碼」或（「品名」+「售價」）
  var isPOS = (findHeaderIndex_(h, ['取單號碼']) !== -1) || (findHeaderIndex_(h, ['品名']) !== -1 && findHeaderIndex_(h, ['售價']) !== -1);
  if (isPOS) return importPosReport_(p, h, options);

  // 偵測 ERP 歷史帳務格式（含「雪茄名稱」+「訂單編號」）
  if (findHeaderIndex_(h, ['訂單編號', 'order_id']) !== -1 && findHeaderIndex_(h, ['雪茄名稱']) !== -1) return importHistoricalERPData_(p, h, options.operator);

  // 預設：庫存格式
  var dI = Math.max(0, findHeaderIndex_(h, ['日期']));
  var iI = Math.max(1, findHeaderIndex_(h, ['項目', '品項']));
  var pI = Math.max(3, findHeaderIndex_(h, ['單價']));
  var cI = Math.max(7, findHeaderIndex_(h, ['櫃位']));
  var qI = Math.max(4, findHeaderIndex_(h, ['數量']));
  var vI = findHeaderIndex_(h, ['會員編號']);
  const ss = getDatabaseSpreadsheet_();
  const vS = ss.getSheetByName(SHEET_NAMES.VIPS), ivS = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  const vM = buildRowMap_(getSheetValues_(vS), function(r) { return String(r[0]).trim(); });
  const iM = buildRowMap_(getSheetValues_(ivS), function(r) { return [String(r[0]).trim(), String(r[1]).trim(), String(r[2]).trim()].join('||'); });
  let u = 0;
  const now = formatDateTime_(new Date());
  for (let i = 1; i < p.length; i++) {
    const r = p[i]; if (!r || !r.length) continue;
    const vId = String(vI !== -1 && r[vI] ? r[vI] : (options.adminTargetVip || '88888')).trim(); if (!vId) continue;
    const itm = String(r[iI]).trim(), q = toSafeInt_(r[qI], 0); if (!itm || q <= 0) continue;
    if (!vM[vId]) { vS.appendRow([vId, String(options.adminTargetName || 'VIP ' + vId).trim(), normalizeSlashDate_(options.adminStartDate), 0, 0, 0, 0, now]); vM[vId] = vS.getLastRow(); }
    const pairs = parseCabinetPairs_(String(r[cI] || '').trim(), q);
    if (!pairs.length) pairs.push({ cabinetNo: String(r[cI] || '').trim().replace(/[^\d]/g, ''), qty: q });
    pairs.forEach(function(pr) {
      const k = [vId, pr.cabinetNo, itm].join('||'), d = normalizeSlashDate_(r[dI]) || normalizeSlashDate_(new Date());
      if (iM[k]) ivS.getRange(iM[k], 1, 1, 7).setValues([[vId, pr.cabinetNo, itm, pr.qty, d, toSafeInt_(r[pI], 0), now]]);
      else { ivS.appendRow([vId, pr.cabinetNo, itm, pr.qty, d, toSafeInt_(r[pI], 0), now]); iM[k] = ivS.getLastRow(); }
      u++;
    });
  }
  updateVipStatsInSheet_();
  return { ok: true, message: '更新 ' + u + ' 筆', inventory: readInventoryData_() };
}

// ========== POS 報表智慧匯入引擎 ==========
function importPosReport_(p, h, options) {
  var vipId = String(options.posTargetVip || options.adminTargetVip || '').trim();
  if (!vipId) throw new Error('請指定匯入的目標會員編號');

  var ss = getDatabaseSpreadsheet_();
  var oS  = ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDERS, ORDERS_HEADERS);
  var oiS = ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDER_ITEMS, ORDER_ITEMS_HEADERS);
  var pmS = ensureSheetWithHeaders_(ss, SHEET_NAMES.PAYMENTS, PAYMENTS_HEADERS);
  var ivS = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  var vipName = getVipNameById_(vipId);
  var now = formatDateTime_(new Date());
  var staff = (options.operator && options.operator.name) ? options.operator.name : '系統匯入';

  // 欄位索引
  var cOid    = findHeaderIndex_(h, ['訂單編號']);
  var cName   = findHeaderIndex_(h, ['品名']);
  var cPrice  = findHeaderIndex_(h, ['售價']);
  var cQty    = findHeaderIndex_(h, ['數量']);
  var cTotal  = findHeaderIndex_(h, ['總金額']);
  var cPay    = findHeaderIndex_(h, ['付款方式']);
  var cStatus = findHeaderIndex_(h, ['付款狀態']);
  var cStaff  = findHeaderIndex_(h, ['人員']);
  if (cName === -1 || cPrice === -1 || cQty === -1) throw new Error('CSV 缺少必要欄位（品名/售價/數量）');

  // 防重複：取得已匯入的訂單
  var existing = {};
  var existOV = getSheetValues_(oS);
  for (var ei = 1; ei < existOV.length; ei++) existing[String(existOV[ei][0]).trim()] = true;

  // 按訂單分組
  var orderMap = {};
  for (var i = 1; i < p.length; i++) {
    var r = p[i]; if (!r || r.length < 3) continue;
    var oid = (cOid !== -1 && r[cOid]) ? String(r[cOid]).trim() : '';
    if (!oid) oid = 'NOID-' + i;
    var itemName = (cName !== -1) ? String(r[cName]).trim() : '';
    if (!itemName) continue;

    if (!orderMap[oid]) {
      // 從訂單編號提取交易日期，如 20260306-170621 → 2026/03/06 17:06
      var txDate = now;
      var dm = oid.match(/^(\d{4})(\d{2})(\d{2})-?(\d{2})?(\d{2})?/);
      if (dm) txDate = dm[1] + '/' + dm[2] + '/' + dm[3] + (dm[4] ? ' ' + dm[4] + ':' + (dm[5]||'00') : '');
      orderMap[oid] = {
        orderId: 'POS-' + oid,
        txDate: txDate,
        total: (cTotal !== -1 && r[cTotal]) ? toSafeInt_(r[cTotal]) : 0,
        payStr: (cPay !== -1 && r[cPay]) ? String(r[cPay]).trim() : '',
        payStatus: (cStatus !== -1 && r[cStatus]) ? String(r[cStatus]).trim() : '',
        staff: (cStaff !== -1 && r[cStaff]) ? String(r[cStaff]).trim() : staff,
        items: []
      };
    }
    var qty = toSafeInt_(r[cQty], 0);
    var price = toSafeInt_(r[cPrice], 0);
    if (qty > 0) orderMap[oid].items.push({ name: itemName, qty: qty, price: price });
  }

  var orderCount = 0, itemCount = 0, payCount = 0, skipCount = 0, invCount = 0;

  var orderIds = Object.keys(orderMap);
  for (var oi = 0; oi < orderIds.length; oi++) {
    var o = orderMap[orderIds[oi]];
    if (!o.items.length) continue;
    if (existing[o.orderId]) { skipCount++; continue; }

    // 計算訂單總額
    var calcTotal = 0;
    for (var ci = 0; ci < o.items.length; ci++) calcTotal += o.items[ci].qty * o.items[ci].price;
    var orderTotal = (o.total > 0) ? o.total : calcTotal;

    // 解析付款
    var payments = parsePosPayments_(o.payStr);
    var totalPaid = 0;
    for (var pi = 0; pi < payments.length; pi++) totalPaid += payments[pi].amount;

    var orderStatus = '未付款';
    if (totalPaid >= orderTotal) orderStatus = '已沖平結清';
    else if (totalPaid > 0) orderStatus = '部分沖銷';

    // 寫入訂單總表（使用 POS 交易日期）
    oS.appendRow([o.orderId, vipId, vipName, orderTotal, totalPaid, orderTotal - totalPaid, orderStatus, o.staff, o.txDate]);
    orderCount++;

    // 寫入訂單明細（+ 庫存，視選項而定）
    var skipInv = options.posSkipInventory === true;
    for (var ii = 0; ii < o.items.length; ii++) {
      var item = o.items[ii];
      if (skipInv) {
        // 僅帳務模式：標記為「已入櫃」但不實際新增庫存
        oiS.appendRow([o.orderId, item.name, item.qty, item.qty, 0, item.price, '已入櫃(既有庫存)']);
      } else {
        // 帳務＋庫存模式：同時新增庫存明細
        oiS.appendRow([o.orderId, item.name, item.qty, item.qty, 0, item.price, '已到齊']);
        ivS.appendRow([vipId, '', item.name, item.qty, o.txDate.split(' ')[0], item.price, now]);
        invCount++;
      }
      itemCount++;
    }

    // 寫入沖帳憑證（日期用交易日期）
    for (var pj = 0; pj < payments.length; pj++) {
      var pay = payments[pj];
      var payNote = '店內 POS 結帳 ｜ 金額：' + pay.amount;
      pmS.appendRow([o.txDate, o.orderId, vipId, pay.amount, o.staff, '', pay.method, payNote]);
      payCount++;
    }

    logAction_('POS匯入', vipId, o.orderId, o.items.length + '品項, 付' + totalPaid, '', options.operator || {});
  }

  updateVipStatsInSheet_();
  SpreadsheetApp.flush();

  var mode = options.posSkipInventory ? '（僅帳務，未動庫存）' : '（含庫存新增）';
  var msg = 'POS 匯入完成' + mode + '！新增 ' + orderCount + ' 筆訂單、' + itemCount + ' 筆品項、' + payCount + ' 筆收款';
  if (invCount > 0) msg += '、' + invCount + ' 筆庫存';
  if (skipCount > 0) msg += '（跳過 ' + skipCount + ' 筆已匯入訂單）';
  return { ok: true, message: msg, inventory: readInventoryData_(), erpData: readErpData_(), lastUpdated: formatDateTime_(new Date()) };
}

// 解析 POS 付款字串
function parsePosPayments_(payStr) {
  var result = [];
  if (!payStr) return result;
  var parts = String(payStr).split(',');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    var match = p.match(/^(.+?)(\d+)$/);
    if (match) result.push({ method: match[1].trim(), amount: parseInt(match[2], 10) });
    else result.push({ method: p, amount: 0 });
  }
  return result;
}

// ========== ERP 歷史帳務匯入 ==========
function importHistoricalERPData_(p, h, op) {
  const ss = getDatabaseSpreadsheet_();
  var gI = function(k) { return findHeaderIndex_(h, k); };
  var dI = gI(['日期']), vI = gI(['會員編號']), oI = gI(['訂單編號']), iI = gI(['雪茄名稱']);
  var oQ = gI(['訂購數量']), aQ = gI(['已入櫃數量']), pI = gI(['單價']), paidI = gI(['本次付款金額']), sI = gI(['員工代碼']);
  if (vI === -1 || oI === -1 || iI === -1) throw new Error('缺必要欄位');

  var oS = ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDERS, ORDERS_HEADERS);
  var iS = ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDER_ITEMS, ORDER_ITEMS_HEADERS);
  var pS = ensureSheetWithHeaders_(ss, SHEET_NAMES.PAYMENTS, PAYMENTS_HEADERS);
  var ivS = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  var c = 0, ts = {};
  var now = formatDateTime_(new Date());

  for (var i = 1; i < p.length; i++) {
    var r = p[i]; if (!r || !r[vI]) continue;
    var vId = String(r[vI]).trim(), oId = String(r[oI]).trim(), itm = String(r[iI]).trim();
    var oq = toSafeInt_(r[oQ]), aq = toSafeInt_(r[aQ]), pri = toSafeInt_(r[pI]), paid = toSafeInt_(r[paidI]);
    var stf = sI !== -1 ? (findOperatorByCode_(String(r[sI])) || {}).name || '未知' : '未知';
    iS.appendRow([oId, itm, oq, aq, oq - aq, pri, (oq - aq) <= 0 ? '已到齊' : '預購']);
    if (!ts[oId]) ts[oId] = { v: vId, vn: getVipNameById_(vId), t: 0, p: 0, s: stf, d: normalizeSlashDate_(r[dI]) || now };
    ts[oId].t += (oq * pri); ts[oId].p += paid;
    if (paid > 0) pS.appendRow([normalizeSlashDate_(r[dI]) || now, oId, vId, paid, stf, '', '補登', '歷史帳務匯入']);
    if (aq > 0) ivS.appendRow([vId, '', itm, aq, normalizeSlashDate_(r[dI]) || now, pri, now]);
    c++;
  }
  for (var id in ts) {
    var bal = ts[id].t - ts[id].p;
    oS.appendRow([id, ts[id].v, ts[id].vn, ts[id].t, ts[id].p, bal, bal <= 0 ? '已沖平結清' : '部分沖銷', ts[id].s, ts[id].d]);
  }
  updateVipStatsInSheet_();
  SpreadsheetApp.flush();
  return { ok: true, message: '補登 ' + c + ' 筆。', inventory: readInventoryData_(), erpData: readErpData_() };
}

// ========== LINE 推播通知系統 ==========

// 儲存 LINE 設定
function saveLINEConfig(token, groupId) {
  var p = PropertiesService.getScriptProperties();
  p.setProperty(LINE_TOKEN_KEY, String(token || '').trim());
  p.setProperty(LINE_GROUP_KEY, String(groupId || '').trim());
  return { ok: true, message: 'LINE 設定已儲存！' };
}

function getLINEConfig() {
  var p = PropertiesService.getScriptProperties();
  return { token: p.getProperty(LINE_TOKEN_KEY) || '', groupId: p.getProperty(LINE_GROUP_KEY) || '' };
}

// 測試 LINE 連線
function testLINENotify() {
  var ok = sendLineMessage_('🔔 W CIGAR BAR 通知測試\n\n系統連線正常，LINE 推播已啟用。\n時間：' + formatDateTime_(new Date()));
  return { ok: ok, message: ok ? 'LINE 測試訊息已發送！' : 'LINE 發送失敗，請檢查 Token 和群組 ID' };
}

// LINE Messaging API 推播
function sendLineMessage_(text) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty(LINE_TOKEN_KEY);
  var groupId = p.getProperty(LINE_GROUP_KEY);
  if (!token || !groupId) return false;
  try {
    var url = 'https://api.line.me/v2/bot/message/push';
    var payload = { to: groupId, messages: [{ type: 'text', text: text }] };
    UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) { return false; }
}

// 每日自動檢查（由定時觸發器呼叫）
function dailyAlertCheck() {
  var inv = readInventoryData_();
  var now = new Date();
  var alerts = [];

  var vipIds = Object.keys(inv);
  for (var v = 0; v < vipIds.length; v++) {
    var vipId = vipIds[v];
    var vip = inv[vipId];

    // 1️⃣ 開櫃滿一年提醒（前 7 天開始提醒）
    if (vip.startDate) {
      var start = new Date(vip.startDate.replace(/\//g, '-'));
      if (!isNaN(start.getTime())) {
        var oneYearDate = new Date(start);
        oneYearDate.setFullYear(oneYearDate.getFullYear() + 1);
        var daysUntil = Math.ceil((oneYearDate - now) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 7) {
          alerts.push('🎂 【開櫃週年提醒】\n會員：' + vip.name + ' (' + vipId + ')\n開櫃日：' + vip.startDate + '\n' + (daysUntil === 0 ? '🎉 今天是一週年！' : '距離滿一年還有 ' + daysUntil + ' 天'));
        }
      }
    }

    // 2️⃣ 庫存低於 5 支警示
    var cabKeys = Object.keys(vip.cabinets || {});
    for (var c = 0; c < cabKeys.length; c++) {
      var itemKeys = Object.keys(vip.cabinets[cabKeys[c]]);
      for (var i = 0; i < itemKeys.length; i++) {
        var item = vip.cabinets[cabKeys[c]][itemKeys[i]];
        if (item.qty > 0 && item.qty <= 5) {
          alerts.push('⚠️ 【低庫存警示】\n會員：' + vip.name + ' (' + vipId + ')\n品名：' + itemKeys[i] + '\n櫃位：NO.' + cabKeys[c] + '\n剩餘：' + item.qty + ' 支');
        }
      }
    }
  }

  // 3️⃣ 今日領取/外帶紀錄
  var todayStr = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy/MM/dd');
  var ss = getDatabaseSpreadsheet_();
  var rS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.RETRIEVALS));
  var todayRetrievals = [];
  for (var ri = 1; ri < rS.length; ri++) {
    var rTime = rS[ri][0] ? formatDateTime_(rS[ri][0]) : '';
    if (rTime.indexOf(todayStr) === 0) {
      var note = String(rS[ri][9] || rS[ri][10] || '').trim();
      todayRetrievals.push({
        name: String(rS[ri][2]).trim(),
        item: String(rS[ri][4]).trim(),
        qty: toSafeInt_(rS[ri][5], 0),
        note: note,
        staff: String(rS[ri][7]).trim()
      });
    }
  }
  if (todayRetrievals.length > 0) {
    var sList = '';
    for (var t = 0; t < todayRetrievals.length; t++) {
      var tr = todayRetrievals[t];
      var icon = tr.note.indexOf('外帶') !== -1 ? '🛍️外帶' : (tr.note.indexOf('招待') !== -1 ? '🎁招待' : '🚬現場');
      sList += '\n' + icon + ' ' + tr.name + '：' + tr.item + ' x' + tr.qty + ' (' + tr.staff + ')';
    }
    alerts.push('📋 【今日領取紀錄】' + sList);
  }

  // 發送彙整通知
  if (alerts.length > 0) {
    var header = '🏢 W CIGAR BAR 每日報告\n📅 ' + todayStr + '\n' + '─'.repeat(20);
    var fullMsg = header + '\n\n' + alerts.join('\n\n');
    // LINE 單則訊息限 5000 字，超過則分段
    if (fullMsg.length <= 4500) {
      sendLineMessage_(fullMsg);
    } else {
      sendLineMessage_(header + '\n\n共 ' + alerts.length + ' 則通知，以下分段發送：');
      for (var a = 0; a < alerts.length; a++) {
        sendLineMessage_(alerts[a]);
      }
    }
  }
}

// 安裝每日定時觸發器（每天早上 9 點執行）
function installDailyTrigger() {
  // 先移除舊的觸發器
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dailyAlertCheck') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // 建立新的每日觸發器
  ScriptApp.newTrigger('dailyAlertCheck')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone('Asia/Taipei')
    .create();
  return { ok: true, message: '每日 9:00 自動檢查已啟用！' };
}

// 即時通知：領取雪茄
function notifyConsume_(vipName, items, consumeType, staffName) {
  var icon = consumeType.indexOf('外帶') !== -1 ? '🛍️' : (consumeType.indexOf('招待') !== -1 ? '🎁' : '🚬');
  var msg = icon + ' 【即時領取通知】\n會員：' + vipName + '\n方式：' + consumeType + '\n服務管家：' + staffName;
  for (var i = 0; i < items.length; i++) {
    msg += '\n• ' + items[i].itemName + ' x' + items[i].qty;
  }
  msg += '\n時間：' + formatDateTime_(new Date());
  sendLineMessage_(msg);
}

// 即時通知：新訂單建立
function notifyNewOrder_(vipName, vipId, orderId, itemCount, total, paid, staffName) {
  var msg = '📝 【新訂單通知】\n會員：' + vipName + ' (' + vipId + ')\n訂單：' + orderId + '\n品項：' + itemCount + ' 項\n總額：NT$' + total;
  if (paid > 0) msg += '\n已收：NT$' + paid;
  if (total - paid > 0) msg += '\n待收：NT$' + (total - paid);
  msg += '\n經辦：' + staffName + '\n時間：' + formatDateTime_(new Date());
  sendLineMessage_(msg);
}

// ========== 基礎工具 ==========
function setupDatabase(sId, op) {
  sId = String(sId || '').trim();
  var ss;
  if (sId) { ss = SpreadsheetApp.openById(sId); }
  else { ss = SpreadsheetApp.create('W CIGAR BAR VIP 中文正式資料庫'); }
  initializeSheetStructure_(ss);
  PropertiesService.getScriptProperties().setProperty(DB_ID_KEY, ss.getId());
  logAction_(sId ? '綁定' : '建立', '', '', '', '', op);
  return { ok: true, message: '成功', dbInfo: getDatabaseInfo_(), lastUpdated: getSpreadsheetLastUpdated_(ss) };
}

function ensureDatabase_() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty(ADMIN_PASSWORD_KEY)) p.setProperty(ADMIN_PASSWORD_KEY, DEFAULT_ADMIN_PASSWORD);
  // 優先用已儲存的 ID，沒有就用寫死的預設 ID
  var dbId = p.getProperty(DB_ID_KEY) || DEFAULT_DB_ID;
  try {
    var ss = SpreadsheetApp.openById(dbId);
    initializeSheetStructure_(ss);
    if (!p.getProperty(DB_ID_KEY)) p.setProperty(DB_ID_KEY, dbId);
    return ss;
  } catch (e) {
    // 寫死的 ID 也開不了，才建新的（正常不會發生）
    var ss2 = SpreadsheetApp.create('W CIGAR BAR VIP 中文正式資料庫');
    initializeSheetStructure_(ss2);
    p.setProperty(DB_ID_KEY, ss2.getId());
    return ss2;
  }
}

function initializeSheetStructure_(ss) {
  ensureSheetWithHeaders_(ss, SHEET_NAMES.VIPS, VIP_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDERS, ORDERS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDER_ITEMS, ORDER_ITEMS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.PAYMENTS, PAYMENTS_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.INVENTORY, INVENTORY_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.RETRIEVALS, RETRIEVAL_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.LOGS, LOG_HEADERS);
  // 員工帳號表（含預設資料）
  var staffSh = ss.getSheetByName(SHEET_NAMES.STAFF);
  if (!staffSh) {
    staffSh = ensureSheetWithHeaders_(ss, SHEET_NAMES.STAFF, STAFF_HEADERS);
    var now = formatDateTime_(new Date());
    for (var di = 0; di < DEFAULT_OPERATOR_ACCOUNTS.length; di++) {
      var d = DEFAULT_OPERATOR_ACCOUNTS[di];
      staffSh.appendRow([d.code, d.name, d.role, '啟用', now]);
    }
  }
}

function ensureSheetWithHeaders_(ss, n, h) {
  var s = ss.getSheetByName(n);
  if (!s) {
    s = ss.insertSheet(n);
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
    s.setFrozenRows(1);
    s.autoResizeColumns(1, h.length);
  }
  return s;
}

// 時間工具
function formatDateTime_(d) { if (!d) return ''; const o = (Object.prototype.toString.call(d) === '[object Date]') ? d : new Date(d); return isNaN(o.getTime()) ? String(d) : Utilities.formatDate(o, 'Asia/Taipei', 'yyyy/MM/dd HH:mm'); }
function normalizeSlashDate_(v) { if (!v) return ''; if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy/MM/dd'); const t = String(v).trim(); if (!t) return ''; const d = new Date(t.replace(/-/g, '/').replace(/\./g, '/')); return !isNaN(d.getTime()) ? Utilities.formatDate(d, 'Asia/Taipei', 'yyyy/MM/dd') : t; }

// 查詢工具
function getVipNameById_(v) { const s = getSheetValues_(getDatabaseSpreadsheet_().getSheetByName(SHEET_NAMES.VIPS)); for (let i = 1; i < s.length; i++) if (String(s[i][0]).trim() === String(v).trim()) return String(s[i][1] || 'VIP ' + v).trim(); return 'VIP ' + v; }
function getOperatorAccounts_() {
  try {
    var ss = getDatabaseSpreadsheet_();
    var sh = ss.getSheetByName(SHEET_NAMES.STAFF);
    if (sh) {
      var data = getSheetValues_(sh);
      var accounts = [];
      for (var i = 1; i < data.length; i++) {
        var code = String(data[i][0] || '').trim();
        var name = String(data[i][1] || '').trim();
        var role = String(data[i][2] || 'staff').trim();
        var status = String(data[i][3] || '啟用').trim();
        if (code && name && status === '啟用') accounts.push({ code: code, name: name, role: role });
      }
      if (accounts.length > 0) return accounts;
    }
  } catch(e) {}
  return DEFAULT_OPERATOR_ACCOUNTS.map(function(i) { return { code: String(i.code).trim(), name: String(i.name).trim(), role: String(i.role).trim() }; });
}
function findOperatorByCode_(c) { const a = getOperatorAccounts_(); for (let i = 0; i < a.length; i++) if (a[i].code === String(c).trim()) return a[i]; return null; }
function normalizeOperator_(o) { o = o || {}; return { name: String(o.name || '').trim(), code: String(o.code || '').trim(), role: String(o.role || '').trim() }; }
function getAdminPassword_() { const p = PropertiesService.getScriptProperties(); let pW = p.getProperty(ADMIN_PASSWORD_KEY); if (!pW) { pW = DEFAULT_ADMIN_PASSWORD; p.setProperty(ADMIN_PASSWORD_KEY, pW); } return pW; }
function getDatabaseSpreadsheet_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(DB_ID_KEY)); }
function getDatabaseInfo_() { const ss = getDatabaseSpreadsheet_(); return { spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), spreadsheetName: ss.getName() }; }
function getSpreadsheetLastUpdated_(ss) { try { return formatDateTime_(DriveApp.getFileById(ss.getId()).getLastUpdated()); } catch (e) { return formatDateTime_(new Date()); } }
function getSheetValues_(s) { const lr = s.getLastRow(), lc = s.getLastColumn(); return lr === 0 || lc === 0 ? [] : s.getRange(1, 1, lr, lc).getValues(); }
function buildRowMap_(v, f) { const m = {}; for (let i = 1; i < v.length; i++) { const k = String(f(v[i]) || '').trim(); if (k) m[k] = i + 1; } return m; }

// 新版操作紀錄：8 欄
function logAction_(action, vipId, refId, detail, remark, op) {
  try {
    getDatabaseSpreadsheet_().getSheetByName(SHEET_NAMES.LOGS).appendRow([
      formatDateTime_(new Date()),
      (op || {}).name || '系統',
      (op || {}).code || '',
      action,
      vipId || '',
      refId || '',
      detail || '',
      remark || ''
    ]);
  } catch (e) {}
}

// 解析工具
function parseCabinetPairs_(c, f) { const r = [], t = String(c || '').trim(); if (!t) return r; const rG = /(\d+)\s*櫃\s*[:：]\s*(\d+)/g; let m; while ((m = rG.exec(t)) !== null) r.push({ cabinetNo: String(m[1]).trim(), qty: toSafeInt_(m[2], f) }); return r; }
function parseCSV_(s) { const a = []; let q = false, c = 0, r = 0; for (let i = 0; i < s.length; i++) { const cc = s[i], nc = s[i + 1]; a[r] = a[r] || []; a[r][c] = a[r][c] || ''; if (cc === '"' && q && nc === '"') { a[r][c] += cc; i++; continue; } if (cc === '"') { q = !q; continue; } if (cc === ',' && !q) { c++; continue; } if (cc === '\r' && nc === '\n' && !q) { r++; c = 0; i++; continue; } if ((cc === '\n' || cc === '\r') && !q) { r++; c = 0; continue; } a[r][c] += cc; } return a; }
function findHeaderIndex_(h, c) { for (let i = 0; i < h.length; i++) { const d = String(h[i]).replace(/\s+/g, '').toLowerCase(); for (let j = 0; j < c.length; j++) if (d.indexOf(String(c[j]).replace(/\s+/g, '').toLowerCase()) !== -1) return i; } return -1; }
function toSafeInt_(v, f) { const n = parseInt(String(v == null ? '' : v).replace(/,/g, '').trim(), 10); return isNaN(n) ? (f || 0) : n; }

// ========== 到貨確認（預購→入櫃） ==========

// VIP 登入驗證（含密碼檢查）
function verifyVipLogin(vipId, password) {
  var ss = getDatabaseSpreadsheet_();
  var vS = ss.getSheetByName(SHEET_NAMES.VIPS);
  var data = getSheetValues_(vS);
  // 確保 J1 有表頭
  if (data.length > 0 && (!data[0][9] || String(data[0][9]).trim() !== '登入密碼')) {
    vS.getRange(1, 10).setValue('登入密碼').setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
  }
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(vipId).trim()) {
      var storedPwd = String(data[i][9] || '').trim();
      if (!storedPwd) return { ok: true, needPassword: false }; // 未設密碼，直接放行
      if (storedPwd === String(password).trim()) return { ok: true, needPassword: false };
      if (!password) return { ok: false, needPassword: true };
      throw new Error('密碼錯誤');
    }
  }
  throw new Error('查無此會員');
}

// 設定 VIP 登入密碼
function setVipPassword(vipId, newPassword, operator) {
  if (!newPassword || String(newPassword).trim().length < 4) throw new Error('密碼至少 4 個字元');
  var ss = getDatabaseSpreadsheet_();
  var vS = ss.getSheetByName(SHEET_NAMES.VIPS);
  var data = getSheetValues_(vS);
  if (data.length > 0 && (!data[0][9] || String(data[0][9]).trim() !== '登入密碼')) {
    vS.getRange(1, 10).setValue('登入密碼').setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
  }
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(vipId).trim()) {
      vS.getRange(i + 1, 10).setValue(String(newPassword).trim());
      logAction_('設定VIP密碼', vipId, '', '已設定登入密碼', '', operator);
      return { ok: true, message: '會員 ' + data[i][1] + ' 的登入密碼已設定' };
    }
  }
  throw new Error('找不到會員');
}

// 訂單作廢
function voidOrder(orderId, reason, operator) {
  var ss = getDatabaseSpreadsheet_();
  var oS = ss.getSheetByName(SHEET_NAMES.ORDERS);
  var data = getSheetValues_(oS);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === orderId) {
      var oldStatus = String(data[i][6]);
      oS.getRange(i + 1, 7).setValue('已作廢 (' + (reason || '管理員操作') + ')');
      logAction_('訂單作廢', data[i][1], orderId, oldStatus + ' → 已作廢: ' + (reason || ''), '', operator);
      updateVipStatsInSheet_();
      SpreadsheetApp.flush();
      return { ok: true, message: '訂單 ' + orderId + ' 已作廢', inventory: readInventoryData_(), erpData: readErpData_() };
    }
  }
  throw new Error('找不到訂單');
}

// 全店月營收報表
function generateMonthlyReport(yearMonth) {
  var ss = getDatabaseSpreadsheet_();
  var oS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  var pS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.PAYMENTS));
  var ym = yearMonth || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM');

  var report = { month: ym, totalOrders: 0, totalAmount: 0, totalPaid: 0, totalUnpaid: 0, byStaff: {}, byVip: {}, newVips: 0 };

  for (var i = 1; i < oS.length; i++) {
    var orderDate = oS[i][8] ? formatDateTime_(oS[i][8]) : String(oS[i][8] || '');
    if (orderDate.indexOf(ym) !== 0) continue;
    var status = String(oS[i][6] || '');
    if (status.indexOf('作廢') !== -1) continue;
    var total = toSafeInt_(oS[i][3]);
    var paid = toSafeInt_(oS[i][4]);
    var staff = String(oS[i][7] || '未知');
    var vipId = String(oS[i][1]).trim();
    var vipName = String(oS[i][2]).trim();

    report.totalOrders++;
    report.totalAmount += total;
    report.totalPaid += paid;

    if (!report.byStaff[staff]) report.byStaff[staff] = { orders: 0, amount: 0 };
    report.byStaff[staff].orders++;
    report.byStaff[staff].amount += total;

    if (!report.byVip[vipId]) report.byVip[vipId] = { name: vipName, orders: 0, amount: 0 };
    report.byVip[vipId].orders++;
    report.byVip[vipId].amount += total;
  }

  // 本月實際收款（從收款紀錄統計，含支付方式分類）
  var monthCashIn = 0;
  var byMethod = {};
  for (var pi = 1; pi < pS.length; pi++) {
    var payDate = pS[pi][0] ? formatDateTime_(pS[pi][0]) : String(pS[pi][0] || '');
    if (payDate.indexOf(ym) !== 0) continue;
    var amt = toSafeInt_(pS[pi][3]);
    if (amt <= 0) continue;
    monthCashIn += amt;
    var method = String(pS[pi][6] || '').trim();
    // 歸類支付方式
    var mKey = '其他';
    if (method.indexOf('ACPAY') !== -1 || method.indexOf('刷卡') !== -1 || method.indexOf('POS') !== -1 || method.indexOf('企銀') !== -1 || method.indexOf('運通') !== -1 || method.indexOf('銀聯') !== -1) mKey = '刷卡';
    else if (method.indexOf('現金') !== -1) mKey = '現金';
    else if (method.indexOf('匯款') !== -1 || method.indexOf('銀行') !== -1) mKey = '銀行匯款';
    else if (method.indexOf('微信') !== -1) mKey = '微信支付';
    else if (method.indexOf('支付寶') !== -1) mKey = '支付寶';
    if (!byMethod[mKey]) byMethod[mKey] = 0;
    byMethod[mKey] += amt;
  }

  // 帳齡分析（全店未結清訂單）
  var aging = { within30: 0, d30to60: 0, d60to90: 0, over90: 0 };
  var today = new Date();
  for (var ai = 1; ai < oS.length; ai++) {
    var aBal = toSafeInt_(oS[ai][5]);
    var aStatus = String(oS[ai][6] || '');
    if (aBal <= 0 || aStatus.indexOf('作廢') !== -1) continue;
    var aDateStr = oS[ai][8] ? formatDateTime_(oS[ai][8]) : String(oS[ai][8] || '');
    var aDate = new Date(aDateStr.replace(/\//g, '-'));
    if (isNaN(aDate.getTime())) continue;
    var days = Math.floor((today - aDate) / (1000 * 60 * 60 * 24));
    if (days <= 30) aging.within30 += aBal;
    else if (days <= 60) aging.d30to60 += aBal;
    else if (days <= 90) aging.d60to90 += aBal;
    else aging.over90 += aBal;
  }

  report.totalUnpaid = report.totalAmount - report.totalPaid;
  report.vipCount = Object.keys(report.byVip).length;
  report.monthCashIn = monthCashIn;
  report.byMethod = byMethod;
  report.aging = aging;

  return report;
}

// ========== 庫存智慧合併 ==========
function consolidateInventory(dryRun) {
  var ss = getDatabaseSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  var data = getSheetValues_(sh);
  if (data.length <= 1) return { ok: true, message: '庫存為空', merges: [] };

  // 依 會員+櫃位+品名 分組
  var groups = {};
  var mergeLog = [];
  for (var i = 1; i < data.length; i++) {
    var vid = String(data[i][0] || '').trim();
    var cab = String(data[i][1] || '').trim() || '未指定';
    var name = String(data[i][2] || '').trim();
    var qty = toSafeInt_(data[i][3]);
    if (!vid || !name) continue;
    var key = vid + '|' + cab + '|' + name;
    if (!groups[key]) groups[key] = { vid: vid, cab: cab, name: name, totalQty: 0, latestDate: '', maxPrice: 0, rows: 0 };
    groups[key].totalQty += qty;
    groups[key].maxPrice = Math.max(groups[key].maxPrice, toSafeInt_(data[i][5]));
    var d = String(data[i][4] || '').trim();
    if (d > groups[key].latestDate) groups[key].latestDate = d;
    groups[key].rows++;
  }

  // 找出需要合併的（rows > 1）和數量為 0 的
  var toMerge = [], toRemove = [];
  var gKeys = Object.keys(groups);
  for (var gi = 0; gi < gKeys.length; gi++) {
    var g = groups[gKeys[gi]];
    if (g.totalQty <= 0) { toRemove.push(g); }
    else if (g.rows > 1) { toMerge.push(g); }
  }

  if (dryRun) {
    // 預覽模式：只回報，不修改
    return {
      ok: true,
      message: '預覽：' + toMerge.length + ' 組需合併，' + toRemove.length + ' 組數量為0可刪除',
      merges: toMerge.map(function(m) { return m.vid + ' ' + m.name + ' (' + m.rows + '筆→1筆, 合計' + m.totalQty + '支)'; }),
      removes: toRemove.map(function(r) { return r.vid + ' ' + r.name + ' (數量0)'; }),
      totalBefore: data.length - 1,
      totalAfter: gKeys.length - toRemove.length
    };
  }

  // 執行合併：清除舊資料，寫入合併後的新資料
  var now = formatDateTime_(new Date());
  var newRows = [];
  for (var ni = 0; ni < gKeys.length; ni++) {
    var ng = groups[gKeys[ni]];
    if (ng.totalQty <= 0) continue; // 跳過數量 0
    newRows.push([ng.vid, ng.cab, ng.name, ng.totalQty, ng.latestDate, ng.maxPrice, now]);
  }

  // 依會員編號+櫃位排序
  newRows.sort(function(a, b) {
    if (a[0] !== b[0]) return String(a[0]).localeCompare(String(b[0]));
    if (a[1] !== b[1]) return String(a[1]).localeCompare(String(b[1]));
    return String(a[2]).localeCompare(String(b[2]));
  });

  // 清除舊資料，寫入新資料
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).clear();
  if (newRows.length > 0) sh.getRange(2, 1, newRows.length, 7).setValues(newRows);

  logAction_('庫存合併', '', '', '合併前' + (data.length - 1) + '筆→合併後' + newRows.length + '筆 (合併' + toMerge.length + '組, 刪除' + toRemove.length + '組空品項)', '', {});
  updateVipStatsInSheet_();
  SpreadsheetApp.flush();

  return {
    ok: true,
    message: '庫存合併完成！合併前 ' + (data.length - 1) + ' 筆 → 合併後 ' + newRows.length + ' 筆',
    merged: toMerge.length,
    removed: toRemove.length,
    inventory: readInventoryData_()
  };
}

// ========== 到貨確認（預購→入櫃）原始函數 ==========

// 產品目錄（從庫存明細自動提取）
function getProductCatalog() {
  var ss = getDatabaseSpreadsheet_();
  var ivS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.INVENTORY));
  var oiS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.ORDER_ITEMS));
  var catalog = {};

  // 從庫存明細提取
  for (var i = 1; i < ivS.length; i++) {
    var name = String(ivS[i][2] || '').trim();
    var price = toSafeInt_(ivS[i][5]);
    if (name && !catalog[name]) catalog[name] = { name: name, price: price, brand: extractBrand_(name) };
    else if (name && price > 0 && !catalog[name].price) catalog[name].price = price;
  }
  // 從訂單明細補充
  for (var j = 1; j < oiS.length; j++) {
    var nm = String(oiS[j][1] || '').trim();
    var pr = toSafeInt_(oiS[j][5]);
    if (nm && !catalog[nm]) catalog[nm] = { name: nm, price: pr, brand: extractBrand_(nm) };
  }

  var list = Object.values(catalog);
  list.sort(function(a, b) {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    return a.name.localeCompare(b.name);
  });
  return list;
}

function extractBrand_(name) {
  var n = String(name).toUpperCase();
  var brands = ['COHIBA','MONTECRISTO','ROMEO Y JULIETA','HOYO DE MONTERREY','H.UPMANN','H. UPMANN','PARTAGAS','BOLIVAR','TRINIDAD','SANCHO PANZA','RAMON ALLONES','DAVIDOFF','DIPLOMATICOS','QUAI DORSAY','JUAN LOPEZ','EL REY','TTT','VEGUEROS'];
  for (var i = 0; i < brands.length; i++) { if (n.indexOf(brands[i]) !== -1) return brands[i]; }
  return '其他品牌';
}

function confirmArrival(orderId, itemName, arriveQty, cabinetNo, operator) {
  var ss = getDatabaseSpreadsheet_();
  var oiS = ss.getSheetByName(SHEET_NAMES.ORDER_ITEMS);
  var ivS = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  var oS = ss.getSheetByName(SHEET_NAMES.ORDERS);
  var oiD = getSheetValues_(oiS);
  var now = formatDateTime_(new Date());
  var vipId = '', found = false;

  // 找到訂單取得會員編號
  var oD = getSheetValues_(oS);
  for (var oi = 1; oi < oD.length; oi++) {
    if (String(oD[oi][0]).trim() === orderId) { vipId = String(oD[oi][1]).trim(); break; }
  }
  if (!vipId) throw new Error('找不到訂單 ' + orderId);

  // 更新訂單明細
  for (var i = 1; i < oiD.length; i++) {
    if (String(oiD[i][0]).trim() === orderId && String(oiD[i][1]).trim() === itemName) {
      var oldArrive = toSafeInt_(oiD[i][3]);
      var oldPending = toSafeInt_(oiD[i][4]);
      var newArrive = oldArrive + arriveQty;
      var newPending = Math.max(0, oldPending - arriveQty);
      var newStatus = newPending <= 0 ? '已到齊' : '部分到貨(入櫃' + newArrive + '/未到' + newPending + ')';
      oiS.getRange(i + 1, 4, 1, 3).setValues([[newArrive, newPending, oiD[i][5]]]);
      oiS.getRange(i + 1, 7).setValue(newStatus);
      found = true;
      break;
    }
  }
  if (!found) throw new Error('找不到品項 ' + itemName);

  // 新增庫存
  ivS.appendRow([vipId, String(cabinetNo || '').trim(), itemName, arriveQty, normalizeSlashDate_(new Date()), 0, now]);

  // LINE 到貨通知
  try { sendArrivalNotification_(vipId, itemName, arriveQty); } catch(e) {}

  updateVipStatsInSheet_();
  logAction_('到貨入庫', vipId, orderId, itemName + ' x' + arriveQty + ' 入' + (cabinetNo || '未指定') + '號櫃', '', operator);
  SpreadsheetApp.flush();
  return { ok: true, message: '到貨確認完成！' + itemName + ' x' + arriveQty + ' 已入庫', inventory: readInventoryData_(), erpData: readErpData_() };
}

// ========== 庫存盤點調整 ==========
function adjustInventory(vipId, cabinetNo, itemName, newQty, reason, operator) {
  var ss = getDatabaseSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  var data = getSheetValues_(sh);
  var now = formatDateTime_(new Date());
  var found = false;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === vipId && (String(data[i][1]).trim() || '未指定櫃位') === cabinetNo && String(data[i][2]).trim() === itemName) {
      var oldQty = toSafeInt_(data[i][3]);
      sh.getRange(i + 1, 4).setValue(newQty);
      sh.getRange(i + 1, 7).setValue(now);
      logAction_('庫存調整', vipId, cabinetNo, itemName + ': ' + oldQty + '→' + newQty + ' (' + (reason || '盤點調整') + ')', '', operator);
      found = true;
      break;
    }
  }
  if (!found) throw new Error('找不到此庫存品項');

  updateVipStatsInSheet_();
  SpreadsheetApp.flush();
  return { ok: true, message: '庫存已調整：' + itemName + ' → ' + newQty + ' 支', inventory: readInventoryData_(), erpData: readErpData_() };
}

// ========== 員工帳號管理 ==========
function addStaffAccount(code, name, role, operator) {
  if (!code || !name) throw new Error('請輸入員工代碼和姓名');
  var ss = getDatabaseSpreadsheet_();
  var sh = ensureSheetWithHeaders_(ss, SHEET_NAMES.STAFF, STAFF_HEADERS);
  var data = getSheetValues_(sh);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(code).trim()) throw new Error('代碼 ' + code + ' 已存在');
  }
  sh.appendRow([String(code).trim(), String(name).trim(), role || 'staff', '啟用', formatDateTime_(new Date())]);
  logAction_('新增員工', '', code, name + ' (' + (role || 'staff') + ')', '', operator);
  return { ok: true, message: '員工 ' + name + ' (代碼 ' + code + ') 已新增' };
}

function toggleStaffStatus(code, operator) {
  var ss = getDatabaseSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAMES.STAFF);
  if (!sh) throw new Error('員工帳號表不存在');
  var data = getSheetValues_(sh);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(code).trim()) {
      var cur = String(data[i][3] || '啟用').trim();
      var nw = cur === '啟用' ? '停用' : '啟用';
      sh.getRange(i + 1, 4).setValue(nw);
      logAction_('員工狀態', '', code, data[i][1] + ': ' + cur + '→' + nw, '', operator);
      return { ok: true, message: data[i][1] + ' 已' + nw };
    }
  }
  throw new Error('找不到員工代碼 ' + code);
}

function getStaffList() {
  var ss = getDatabaseSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAMES.STAFF);
  if (!sh) return [];
  var data = getSheetValues_(sh);
  var list = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim()) {
      list.push({ code: String(data[i][0]).trim(), name: String(data[i][1]).trim(), role: String(data[i][2] || 'staff').trim(), status: String(data[i][3] || '啟用').trim() });
    }
  }
  return list;
}

// ========== 櫃位續約 ==========
function renewCabinet(vipId, newStartDate, operator) {
  var ss = getDatabaseSpreadsheet_();
  var vS = ss.getSheetByName(SHEET_NAMES.VIPS);
  var data = getSheetValues_(vS);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(vipId).trim()) {
      var d = newStartDate ? normalizeSlashDate_(newStartDate) : normalizeSlashDate_(new Date());
      vS.getRange(i + 1, 3).setValue(d);
      logAction_('櫃位續約', vipId, '', '開櫃日期更新為 ' + d, '', operator);
      return { ok: true, message: '會員 ' + data[i][1] + ' 已續約，新開櫃日期：' + d, inventory: readInventoryData_() };
    }
  }
  throw new Error('找不到會員 ' + vipId);
}

// ========== 自動備份 ==========
function autoBackup() {
  var ss = getDatabaseSpreadsheet_();
  var fols = DriveApp.getFoldersByName('W_CIGAR_BACKUP');
  var fol = fols.hasNext() ? fols.next() : DriveApp.createFolder('W_CIGAR_BACKUP');
  var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  var copy = ss.copy('VIP系統備份_' + today);
  DriveApp.getFileById(copy.getId()).moveTo(fol);
  logAction_('自動備份', '', '', '備份至 W_CIGAR_BACKUP/' + today, '', {});
  Logger.log('備份完成：VIP系統備份_' + today);
  return { ok: true, message: '備份完成' };
}

// 設定每週自動備份
function setupWeeklyBackup() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoBackup') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('autoBackup').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  Logger.log('已設定每週一凌晨 3:00 自動備份');
  return { ok: true, message: '已設定每週一 3:00 自動備份' };
}

// ========== LINE 推播系統 ==========

// 發送 LINE 個人推播（需要 LINE User ID）
function sendLinePush_(lineUserId, message) {
  if (!lineUserId || !LINE_CHANNEL_TOKEN) return false;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_CHANNEL_TOKEN },
      payload: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: message }] })
    });
    return true;
  } catch(e) { Logger.log('LINE push failed: ' + e.message); return false; }
}

// 發送 LINE 群發（發給所有加好友的人）
function sendLineBroadcast_(message) {
  if (!LINE_CHANNEL_TOKEN) return false;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_CHANNEL_TOKEN },
      payload: JSON.stringify({ messages: [{ type: 'text', text: message }] })
    });
    return true;
  } catch(e) { Logger.log('LINE broadcast failed: ' + e.message); return false; }
}

// 發送 Flex Message（精美卡片版）
function sendLineFlexPush_(lineUserId, altText, flexContents) {
  if (!lineUserId || !LINE_CHANNEL_TOKEN) return false;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_CHANNEL_TOKEN },
      payload: JSON.stringify({ to: lineUserId, messages: [{ type: 'flex', altText: altText, contents: flexContents }] })
    });
    return true;
  } catch(e) { Logger.log('LINE flex push failed: ' + e.message); return false; }
}

// 取得會員的 LINE User ID（從會員主檔第9欄 I 欄讀取）
function getVipLineId_(vipId) {
  var ss = getDatabaseSpreadsheet_();
  var vS = getSheetValues_(ss.getSheetByName(SHEET_NAMES.VIPS));
  for (var i = 1; i < vS.length; i++) {
    if (String(vS[i][0]).trim() === String(vipId).trim()) {
      return (vS[i][8]) ? String(vS[i][8]).trim() : '';
    }
  }
  return '';
}

// 設定會員的 LINE User ID
function setVipLineId(vipId, lineUserId) {
  var ss = getDatabaseSpreadsheet_();
  var vS = ss.getSheetByName(SHEET_NAMES.VIPS);
  var data = getSheetValues_(vS);
  // 確保 I1 欄位有表頭
  if (!data[0][8] || String(data[0][8]).trim() !== 'LINE User ID') {
    vS.getRange(1, 9).setValue('LINE User ID').setFontWeight('bold').setBackground('#1f1f1f').setFontColor('#d0a54f');
  }
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(vipId).trim()) {
      vS.getRange(i + 1, 9).setValue(String(lineUserId).trim());
      return { ok: true, message: '已綁定 LINE ID：' + vipId };
    }
  }
  throw new Error('找不到會員 ' + vipId);
}

// ===== 每日自動檢查（設為時間驅動觸發條件） =====
function dailyLineCheck() {
  var results = { lowStock: [], expiring: [], sent: 0 };
  try {
    results.lowStock = checkLowStockAlerts_();
    results.expiring = checkExpiryAlerts_();
    results.sent = results.lowStock.length + results.expiring.length;
    logAction_('每日LINE檢查', '', '', '低庫存:' + results.lowStock.length + ' 到期:' + results.expiring.length, '', {});
  } catch(e) { Logger.log('dailyLineCheck error: ' + e.message); }
  return results;
}

// 低庫存提醒
function checkLowStockAlerts_() {
  var inv = readInventoryData_();
  var alerts = [];
  var vipIds = Object.keys(inv);
  for (var vi = 0; vi < vipIds.length; vi++) {
    var vipId = vipIds[vi];
    var vip = inv[vipId];
    var lineId = getVipLineId_(vipId);
    var lowItems = [];
    var cabs = Object.keys(vip.cabinets);
    for (var ci = 0; ci < cabs.length; ci++) {
      var items = vip.cabinets[cabs[ci]];
      var itemNames = Object.keys(items);
      for (var ii = 0; ii < itemNames.length; ii++) {
        if (items[itemNames[ii]].qty > 0 && items[itemNames[ii]].qty <= LINE_LOW_STOCK_THRESHOLD) {
          lowItems.push(itemNames[ii] + ' 僅剩 ' + items[itemNames[ii]].qty + ' 支');
        }
      }
    }
    if (lowItems.length > 0) {
      var msg = '🔔 W CIGAR BAR 窖藏提醒\n\n'
        + '尊敬的 ' + vip.name + '，您的以下窖藏庫存偏低：\n\n'
        + lowItems.join('\n')
        + '\n\n建議儘早補貨，以確保您的雪茄窖藏充足。\n如需訂購，請直接回覆此訊息或聯繫您的專屬管家。';
      if (lineId) { sendLinePush_(lineId, msg); alerts.push({ vipId: vipId, type: 'push', items: lowItems.length }); }
      else { alerts.push({ vipId: vipId, type: 'no_line_id', items: lowItems.length }); }
    }
  }
  return alerts;
}

// 櫃位到期預警
function checkExpiryAlerts_() {
  var inv = readInventoryData_();
  var alerts = [];
  var now = new Date();
  var vipIds = Object.keys(inv);
  for (var vi = 0; vi < vipIds.length; vi++) {
    var vipId = vipIds[vi];
    var vip = inv[vipId];
    if (!vip.startDate) continue;
    var start = new Date(vip.startDate.replace(/\//g, '-'));
    if (isNaN(start.getTime())) continue;
    var expiryDate = new Date(start);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    var daysLeft = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysLeft > 0 && daysLeft <= LINE_EXPIRY_WARNING_DAYS) {
      var lineId = getVipLineId_(vipId);
      var msg = '⏰ W CIGAR BAR 櫃位到期提醒\n\n'
        + '尊敬的 ' + vip.name + '，您的尊榮雪茄窖藏櫃將於 ' + daysLeft + ' 天後到期（'
        + Utilities.formatDate(expiryDate, 'Asia/Taipei', 'yyyy/MM/dd') + '）。\n\n'
        + '為確保您的珍藏雪茄持續享有 24 小時恆溫恆濕的頂級保管服務，請於到期前聯繫管家辦理續約。\n\n'
        + '💎 續約尊榮會員，繼續享受 W CIGAR BAR 專屬禮遇。';
      if (lineId) { sendLinePush_(lineId, msg); alerts.push({ vipId: vipId, daysLeft: daysLeft, type: 'push' }); }
      else { alerts.push({ vipId: vipId, daysLeft: daysLeft, type: 'no_line_id' }); }
    }
  }
  return alerts;
}

// 收款確認通知（在收款完成後呼叫）
function sendPaymentNotification_(vipId, amount, orderId) {
  var lineId = getVipLineId_(vipId);
  if (!lineId) return;
  var vipName = getVipNameById_(vipId);
  var msg = '💳 W CIGAR BAR 收款確認\n\n'
    + '尊敬的 ' + vipName + '，已確認收到您的款項：\n\n'
    + '💰 金額：NT$' + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '\n'
    + '📋 訂單：' + orderId + '\n\n'
    + '感謝您的惠顧，祝您品茗愉快！';
  sendLinePush_(lineId, msg);
}

// 到貨通知
function sendArrivalNotification_(vipId, itemName, qty) {
  var lineId = getVipLineId_(vipId);
  if (!lineId) return;
  var vipName = getVipNameById_(vipId);
  var msg = '📦 W CIGAR BAR 到貨通知\n\n'
    + '尊敬的 ' + vipName + '，您預購的商品已到貨：\n\n'
    + '🚬 ' + itemName + ' × ' + qty + ' 支\n\n'
    + '已安排放入您的專屬窖藏櫃進行醇化。\n歡迎隨時蒞臨品鑑！';
  sendLinePush_(lineId, msg);
}

// 後台手動發送通知（給單一會員）
function sendCustomNotification(vipId, message) {
  var lineId = getVipLineId_(vipId);
  if (!lineId) throw new Error('此會員尚未綁定 LINE User ID');
  var sent = sendLinePush_(lineId, message);
  if (sent) return { ok: true, message: '通知已發送至 ' + getVipNameById_(vipId) + ' 的 LINE' };
  throw new Error('發送失敗，請檢查 LINE 設定');
}

// 後台群發通知（給所有好友）
function sendBroadcastNotification(message) {
  var sent = sendLineBroadcast_(message);
  if (sent) return { ok: true, message: '群發通知已送出' };
  throw new Error('群發失敗');
}

// 一鍵設定每日自動檢查觸發條件
function setupDailyTrigger() {
  // 先刪除舊的觸發條件
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dailyLineCheck') ScriptApp.deleteTrigger(triggers[i]);
  }
  // 建立新的：每天早上 9 點執行
  ScriptApp.newTrigger('dailyLineCheck').timeBased().everyDays(1).atHour(9).create();
  Logger.log('已設定每日 9:00 自動執行 LINE 通知檢查');
  return { ok: true, message: '已設定每日 9:00 自動檢查低庫存與櫃位到期' };
}

