import { useState, useLayoutEffect, useRef, useCallback } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

/**
 * GSP Form A 產地證明 — 正本掃描底圖（資料區已清空）+ 可填欄位 + 列印 + PDF 下載
 * W Cigar Bar 老闆後台「報關」模組
 * 底圖：public/customs/form-a-bg-clean.jpg
 *   = 正本掃描，但用程式精準把 12 個「資料填寫區」塗白清空，
 *     完整保留 DGA logo / 海關認證圓章 / 出口商簽名章 / 格線 / 制式英文。
 *   → 改任何欄位都乾淨、列印/下載不會跟舊字重疊。
 */

const BG_SRC = "/customs/form-a-bg-clean.jpg";

// id, left%, top%, width%, height%, multiline, fontSize(cqw), color, align
// 注意：出口商 / 收貨人 / 生產國 = 正本固定內容，保留在底圖（原版字體 1:1），不放輸入框。
//       只有每批會變的欄位才做成可填。
const FIELDS = [
  ["certNo",    77.000,  2.300, 17.500, 3.300, false, 2.00, "#c00", "center"],
  ["transport",  6.000, 30.400, 43.000, 2.600, false, 1.55, "#000", "left"],
  ["item5",      5.700, 44.500,  5.000, 2.800, false, 1.50, "#000", "center"],
  ["desc",      11.000, 43.000, 46.000, 4.500, true,  1.20, "#000", "left"],
  ["marks",     51.000, 48.545, 11.000, 2.400, false, 1.45, "#000", "center"],
  ["crit8",     62.300, 43.200,  7.200, 2.600, false, 1.10, "#000", "center"],
  ["weight9",   69.900, 52.000,  7.400, 2.600, false, 1.20, "#000", "center"],
  ["inv10a",    78.000, 43.200, 17.000, 2.500, false, 1.50, "#000", "center"],
  ["inv10b",    78.000, 55.500, 17.000, 2.500, false, 1.50, "#000", "center"],
];

const LABELS = {
  certNo: "證明號 N°", transport: "運送/航班",
  desc: "貨物說明", marks: "嘜頭", item5: "項次", crit8: "原產地標準",
  weight9: "毛重", inv10a: "發票號", inv10b: "發票日期",
};

// 正本變動欄位的預設值（可直接改成新一批的資料）。
// 出口商/收貨人/生產國等固定欄位由底圖顯示（正本原字），不在此。
const DEFAULTS = {
  certNo: "154013",
  transport: "AMERIJET  AWB #810-43670255",
  desc: "1,250  UNIDADES DE CIGARROS DE LA FACTURA\nEMPACADOS EN TRS (3 ) CAJAS DE CARTON",
  marks: '"W" 2402',
  item5: "",
  crit8: "67-006",
  weight9: "45 KGS",
  inv10a: "67-006",
  inv10b: "25.05.2026",
};

function CertificateFormA({ bgSrc = BG_SRC }) {
  const [vals, setVals] = useState(DEFAULTS);
  const [showFields, setShowFields] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const sheetRef = useRef(null);

  const set = (id) => (e) => setVals((s) => ({ ...s, [id]: e.target.value }));

  const applyFieldStyles = useCallback(() => {
    const root = sheetRef.current;
    if (!root) return;
    // ⚠️ 平台 global.css 有 `input,select,textarea{font-size:16px!important;padding:12px 16px!important;min-height:48px}`
    //    （行動版響應式），會蓋掉本元件的 cqw 字級與緊湊 padding → 長字（45 KGS / 67-006）被擠爆裁切。
    //    React style prop 無法設 !important，改用 inline !important 搶回控制權。
    root.querySelectorAll(".cfa-fld").forEach((el) => {
      const fs = el.dataset.fs;
      if (fs) el.style.setProperty("font-size", fs + "cqw", "important");
      el.style.setProperty("padding", "0 2px", "important");
      el.style.setProperty("min-height", "0", "important");
      el.style.setProperty("border", "0", "important");
      el.style.setProperty("background-color", "transparent", "important");
      el.style.setProperty("border-radius", "0", "important");
    });
    root.querySelectorAll("input.cfa-fld").forEach((el) => {
      el.style.lineHeight = el.clientHeight + "px";
    });
  }, []);

  useLayoutEffect(() => {
    applyFieldStyles();
    window.addEventListener("resize", applyFieldStyles);
    return () => window.removeEventListener("resize", applyFieldStyles);
  }, [applyFieldStyles, vals, showFields]);

  // ⬇ 下載 PDF（用 html2canvas-pro + jsPDF、Letter 直式）
  async function downloadPdf() {
    const sheet = sheetRef.current;
    if (!sheet) return;
    setDownloading(true);
    const prevShowFields = showFields;
    setShowFields(false); // 隱藏藍框
    await new Promise((r) => setTimeout(r, 250));
    try {
      const img = sheet.querySelector("img");
      if (img && !img.complete) {
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      }
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (clonedDoc) => {
          // ⚠️ html2canvas 不會把 input/textarea 的「輸入值」畫進 PDF（只抓空框）→ 修改後下載仍空白。
          // 在 clone 裡把每個欄位換成顯示「當前值」的 div（沿用定位/字型；cqw 字級轉成實際 px）。
          const origs = sheet.querySelectorAll(".cfa-fld");
          const clones = clonedDoc.querySelectorAll(".cfa-fld");
          clones.forEach((el, i) => {
            const orig = origs[i];
            if (!orig) return;
            const cs = window.getComputedStyle(orig);
            const div = clonedDoc.createElement("div");
            div.textContent = orig.value || "";
            div.setAttribute("style", el.getAttribute("style") || "");
            div.style.position = "absolute";
            div.style.fontFamily = cs.fontFamily;
            div.style.fontWeight = cs.fontWeight;
            div.style.fontSize = cs.fontSize; // 實際 px，繞過 cqw 在 canvas 失準
            div.style.color = el.style.color || cs.color;
            div.style.background = "transparent"; // 乾淨無米色塊
            div.style.padding = "0 2px";
            div.style.boxSizing = "border-box";
            div.style.display = "flex";
            div.style.alignItems = "center";
            const ta = el.style.textAlign || "left";
            div.style.justifyContent = ta === "center" ? "center" : ta === "right" ? "flex-end" : "flex-start";
            div.style.whiteSpace = el.tagName === "TEXTAREA" ? "pre-wrap" : "nowrap";
            div.style.overflow = "hidden";
            div.style.lineHeight = el.tagName === "TEXTAREA" ? "1.12" : "normal";
            el.parentNode.replaceChild(div, el);
          });
        },
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
      const today = new Date().toISOString().slice(0, 10);
      pdf.save(`FormA_${vals.certNo || "COO"}_${today}.pdf`);
    } catch (e) {
      console.error("PDF 下載失敗:", e);
      alert("❌ PDF 下載失敗：" + (e.message || e));
    } finally {
      setShowFields(prevShowFields);
      setDownloading(false);
    }
  }

  return (
    <div className="cfa-wrap">
      <style>{CSS}</style>

      <div className="cfa-bar cfa-no-print">
        <strong>GSP Form A 產地證明</strong>
        <button className="cfa-btn dl" onClick={downloadPdf} disabled={downloading}>
          {downloading ? "⏳ 產生中..." : "⬇ 下載 PDF"}
        </button>
        <button className="cfa-btn print" onClick={() => window.print()}>🖨️ 列印</button>
        <button className="cfa-btn reset" onClick={() => { if (window.confirm("清空所有填寫欄位？")) setVals({}); }}>↺ 清空</button>
        <button className="cfa-btn reset" onClick={() => setVals(DEFAULTS)}>↩ 還原正本內容</button>
        <label className="cfa-toggle">
          <input type="checkbox" checked={showFields} onChange={(e) => setShowFields(e.target.checked)} />
          標示欄位
        </label>
      </div>

      {/* ⭐ 頂端快速編輯區 — 最常改的項目放這裡 */}
      <div className="cfa-quick cfa-no-print">
        <div className="cfa-quick-title">⭐ 快速編輯（最常改的欄位）</div>
        <div className="cfa-quick-grid">
          <label className="cfa-quick-fld">
            <span>證明號 N°</span>
            <input value={vals.certNo || ""} onChange={set("certNo")} placeholder="如：154013" />
          </label>
          <label className="cfa-quick-fld">
            <span>發票號</span>
            <input value={vals.inv10a || ""} onChange={set("inv10a")} placeholder="如：67-006" />
          </label>
          <label className="cfa-quick-fld">
            <span>發票日期</span>
            <input value={vals.inv10b || ""} onChange={set("inv10b")} placeholder="如：25.05.2026" />
          </label>
          <label className="cfa-quick-fld">
            <span>運送/航班</span>
            <input value={vals.transport || ""} onChange={set("transport")} placeholder="如：AMERIJET AWB #..." />
          </label>
          <label className="cfa-quick-fld cfa-quick-wide">
            <span>貨物說明 / 品項</span>
            <textarea rows={3} value={vals.desc || ""} onChange={set("desc")}
              placeholder="UNIDADES DE CIGARROS..." />
          </label>
          <label className="cfa-quick-fld">
            <span>毛重</span>
            <input value={vals.weight9 || ""} onChange={set("weight9")} placeholder="如：45 KGS" />
          </label>
          <label className="cfa-quick-fld">
            <span>原產地標準</span>
            <input value={vals.crit8 || ""} onChange={set("crit8")} placeholder="如：67-006 / P" />
          </label>
          <label className="cfa-quick-fld">
            <span>嘜頭</span>
            <input value={vals.marks || ""} onChange={set("marks")} placeholder='如："W" 2402' />
          </label>
        </div>
        <div className="cfa-hint">
          💡 出口商 / 收貨人 / 生產國 = 正本固定內容，已保留正本原字（無需修改）。其餘每批會變的欄位（證明號 / 發票號 / 發票日期 / 品名數量 / 毛重 / 嘜頭 / 運送）可在上方或直接點下方表單修改。按「↩ 還原正本內容」可復原。
        </div>
      </div>

      <div className="cfa-center">
        <div ref={sheetRef} className={"cfa-sheet" + (showFields ? " show-fields" : "")}>
          <img src={bgSrc} alt="Form A 產地證明" draggable={false} crossOrigin="anonymous" />
          {FIELDS.map(([id, l, t, w, h, multi, fs, color, align]) => {
            // fontSize 不放 style prop（會被 global.css 的 16px!important 蓋掉且 React 會清掉我們補的 important）
            // → 改用 data-fs，由 applyFieldStyles 以 inline !important 套用。
            const style = {
              left: l + "%", top: t + "%", width: w + "%", height: h + "%",
              color, textAlign: align,
            };
            return multi ? (
              <textarea key={id} className="cfa-fld ml" data-label={LABELS[id]} data-fs={fs}
                placeholder=" " style={style} value={vals[id] || ""} onChange={set(id)} />
            ) : (
              <input key={id} className="cfa-fld" data-label={LABELS[id]} data-fs={fs}
                placeholder=" " style={style} value={vals[id] || ""} onChange={set(id)} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CertificateFormAButton({ label = "📋 產地證明生成", bgSrc = BG_SRC, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={"cfa-open-btn " + className} onClick={() => setOpen(true)}>
        <style>{OPEN_BTN_CSS}</style>
        {label}
      </button>
      {open && (
        <div className="cfa-modal" role="dialog" aria-modal="true">
          <style>{MODAL_CSS}</style>
          <button className="cfa-close cfa-no-print" onClick={() => setOpen(false)} aria-label="關閉">✕</button>
          <CertificateFormA bgSrc={bgSrc} />
        </div>
      )}
    </>
  );
}

export { CertificateFormA };

const OPEN_BTN_CSS = `
.cfa-open-btn{font-size:15px;font-weight:700;border:0;border-radius:8px;
 padding:12px 20px;cursor:pointer;background:#c9a227;color:#1a1a1a;}
.cfa-open-btn:hover{filter:brightness(1.05);}
`;

const MODAL_CSS = `
.cfa-modal{position:fixed;inset:0;z-index:9999;background:#3a3a3a;overflow:auto;}
.cfa-close{position:fixed;top:12px;right:16px;z-index:10001;width:38px;height:38px;border:0;
 border-radius:50%;background:#000;color:#fff;font-size:18px;cursor:pointer;}
@media print{.cfa-modal{position:static;background:#fff;overflow:visible;}.cfa-close{display:none!important;}}
`;

const CSS = `
.cfa-wrap{font-family:"Helvetica Neue",Arial,"PingFang TC","Microsoft JhengHei",sans-serif;}
.cfa-bar{position:sticky;top:0;z-index:50;background:#111;color:#fff;display:flex;gap:10px;
 align-items:center;flex-wrap:wrap;padding:12px 16px 12px 60px;}
.cfa-bar strong{font-size:15px;margin-right:6px;}
.cfa-btn{font-size:14px;font-weight:600;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;}
.cfa-btn:disabled{opacity:.55;cursor:wait;}
.cfa-btn.dl{background:#4d8ac4;color:#fff;font-weight:700;}
.cfa-btn.print{background:#c9a227;color:#111;}
.cfa-btn.reset{background:#444;color:#fff;}
.cfa-toggle{font-size:13px;color:#ddd;display:flex;align-items:center;gap:5px;cursor:pointer;}

.cfa-quick{background:#1a1a1a;color:#fff;padding:16px 24px 12px;border-bottom:1px solid #2a2a2a;}
.cfa-quick-title{font-size:13px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:10px;}
.cfa-quick-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
.cfa-quick-wide{grid-column:span 2;}
.cfa-quick-fld{display:flex;flex-direction:column;gap:4px;}
.cfa-quick-fld span{font-size:11px;color:#888;font-weight:600;letter-spacing:.5px;}
.cfa-quick-fld input,.cfa-quick-fld textarea{background:#0f0f0f;border:1px solid #333;border-radius:6px;
 color:#fff;font-size:13px;padding:8px 10px;font-family:inherit;outline:none;}
.cfa-quick-fld input:focus,.cfa-quick-fld textarea:focus{border-color:#c9a227;background:#181818;}
.cfa-quick-fld textarea{resize:vertical;min-height:60px;}
.cfa-hint{margin-top:10px;font-size:11px;color:#888;}
@media (max-width:720px){.cfa-quick-grid{grid-template-columns:1fr 1fr;}.cfa-quick-wide{grid-column:span 2;}}

.cfa-center{display:flex;justify-content:center;padding:18px;}
.cfa-sheet{position:relative;width:850px;max-width:100%;aspect-ratio:1700/2200;background:#fff;
 box-shadow:0 4px 20px rgba(0,0,0,.5);container-type:inline-size;}
.cfa-sheet img{position:absolute;inset:0;width:100%;height:100%;display:block;
 user-select:none;pointer-events:none;}
.cfa-fld{position:absolute;border:0;background:transparent;font-family:Arial,"Helvetica Neue",sans-serif;
 font-weight:400;line-height:1.12;padding:0 2px;outline:none;resize:none;overflow:hidden;
 -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cfa-fld:not(.ml){line-height:1;white-space:nowrap;}
.cfa-fld::placeholder{color:transparent;}
.show-fields .cfa-fld{box-shadow:inset 0 0 0 1px rgba(0,120,255,.55);background:rgba(0,120,255,.06);}
@media print{
 @page{size:letter portrait;margin:0;}
 .cfa-wrap{background:#fff;}
 .cfa-bar,.cfa-quick{display:none!important;}
 .cfa-center{padding:0;}
 .cfa-sheet{width:100%;box-shadow:none;}
 .cfa-fld{background:transparent!important;box-shadow:none!important;}
}
`;
