/*************************************************
 * 勝茄雪茄集團｜經銷商專屬下單系統 V7
 * 試算表同步最終優化版
 *************************************************/

const SPREADSHEET_ID = '1PQxLJoIexVr4NIRluiukR00ptD2VhvNyypzAT5yT08E';
const ADMIN_EMAIL = '1063442145@qq.com';
const SHIPPING_FEE = 160;
const ADMIN_PASSWORD = 'CapaduraAdmin2026';

const SHEET_DEALERS = '經銷商帳號';
const SHEET_ORDERS = '訂單紀錄';
const SHEET_TERMS = '條款設定';
const SHEET_PRODUCTS = '商品主檔';

const SECTION_OPTIONS = [
  'frequent',
  'hot',
  'exclusive',
  'preorder',
  'monthly',
  'mini',
  'capadura',
  'cuban'
];

const SECTION_ALIAS_MAP = {
  '常購專區': 'frequent',
  '熱賣專區': 'hot',
  '獨家專區': 'exclusive',
  '獨家優惠預購專區': 'preorder',
  '每月活動專區': 'monthly',
  '小雪茄專區': 'mini',
  'capadura 非古專區': 'capadura',
  'capadura非古專區': 'capadura',
  '古巴雪茄現貨': 'cuban'
};

const FALLBACK_CNY_RATE = 0.22;


/* =========================
 * Web App 入口
 * ========================= */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'shop';

  if (page === 'admin') {
    return HtmlService.createTemplateFromFile('admin')
      .evaluate()
      .setTitle('勝茄後台查詢')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('勝茄雪茄集團｜經銷商專屬下單系統')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* =========================
 * 試算表
 * ========================= */
function getSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    throw new Error('無法開啟指定試算表，請確認 Spreadsheet ID 與權限是否正確。');
  }
}

function getRequiredSheet_(name) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('缺少工作表：' + name);
  return sheet;
}

function ensureSheetWithHeaders_(sheetName, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return sheet;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const existingSet = {};
  existingHeaders.forEach(function(h) {
    if (h) existingSet[String(h).trim()] = true;
  });

  const missing = headers.filter(function(h) {
    return !existingSet[h];
  });

  if (missing.length) {
    sheet.getRange(1, existingHeaders.filter(Boolean).length + 1, 1, missing.length).setValues([missing]);
  }

  return sheet;
}

function getHeaderIndex_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  headers.forEach(function(h, i) {
    idx[String(h).trim()] = i;
  });
  return idx;
}

/* =========================
 * 初始化系統
 * ========================= */
function initSystem() {
  const dealerHeaders = [
    '經銷商代號',
    '登入密碼',
    '經銷商名稱',
    '聯絡人',
    '電話',
    '客戶地址',
    '發票抬頭',
    '統一編號',
    '發票寄送Email',
    '等級',
    '狀態',
    '備註'
  ];

  const orderHeaders = [
    '建立時間',
    '訂單編號',
    '經銷商代號',
    '經銷商名稱',
    '等級',
    '聯絡人',
    '聯絡電話',
    '物流方式',
    '宅配地址',
    '發票類型',
    '發票抬頭',
    '統一編號',
    '發票寄送Email',
    '匯款末五碼',
    '付款方式說明',
    '商品小計',
    '宅配運費',
    '訂單總額',
    '訂單明細JSON',
    '訂單明細文字',
    '備註',
    '狀態',
    '出貨單號',
    '最後更新時間',
    '發票服務費'
  ];

  const termHeaders = ['key', 'title', 'content'];

  const productHeaders = [
    '商品ID',
    '專區',
    '品牌',
    '品名',
    '規格',
    '支數/盒',
    'A級價格',
    'B級價格',
    'VIP價格',
    '建議售價',
    '庫存狀態',
    '標籤',
    '是否上架',
    '市場售價',
    '來源文件',
    '排序',
    '主圖URL',
    '主圖檔案ID'
  ];

  const dealerSheet = ensureSheetWithHeaders_(SHEET_DEALERS, dealerHeaders);
  const orderSheet = ensureSheetWithHeaders_(SHEET_ORDERS, orderHeaders);
  const termsSheet = ensureSheetWithHeaders_(SHEET_TERMS, termHeaders);
  const productSheet = ensureSheetWithHeaders_(SHEET_PRODUCTS, productHeaders);

  if (dealerSheet.getLastRow() === 1) {
    dealerSheet.appendRow([
      'W001', '123456', '範例經銷商A', '王先生', '0912000001',
      '台北市大安區和平東路二段175巷35號1樓',
      '範例經銷商A', '90000001', 'demo@example.com',
      'A', '啟用', ''
    ]);
    dealerSheet.appendRow([
      'W002', '123456', '範例經銷商B', '陳小姐', '0912000002',
      '台中市西屯區範例地址100號',
      '範例經銷商B', '90000002', 'demo2@example.com',
      'B', '啟用', ''
    ]);
    dealerSheet.appendRow([
      'WVIP1', '123456', '範例VIP經銷商', '林先生', '0912000003',
      '高雄市鼓山區範例地址88號',
      '範例VIP經銷商', '90000003', 'vip@example.com',
      'VIP', '啟用', ''
    ]);
  }

  if (termsSheet.getLastRow() === 1) {
    getDefaultTerms_().forEach(function(t) {
      termsSheet.appendRow([t.key, t.title, t.content]);
    });
  }

  applyDealerValidation_(dealerSheet);
  applyProductValidation_(productSheet);

  return '系統初始化完成';
}

function applyDealerValidation_(sheet) {
  const idx = getHeaderIndex_(sheet);
  const lastRow = Math.max(sheet.getMaxRows(), 2);

  if (idx['等級'] != null) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['A', 'B', 'VIP'], true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, idx['等級'] + 1, lastRow - 1, 1).setDataValidation(rule);
  }

  if (idx['狀態'] != null) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['啟用', '停用'], true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, idx['狀態'] + 1, lastRow - 1, 1).setDataValidation(rule);
  }
}

function applyProductValidation_(sheet) {
  const idx = getHeaderIndex_(sheet);
  const lastRow = Math.max(sheet.getMaxRows(), 2);

  // 專區欄位採多標籤文字格式（例如 cuban,monthly），不套單選驗證，避免與前台多分類邏輯衝突
  if (idx['專區'] != null) {
    sheet.getRange(2, idx['專區'] + 1, lastRow - 1, 1).clearDataValidations();
  }

  if (idx['庫存狀態'] != null) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['現貨', '少量', '預購', '缺貨'], true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, idx['庫存狀態'] + 1, lastRow - 1, 1).setDataValidation(rule);
  }

  if (idx['是否上架'] != null) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Y', 'N'], true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, idx['是否上架'] + 1, lastRow - 1, 1).setDataValidation(rule);
  }
}


function repairProductSectionValidation() {
  const sheet = getRequiredSheet_(SHEET_PRODUCTS);
  const idx = getHeaderIndex_(sheet);

  if (idx['專區'] == null) {
    throw new Error('商品主檔缺少「專區」欄位');
  }

  const lastRow = Math.max(sheet.getMaxRows(), 2);
  sheet.getRange(2, idx['專區'] + 1, lastRow - 1, 1).clearDataValidations();
  return { success: true, message: '商品主檔「專區」欄位的舊下拉驗證已清除。' };
}

function getExchangeRates() {
  const timezone = Session.getScriptTimeZone() || 'Asia/Taipei';
  const fallbackDate = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const fallback = {
    success: true,
    base: 'TWD',
    rates: {
      TWD: 1,
      CNY: FALLBACK_CNY_RATE
    },
    date: fallbackDate,
    provider: 'System Fallback',
    isFallback: true,
    notice: '即時匯率抓取失敗，目前以系統備援匯率顯示；實際對帳與結算仍以新台幣為準。'
  };

  try {
    const response = UrlFetchApp.fetch('https://api.frankfurter.dev/v1/latest?base=TWD&symbols=CNY', {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        Accept: 'application/json'
      }
    });

    const status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      return fallback;
    }

    const data = JSON.parse(response.getContentText() || '{}');
    const rate = Number(data && data.rates && data.rates.CNY);
    if (!rate || !isFinite(rate)) {
      return fallback;
    }

    return {
      success: true,
      base: 'TWD',
      rates: {
        TWD: 1,
        CNY: rate
      },
      date: data.date || fallbackDate,
      provider: 'Frankfurter',
      isFallback: false,
      notice: '匯率僅供畫面即時換算參考；正式訂單、對帳與匯款仍以新台幣為準。'
    };
  } catch (err) {
    return fallback;
  }
}

/* =========================
 * 驗證
 * ========================= */
function authenticateDealer(dealerCode, password) {
  dealerCode = normalizeText_(dealerCode);
  password = normalizeText_(password);

  if (!dealerCode || !password) {
    return { success: false, error: '請輸入經銷商代號與密碼' };
  }

  const sheet = getRequiredSheet_(SHEET_DEALERS);
  const rows = sheet.getDataRange().getDisplayValues().slice(1);
  const idx = getHeaderIndex_(sheet);

  for (const r of rows) {
    const code = normalizeText_(r[idx['經銷商代號']]);
    const pwd = normalizeText_(r[idx['登入密碼']]);
    const status = normalizeText_(r[idx['狀態']]);

    if (code === dealerCode && pwd === password) {
      if (status !== '啟用') {
        return { success: false, error: '此帳號未啟用，請聯繫總公司' };
      }

      return {
        success: true,
        dealer: normalizeDealerRecord_(r, idx)
      };
    }
  }

  return { success: false, error: '經銷商代號或密碼錯誤' };
}

function authenticateAdmin(password) {
  return String(password || '') === ADMIN_PASSWORD
    ? { success: true }
    : { success: false, error: '後台密碼錯誤' };
}

/* =========================
 * 前台初始化
 * ========================= */
function getInitialDataByDealer(dealerCode) {
  const dealer = getDealerByCode_(dealerCode);
  if (!dealer) throw new Error('查無經銷商資料');

  const catalog = getCatalogByTier_(dealer.tier);
  const brands = Array.from(new Set(
    catalog.map(function(x) { return x.brand; }).filter(Boolean)
  )).sort(function(a, b) {
    return String(a).localeCompare(String(b), 'zh-Hant');
  });

  return {
    dealer: dealer,
    catalog: catalog,
    frequentItems: getFrequentItems_(dealer.dealerCode, dealer.tier),
    sections: [
      { key: 'all', label: '全部商品' },
      { key: 'frequent', label: '常購專區' },
      { key: 'hot', label: '熱賣專區' },
      { key: 'exclusive', label: '獨家專區' },
      { key: 'preorder', label: '獨家優惠預購專區' },
      { key: 'monthly', label: '每月活動專區' },
      { key: 'mini', label: '小雪茄專區' },
      { key: 'capadura', label: 'Capadura 非古專區' },
      { key: 'cuban', label: '古巴雪茄現貨' }
    ],
    brands: brands,
    complianceText: {
      title: '勝茄雪茄集團｜授權經銷採購入口',
      body: '本系統僅限已簽約之經銷商、授權合作通路與指定採購夥伴登入使用，不對一般消費者公開。帳號、密碼、分級報價、商品資料、活動內容與合作條件均屬內部商業資訊，禁止外流、截圖散播、轉傳或提供第三方使用。'
    },
    about: {
      title: '勝茄雪茄集團',
      subtitle: '整合品牌選品、經銷報價、通路合作與高端雪茄館體驗的專業採購入口',
      intro: '勝茄雪茄集團長期深耕台灣雪茄市場，整合古巴雪茄、精品非古雪茄、Capadura 品牌系列、雪茄館營運與授權通路合作。我們提供的不只是商品，而是一套更完整的選品邏輯、分級報價、品牌展示、教育訓練與高端接待方案，協助合作夥伴以更高效率建立穩定採購與銷售節奏。',
      strengths: [
        '古巴雪茄與精品非古雪茄雙主軸布局',
        '具備經銷制度、分級報價與穩定供貨架構',
        '結合雪茄文化、美學空間與高端客戶服務經驗',
        '可依通路需求提供選品建議、活動合作與展示規劃'
      ],
      lounges: [
        'W Cigar Bar CAPADURA｜品牌旗艦雪茄館',
        'W Cigar Bar｜結合雪茄、圈層社交與高端接待體驗',
        'B1 VIP 私享包廂空間｜提供尊榮雪茄品吸與私密會客服務'
      ]
    },
    showroom: {
      title: '歡迎蒞臨現場選購',
      text: '歡迎合作夥伴預約前往勝茄現場選購與洽談，現場可直接看貨、選貨、確認品項，並就品牌合作、活動陳列與高端客戶接待需求進一步溝通。',
      mapUrl: 'https://share.google/mVheTKJJsGImVSos9'
    },
    terms: getTerms_(),
    shippingFee: SHIPPING_FEE,
    footer: {
      company: '勝茄股份有限公司',
      copyright: '本系統與頁面內容、商品分類、報價資訊、活動方案、版面設計、文案與資料架構，均屬勝茄股份有限公司所有，未經授權不得重製、轉載、抄襲、截圖外流、公開散布或作為任何對外商業用途。',
      legal: '本系統僅限簽約經銷商、特約合作夥伴與授權通路使用，不對一般消費者公開販售；使用者應自行遵循菸害防制相關法令、年齡查核、陳列展示及銷售管理規範。如有未經授權使用、外流或違法行為，本公司保留終止合作及依法追究之權利。'
    }
  };
}

/* =========================
 * 商品：從試算表讀
 * ========================= */
function getCatalogByTier_(tier) {
  const sheet = getRequiredSheet_(SHEET_PRODUCTS);
  const values = sheet.getDataRange().getValues();
  const formulas = sheet.getDataRange().getFormulas();

  if (values.length < 2) return [];

  const idx = getHeaderIndex_(sheet);
  const rows = values.slice(1);
  const formulaRows = formulas.slice(1);

  const data = rows.map(function(r, rowIndex) {
    const fr = formulaRows[rowIndex];

    const itemId = normalizeText_(r[idx['商品ID']]);
    if (!itemId) return null;

    const enabled = normalizeText_(r[idx['是否上架']]).toUpperCase();
    if (enabled !== 'Y') return null;

    const dealerPrice = getTierPriceFromRow_(r, idx, tier);
    const imageUrl = resolveImageUrl_(r, fr, idx);
    const sectionRaw = normalizeText_(r[idx['專區']]);

    return {
      id: itemId,
      section: sectionRaw,
      sectionKeys: normalizeSectionKeys_(sectionRaw),
      brand: normalizeText_(r[idx['品牌']]),
      name: normalizeText_(r[idx['品名']]),
      spec: normalizeText_(r[idx['規格']]),
      pack: normalizeText_(r[idx['支數/盒']]),
      dealerPrice: dealerPrice,
      suggestPrice: toNumber_(r[idx['建議售價']]),
      stockStatus: normalizeText_(r[idx['庫存狀態']]) || '現貨',
      tag: normalizeText_(r[idx['標籤']]),
      sortOrder: toNumber_(r[idx['排序']]),
      imageUrl: imageUrl
    };
  }).filter(function(x) { return !!x; });

  data.sort(function(a, b) {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.name).localeCompare(String(b.name), 'zh-Hant');
  });

  return data;
}

function getTierPriceFromRow_(row, idx, tier) {
  if (tier === 'VIP') return toNumber_(row[idx['VIP價格']]);
  if (tier === 'B') return toNumber_(row[idx['B級價格']]);
  return toNumber_(row[idx['A級價格']]);
}

function resolveImageUrl_(row, formulaRow, idx) {
  const directUrl = idx['主圖URL'] != null ? String(row[idx['主圖URL']] || '').trim() : '';
  if (directUrl) return directUrl;

  const formula = idx['主圖URL'] != null ? String(formulaRow[idx['主圖URL']] || '').trim() : '';
  const formulaUrl = parseImageFormulaUrl_(formula);
  if (formulaUrl) return formulaUrl;

  const fileId = idx['主圖檔案ID'] != null ? String(row[idx['主圖檔案ID']] || '').trim() : '';
  if (fileId) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w1000';

  return '';
}

function parseImageFormulaUrl_(formula) {
  if (!formula) return '';
  const match = formula.match(/=IMAGE\("([^"]+)"/i);
  return match ? match[1] : '';
}

function toNumber_(v) {
  const n = Number(v || 0);
  return isNaN(n) ? 0 : n;
}

function normalizeText_(v) {
  return String(v == null ? '' : v).trim();
}

function normalizePhone_(v) {
  const raw = normalizeText_(v).replace(/\D/g, '');
  if (!raw) return '';
  if (raw.length === 9) return '0' + raw;
  return raw;
}

function normalizeTaxId_(v) {
  const raw = normalizeText_(v).replace(/\D/g, '');
  if (!raw) return '';
  return raw.length >= 8 ? raw : ('00000000' + raw).slice(-8);
}

function normalizeSectionKeys_(sectionValue) {
  return normalizeText_(sectionValue)
    .split(',')
    .map(function(x) {
      const raw = normalizeText_(x);
      if (!raw) return '';
      const lower = raw.toLowerCase();
      return SECTION_ALIAS_MAP[raw] || SECTION_ALIAS_MAP[lower] || lower;
    })
    .filter(function(x) { return !!x; });
}


function normalizeDealerRecord_(row, idx) {
  return {
    dealerCode: normalizeText_(row[idx['經銷商代號']]),
    dealerName: normalizeText_(row[idx['經銷商名稱']]),
    contactName: normalizeText_(row[idx['聯絡人']]),
    phone: normalizePhone_(row[idx['電話']]),
    address: normalizeText_(row[idx['客戶地址']]),
    invoiceTitle: normalizeText_(row[idx['發票抬頭']]),
    invoiceTaxId: normalizeTaxId_(row[idx['統一編號']]),
    invoiceEmail: normalizeText_(row[idx['發票寄送Email']]),
    tier: normalizeText_(row[idx['等級']] || 'A'),
    status: normalizeText_(row[idx['狀態']])
  };
}

function appendRecordByHeaders_(sheet, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(function(header) {
    return record.hasOwnProperty(header) ? record[header] : '';
  });
  sheet.appendRow(row);
}

function normalizeCartFromCatalog_(rawCart, tier) {
  const catalog = getCatalogByTier_(tier);
  const catalogMap = {};
  catalog.forEach(function(item) {
    catalogMap[String(item.id)] = item;
  });

  const normalizedCart = (rawCart || []).map(function(item) {
    const id = normalizeText_(item && item.id);
    const qty = Math.max(0, parseInt(item && item.qty, 10) || 0);
    const catalogItem = catalogMap[id];

    if (!id || !qty || !catalogItem) return null;
    if (normalizeText_(catalogItem.stockStatus) === '缺貨') return null;

    return {
      id: id,
      brand: catalogItem.brand,
      name: catalogItem.name,
      price: toNumber_(catalogItem.dealerPrice),
      qty: qty
    };
  }).filter(function(item) {
    return !!item;
  });

  if (!normalizedCart.length) {
    throw new Error('購物車沒有有效商品，請重新加入商品後再送出');
  }

  return normalizedCart;
}

/* =========================
 * 常購
 * ========================= */
function getFrequentItems_(dealerCode, tier) {
  const orderSheet = getRequiredSheet_(SHEET_ORDERS);

  if (orderSheet.getLastRow() < 2) {
    return getCatalogByTier_(tier).slice(0, 8);
  }

  const rows = orderSheet.getDataRange().getValues().slice(1);
  const idx = getHeaderIndex_(orderSheet);
  const counter = {};

  rows.forEach(function(r) {
    const code = normalizeText_(r[idx['經銷商代號']]);
    if (code !== dealerCode) return;

    const detailJson = idx['訂單明細JSON'] != null ? r[idx['訂單明細JSON']] : '';
    try {
      const items = JSON.parse(detailJson || '[]');
      items.forEach(function(it) {
        const key = normalizeText_(it.id);
        if (!key) return;
        counter[key] = (counter[key] || 0) + Number(it.qty || 0);
      });
    } catch (e) {}
  });

  const catalog = getCatalogByTier_(tier);
  const ranked = catalog
    .map(function(item) {
      const clone = JSON.parse(JSON.stringify(item));
      clone.score = counter[item.id] || 0;
      return clone;
    })
    .filter(function(item) {
      return item.score > 0;
    })
    .sort(function(a, b) {
      return b.score - a.score;
    })
    .slice(0, 8);

  return ranked.length ? ranked : catalog.slice(0, 8);
}

/* =========================
 * 條款
 * ========================= */
function getTerms_() {
  const sheet = getRequiredSheet_(SHEET_TERMS);
  if (sheet.getLastRow() < 2) return getDefaultTerms_();

  return sheet.getDataRange().getValues().slice(1).map(function(r) {
    return {
      key: r[0],
      title: r[1],
      content: r[2]
    };
  });
}

function getDefaultTerms_() {
  return [
    {
      key: 'shopping',
      title: '購物條款',
      content: '本系統僅供勝茄股份有限公司核准之經銷商、授權合作夥伴與特約通路登入訂購使用。經銷價格、商品資料、活動內容與合作條件均屬內部商業資訊，使用者不得對外公開、轉售帳號或將系統內容提供予未授權之第三人。訂單送出後即視為經銷商確認品項、數量、價格與合作條件無誤。'
    },
    {
      key: 'shipping',
      title: '運送條款',
      content: '本系統訂單一律採宅配出貨，單筆訂單固定收取宅配運費 NT$160。經銷商應提供正確收件資訊，若因地址、電話或收件資訊錯誤導致配送失敗、退回、重派或延誤，所衍生之額外費用由訂購方負擔。收到貨品後請立即檢查外箱、封條與內容物，如有異常應即時回報。'
    },
    {
      key: 'privacy',
      title: '隱私政策',
      content: '勝茄股份有限公司僅於經銷合作、訂單處理、物流配送、發票開立、對帳作業、售後服務及合作管理之必要範圍內蒐集與使用經銷商所提供之資料。未經授權，本公司不會將資料提供予無關第三方；惟依法令規定、主管機關要求、或履行合作及物流、發票作業所必要者，不在此限。'
    },
    {
      key: 'dealer',
      title: '經銷商約定條款',
      content: '經銷商應妥善保管登入代號與密碼，不得轉借、共用、出售、外流或提供未授權人員登入。經銷商應自行遵循菸害防制相關法令、年齡查核、展示陳列及銷售管理規範。若有未經授權轉傳、惡意比價外流、擅自公開價格、違法販售或損及品牌形象之情形，勝茄股份有限公司得立即停止帳號權限、終止合作並保留法律追訴權。'
    }
  ];
}

/* =========================
 * 下單
 * ========================= */
function processOrder(orderData) {
  try {
    if (!orderData) throw new Error('訂單資料為空');

    const dealer = getDealerByCode_(orderData.dealerCode);
    if (!dealer) throw new Error('查無經銷商資料');

    // 自動補帶經銷商資料
    if (!orderData.dealerName) orderData.dealerName = dealer.dealerName || '';
    if (!orderData.contactName) orderData.contactName = dealer.contactName || '';
    if (!orderData.phone) orderData.phone = dealer.phone || '';
    if (!orderData.homeAddress) orderData.homeAddress = dealer.address || '';
    if (!orderData.invoiceTitle) orderData.invoiceTitle = dealer.invoiceTitle || '';
    if (!orderData.invoiceTaxId) orderData.invoiceTaxId = dealer.invoiceTaxId || '';
    if (!orderData.invoiceEmail) orderData.invoiceEmail = dealer.invoiceEmail || '';

    validateOrder_(orderData);

    // 所有價格與品名以伺服器端商品主檔為準，避免前端資料被修改
    orderData.cart = normalizeCartFromCatalog_(orderData.cart, dealer.tier);

    const orderNo = generateOrderNo_();
    const itemSubtotal = (orderData.cart || []).reduce(function(sum, item) {
      return sum + (Number(item.price || 0) * Number(item.qty || 0));
    }, 0);
    const shippingFee = SHIPPING_FEE;
    const invoiceRequired = normalizeText_(orderData.invoiceType) !== '';
    const invoiceFee = invoiceRequired ? Math.round((itemSubtotal + shippingFee) * 0.05) : 0;
    const grandTotal = itemSubtotal + shippingFee + invoiceFee;
    const status = '待處理';
    const now = new Date();

    const detailText = (orderData.cart || []).map(function(i) {
      const subtotal = Number(i.price || 0) * Number(i.qty || 0);
      return i.brand + '｜' + i.name + '｜單價 NT$' + Number(i.price || 0).toLocaleString() + '｜數量 ' + i.qty + '｜小計 NT$' + subtotal.toLocaleString();
    }).join('\\n');

    const orderSheet = getRequiredSheet_(SHEET_ORDERS);
    appendRecordByHeaders_(orderSheet, {
      '建立時間': now,
      '訂單編號': orderNo,
      '經銷商代號': normalizeText_(orderData.dealerCode),
      '經銷商名稱': normalizeText_(orderData.dealerName),
      '等級': dealer.tier,
      '聯絡人': normalizeText_(orderData.contactName),
      '聯絡電話': normalizePhone_(orderData.phone),
      '物流方式': '宅配',
      '宅配地址': normalizeText_(orderData.homeAddress),
      '發票類型': normalizeText_(orderData.invoiceType),
      '發票抬頭': normalizeText_(orderData.invoiceTitle),
      '統一編號': normalizeTaxId_(orderData.invoiceTaxId),
      '發票寄送Email': normalizeText_(orderData.invoiceEmail),
      '匯款末五碼': normalizeText_(orderData.remitAccount),
      '付款方式說明': normalizeText_(orderData.paymentNote),
      '商品小計': itemSubtotal,
      '宅配運費': shippingFee,
      '訂單總額': grandTotal,
      '訂單明細JSON': JSON.stringify(orderData.cart || []),
      '訂單明細文字': detailText,
      '備註': normalizeText_(orderData.notes),
      '狀態': status,
      '出貨單號': '',
      '最後更新時間': now,
      '發票服務費': invoiceFee
    });

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: '【勝茄經銷訂單】' + orderNo + '｜' + orderData.dealerName + '｜NT$' + grandTotal.toLocaleString(),
      htmlBody: buildOrderEmailHtml_(orderNo, dealer.tier, orderData, itemSubtotal, shippingFee, invoiceFee, grandTotal, status)
    });

    return {
      success: true,
      orderNo: orderNo,
      grandTotal: grandTotal,
      itemSubtotal: itemSubtotal,
      shippingFee: shippingFee,
      invoiceFee: invoiceFee,
      status: status,
      settleCurrency: 'TWD'
    };

  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function validateOrder_(orderData) {
  if (!orderData) throw new Error('訂單資料為空');
  if (!normalizeText_(orderData.dealerCode)) throw new Error('缺少經銷商代號');
  if (!normalizeText_(orderData.dealerName)) throw new Error('請填寫經銷單位名稱');
  if (!normalizeText_(orderData.contactName)) throw new Error('請填寫聯絡人姓名');
  if (!normalizePhone_(orderData.phone)) throw new Error('請填寫聯絡電話');
  if (!normalizeText_(orderData.homeAddress)) throw new Error('請填寫宅配地址');
  if (!normalizeText_(orderData.remitAccount)) throw new Error('請填寫匯款末五碼');
  if (!normalizeText_(orderData.notes)) throw new Error('請填寫備註');
  if (!orderData.cart || !orderData.cart.length) throw new Error('購物車為空');

  if (normalizeText_(orderData.invoiceType)) {
    if (!normalizeText_(orderData.invoiceTitle)) throw new Error('已選擇發票，請填寫發票抬頭');
    if (!normalizeText_(orderData.invoiceEmail)) throw new Error('已選擇發票，請填寫發票寄送 Email');
    if (normalizeText_(orderData.invoiceType) === '公司戶' && !normalizeTaxId_(orderData.invoiceTaxId)) {
      throw new Error('公司戶請填寫統一編號');
    }
  }
}

function generateOrderNo_() {
  const now = new Date();
  const y = now.getFullYear();
  const m = ('0' + (now.getMonth() + 1)).slice(-2);
  const d = ('0' + now.getDate()).slice(-2);
  const h = ('0' + now.getHours()).slice(-2);
  const n = ('0' + now.getMinutes()).slice(-2);
  const s = ('0' + now.getSeconds()).slice(-2);
  const rand = Math.floor(100 + Math.random() * 900);
  return 'WC' + y + m + d + h + n + s + rand;
}

/* =========================
 * 後台
 * ========================= */
function getOrderList() {
  const sheet = getRequiredSheet_(SHEET_ORDERS);
  if (sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const header = values[0];

  return values.slice(1).map(function(r) {
    const obj = {};
    header.forEach(function(h, i) { obj[h] = r[i]; });
    return obj;
  }).reverse();
}

function updateOrderStatus(orderNo, newStatus, shippingNo) {
  const sheet = getRequiredSheet_(SHEET_ORDERS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('查無訂單');

  const header = values[0];
  const idx = {};
  header.forEach(function(h, i) { idx[h] = i; });

  let foundRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx['訂單編號']]) === String(orderNo)) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow === -1) throw new Error('查無此訂單');

  sheet.getRange(foundRow, idx['狀態'] + 1).setValue(newStatus);
  sheet.getRange(foundRow, idx['出貨單號'] + 1).setValue(shippingNo || '');
  sheet.getRange(foundRow, idx['最後更新時間'] + 1).setValue(new Date());

  const rowValues = sheet.getRange(foundRow, 1, 1, header.length).getValues()[0];
  const order = {};
  header.forEach(function(h, i) { order[h] = rowValues[i]; });

  const mail = String(order['發票寄送Email'] || '').trim();
  if (mail) {
    MailApp.sendEmail({
      to: mail,
      subject: '【勝茄訂單通知】' + orderNo + '｜狀態更新：' + newStatus,
      htmlBody: buildStatusUpdateEmailHtml_(order, newStatus, shippingNo || '')
    });
  }

  return { success: true };
}

/* =========================
 * PDF
 * ========================= */
function exportOrderPdf(orderNo) {
  const order = getOrderByNo_(orderNo);
  const html = buildOrderPdfHtml_(order, '訂單單據');
  const blob = Utilities.newBlob(html, 'text/html', orderNo + '.html')
    .getAs('application/pdf')
    .setName(orderNo + '_訂單單據.pdf');
  const file = DriveApp.createFile(blob);
  return { success: true, url: file.getUrl(), name: file.getName() };
}

function exportPackingSlipPdf(orderNo) {
  const order = getOrderByNo_(orderNo);
  const html = buildPackingSlipHtml_(order);
  const blob = Utilities.newBlob(html, 'text/html', orderNo + '_packing.html')
    .getAs('application/pdf')
    .setName(orderNo + '_出貨單.pdf');
  const file = DriveApp.createFile(blob);
  return { success: true, url: file.getUrl(), name: file.getName() };
}

/* =========================
 * 工具
 * ========================= */
function getDealerByCode_(dealerCode) {
  const sheet = getRequiredSheet_(SHEET_DEALERS);
  const rows = sheet.getDataRange().getDisplayValues().slice(1);
  const idx = getHeaderIndex_(sheet);

  for (const r of rows) {
    const code = normalizeText_(r[idx['經銷商代號']]);
    if (code === normalizeText_(dealerCode)) {
      return normalizeDealerRecord_(r, idx);
    }
  }
  return null;
}

function getOrderByNo_(orderNo) {
  const orders = getOrderList();
  const order = orders.find(function(o) {
    return String(o['訂單編號']) === String(orderNo);
  });
  if (!order) throw new Error('查無此訂單');
  return order;
}

function tr_(label, value) {
  return ''
    + '<tr>'
    + '<td style="padding:10px;border:1px solid #ddd;background:#f8fafc;width:180px;">' + escapeHtml_(label) + '</td>'
    + '<td style="padding:10px;border:1px solid #ddd;">' + escapeHtml_(value) + '</td>'
    + '</tr>';
}

function escapeHtml_(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* =========================
 * Email / PDF HTML
 * ========================= */
function buildOrderEmailHtml_(orderNo, tier, orderData, itemSubtotal, shippingFee, invoiceFee, grandTotal, status) {
  const rows = (orderData.cart || []).map(function(i) {
    const subtotal = Number(i.price || 0) * Number(i.qty || 0);
    return ''
      + '<tr>'
      + '<td style="padding:10px;border:1px solid #ddd;">' + escapeHtml_(i.brand) + '</td>'
      + '<td style="padding:10px;border:1px solid #ddd;">' + escapeHtml_(i.name) + '</td>'
      + '<td style="padding:10px;border:1px solid #ddd;text-align:right;">NT$ ' + Number(i.price || 0).toLocaleString() + '</td>'
      + '<td style="padding:10px;border:1px solid #ddd;text-align:center;">' + Number(i.qty || 0) + '</td>'
      + '<td style="padding:10px;border:1px solid #ddd;text-align:right;">NT$ ' + subtotal.toLocaleString() + '</td>'
      + '</tr>';
  }).join('');

  return ''
    + '<div style="font-family:Arial,\'Noto Sans TC\',sans-serif;color:#111;">'
    + '<h2 style="color:#b45309;">勝茄股份有限公司｜經銷商訂單通知</h2>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">'
    + tr_('訂單編號', orderNo)
    + tr_('經銷商代號', orderData.dealerCode)
    + tr_('經銷商名稱', orderData.dealerName)
    + tr_('經銷商等級', tier)
    + tr_('聯絡人', orderData.contactName)
    + tr_('聯絡電話', orderData.phone)
    + tr_('宅配地址', orderData.homeAddress)
    + tr_('發票類型', orderData.invoiceType || '未開立')
    + tr_('發票抬頭', orderData.invoiceTitle || '')
    + tr_('統一編號', orderData.invoiceTaxId || '')
    + tr_('發票寄送Email', orderData.invoiceEmail || '')
    + tr_('匯款末五碼', orderData.remitAccount)
    + tr_('付款提醒', orderData.paymentNote || '')
    + tr_('商品小計', 'NT$ ' + Number(itemSubtotal).toLocaleString())
    + tr_('宅配運費', 'NT$ ' + Number(shippingFee).toLocaleString())
    + tr_('發票服務費', 'NT$ ' + Number(invoiceFee).toLocaleString())
    + tr_('訂單總額', 'NT$ ' + Number(grandTotal).toLocaleString())
    + tr_('備註', orderData.notes || '')
    + tr_('狀態', status)
    + '</table>'
    + '<h3 style="color:#92400e;">商品明細</h3>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr>'
    + '<th style="padding:10px;border:1px solid #ddd;background:#1f2937;color:#fff;">品牌</th>'
    + '<th style="padding:10px;border:1px solid #ddd;background:#1f2937;color:#fff;">品名</th>'
    + '<th style="padding:10px;border:1px solid #ddd;background:#1f2937;color:#fff;">單價</th>'
    + '<th style="padding:10px;border:1px solid #ddd;background:#1f2937;color:#fff;">數量</th>'
    + '<th style="padding:10px;border:1px solid #ddd;background:#1f2937;color:#fff;">小計</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>';
}

function buildStatusUpdateEmailHtml_(order, newStatus, shippingNo) {
  return ''
    + '<div style="font-family:Arial,\'Noto Sans TC\',sans-serif;color:#111;line-height:1.8;">'
    + '<h2 style="color:#b45309;">勝茄股份有限公司｜訂單狀態更新</h2>'
    + '<p>您的訂單狀態已更新。</p>'
    + '<table style="width:100%;border-collapse:collapse;">'
    + tr_('訂單編號', order['訂單編號'])
    + tr_('經銷商名稱', order['經銷商名稱'])
    + tr_('最新狀態', newStatus)
    + tr_('出貨單號', shippingNo || '')
    + tr_('訂單總額', 'NT$ ' + Number(order['訂單總額'] || 0).toLocaleString())
    + '</table>'
    + '<p style="margin-top:16px;">如有任何問題，請直接聯繫勝茄客服。</p>'
    + '</div>';
}

function buildOrderPdfHtml_(order, title) {
  return ''
    + '<html><head><meta charset="UTF-8"><style>'
    + 'body{font-family:Arial,"Noto Sans TC",sans-serif;padding:24px;color:#111;}'
    + 'h1{color:#92400e;}'
    + 'table{width:100%;border-collapse:collapse;margin-top:12px;}'
    + 'td,th{border:1px solid #ccc;padding:8px;font-size:12px;vertical-align:top;}'
    + 'th{background:#f5f5f5;width:180px;text-align:left;}'
    + '</style></head><body>'
    + '<h1>勝茄股份有限公司｜' + escapeHtml_(title) + '</h1>'
    + '<table>'
    + '<tr><th>訂單編號</th><td>' + escapeHtml_(order['訂單編號']) + '</td></tr>'
    + '<tr><th>經銷商代號</th><td>' + escapeHtml_(order['經銷商代號']) + '</td></tr>'
    + '<tr><th>經銷商名稱</th><td>' + escapeHtml_(order['經銷商名稱']) + '</td></tr>'
    + '<tr><th>等級</th><td>' + escapeHtml_(order['等級']) + '</td></tr>'
    + '<tr><th>聯絡人</th><td>' + escapeHtml_(order['聯絡人']) + '</td></tr>'
    + '<tr><th>聯絡電話</th><td>' + escapeHtml_(order['聯絡電話']) + '</td></tr>'
    + '<tr><th>宅配地址</th><td>' + escapeHtml_(order['宅配地址']) + '</td></tr>'
    + '<tr><th>發票類型</th><td>' + escapeHtml_(order['發票類型']) + '</td></tr>'
    + '<tr><th>發票抬頭</th><td>' + escapeHtml_(order['發票抬頭']) + '</td></tr>'
    + '<tr><th>統一編號</th><td>' + escapeHtml_(order['統一編號']) + '</td></tr>'
    + '<tr><th>發票寄送Email</th><td>' + escapeHtml_(order['發票寄送Email']) + '</td></tr>'
    + '<tr><th>匯款末五碼</th><td>' + escapeHtml_(order['匯款末五碼']) + '</td></tr>'
    + '<tr><th>商品小計</th><td>NT$ ' + Number(order['商品小計'] || 0).toLocaleString() + '</td></tr>'
    + '<tr><th>宅配運費</th><td>NT$ ' + Number(order['宅配運費'] || 0).toLocaleString() + '</td></tr>'
    + '<tr><th>發票服務費</th><td>NT$ ' + Number(order['發票服務費'] || 0).toLocaleString() + '</td></tr>'
    + '<tr><th>訂單總額</th><td>NT$ ' + Number(order['訂單總額'] || 0).toLocaleString() + '</td></tr>'
    + '<tr><th>訂單明細</th><td style="white-space:pre-line;">' + escapeHtml_(order['訂單明細文字'] || '') + '</td></tr>'
    + '<tr><th>備註</th><td>' + escapeHtml_(order['備註'] || '') + '</td></tr>'
    + '<tr><th>狀態</th><td>' + escapeHtml_(order['狀態'] || '') + '</td></tr>'
    + '<tr><th>出貨單號</th><td>' + escapeHtml_(order['出貨單號'] || '') + '</td></tr>'
    + '</table></body></html>';
}

function buildPackingSlipHtml_(order) {
  return ''
    + '<html><head><meta charset="UTF-8"><style>'
    + 'body{font-family:Arial,"Noto Sans TC",sans-serif;padding:24px;color:#111;}'
    + 'h1{color:#92400e;}'
    + 'table{width:100%;border-collapse:collapse;margin-top:12px;}'
    + 'td,th{border:1px solid #ccc;padding:8px;font-size:12px;vertical-align:top;}'
    + 'th{background:#f5f5f5;width:180px;text-align:left;}'
    + '</style></head><body>'
    + '<h1>勝茄股份有限公司｜出貨單</h1>'
    + '<table>'
    + '<tr><th>訂單編號</th><td>' + escapeHtml_(order['訂單編號']) + '</td></tr>'
    + '<tr><th>經銷商名稱</th><td>' + escapeHtml_(order['經銷商名稱']) + '</td></tr>'
    + '<tr><th>聯絡人</th><td>' + escapeHtml_(order['聯絡人']) + '</td></tr>'
    + '<tr><th>聯絡電話</th><td>' + escapeHtml_(order['聯絡電話']) + '</td></tr>'
    + '<tr><th>宅配地址</th><td>' + escapeHtml_(order['宅配地址']) + '</td></tr>'
    + '<tr><th>訂單明細</th><td style="white-space:pre-line;">' + escapeHtml_(order['訂單明細文字'] || '') + '</td></tr>'
    + '<tr><th>備註</th><td>' + escapeHtml_(order['備註'] || '') + '</td></tr>'
    + '<tr><th>出貨單號</th><td>' + escapeHtml_(order['出貨單號'] || '') + '</td></tr>'
    + '<tr><th>狀態</th><td>' + escapeHtml_(order['狀態'] || '') + '</td></tr>'
    + '</table></body></html>';
}
