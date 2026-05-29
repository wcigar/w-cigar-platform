import { useState, useLayoutEffect, useRef, useCallback } from "react";

/**
 * GSP Form A 產地證明 — 正本掃描底圖 + 可填欄位 + 列印
 * W Cigar Bar 老闆後台「報關」模組
 *
 * 用法（最簡）：
 *   import CertificateFormAButton from "@/.../CertificateFormA";
 *   <CertificateFormAButton />        // 直接給你一顆「📋 產地證明生成」按鈕
 *
 * 底圖請放： public/customs/form-a-bg.jpg
 * （Vite 中 public/ 的檔案以根路徑引用 → /customs/form-a-bg.jpg）
 */

const BG_SRC = "/customs/form-a-bg.jpg";

// id, left%, top%, width%, height%, multiline, fontSize(cqw), color, align
const FIELDS = [
  ["certNo",    76.471,  1.000, 15.882, 3.000, false, 2.5, "#c00", "center"],
  ["exporter",  11.471, 11.045, 38.529, 6.136, true,  1.85, "#000", "left"],
  ["consignee", 11.471, 19.000, 38.529, 6.000, true,  1.85, "#000", "left"],
  ["transport", 11.471, 29.909, 38.529, 2.636, false, 1.95, "#000", "left"],
  ["desc",      11.471, 45.227, 40.706, 4.545, true,  1.90, "#000", "left"],
  ["marks",     54.412, 48.545, 10.471, 2.455, false, 1.90, "#000", "center"],
  ["item5",      8.118, 45.682,  5.529, 2.818, false, 1.90, "#000", "center"],
  ["crit8",     63.412, 45.682,  6.353, 2.818, false, 1.90, "#000", "center"],
  ["weight9",   69.706, 53.091,  7.529, 2.636, false, 1.90, "#000", "center"],
  ["inv10a",    76.765, 45.455, 15.412, 2.545, false, 1.90, "#000", "left"],
  ["inv10b",    76.765, 55.000, 15.412, 2.545, false, 1.90, "#000", "left"],
  ["prod12",    50.706, 78.000, 22.235, 2.455, false, 2.00, "#000", "center"],
];

const LABELS = {
  certNo: "證明號 N°", exporter: "出口商", consignee: "收貨人", transport: "運送/航班",
  desc: "貨物說明", marks: "嘜頭", item5: "項次", crit8: "原產地標準",
  weight9: "毛重", inv10a: "發票號", inv10b: "發票日期", prod12: "生產國",
};

// 預設帶值的欄位（其餘留空 → 透明顯示正本原值，打字才覆蓋）
const DEFAULTS = { certNo: "154013" };

function CertificateFormA({ bgSrc = BG_SRC }) {
  const [vals, setVals] = useState(DEFAULTS);
  const [showFields, setShowFields] = useState(true);
  const sheetRef = useRef(null);

  const set = (id) => (e) => setVals((s) => ({ ...s, [id]: e.target.value }));

  // 單行欄位垂直置中：lineHeight = 欄位實際像素高
  const centerSingles = useCallback(() => {
    const root = sheetRef.current;
    if (!root) return;
    root.querySelectorAll("input.cfa-fld").forEach((el) => {
      el.style.lineHeight = el.clientHeight + "px";
    });
  }, []);

  useLayoutEffect(() => {
    centerSingles();
    window.addEventListener("resize", centerSingles);
    return () => window.removeEventListener("resize", centerSingles);
  }, [centerSingles]);

  return (
    <div className="cfa-wrap">
      <style>{CSS}</style>

      <div className="cfa-bar cfa-no-print">
        <strong>GSP Form A 產地證明</strong>
        <button className="cfa-btn print" onClick={() => window.print()}>🖨️ 列印 / 另存 PDF</button>
        <button className="cfa-btn reset" onClick={() => { if (window.confirm("清空所有填寫欄位？")) setVals({}); }}>↺ 清空</button>
        <button className="cfa-btn reset" onClick={() => setVals(DEFAULTS)}>↩ 還原預設</button>
        <label className="cfa-toggle">
          <input type="checkbox" checked={showFields} onChange={(e) => setShowFields(e.target.checked)} />
          標示可填欄位
        </label>
        <small>未填欄位＝正本原值，打字才覆蓋。列印自動隱藏標示框（請選 Letter 尺寸、邊界：無）</small>
      </div>

      <div className="cfa-center">
        <div ref={sheetRef} className={"cfa-sheet" + (showFields ? " show-fields" : "")}>
          <img src={bgSrc} alt="Form A 產地證明" draggable={false} />
          {FIELDS.map(([id, l, t, w, h, multi, fs, color, align]) => {
            const style = {
              left: l + "%", top: t + "%", width: w + "%", height: h + "%",
              fontSize: fs + "cqw", color, textAlign: align,
            };
            return multi ? (
              <textarea key={id} className="cfa-fld ml" data-label={LABELS[id]}
                placeholder=" " style={style} value={vals[id] || ""} onChange={set(id)} />
            ) : (
              <input key={id} className="cfa-fld" data-label={LABELS[id]}
                placeholder=" " style={style} value={vals[id] || ""} onChange={set(id)} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 對外：一顆按鈕 + 全螢幕 Modal */
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
.cfa-btn.print{background:#c9a227;color:#111;}
.cfa-btn.reset{background:#444;color:#fff;}
.cfa-toggle{font-size:13px;color:#ddd;display:flex;align-items:center;gap:5px;cursor:pointer;}
.cfa-bar small{color:#999;margin-left:auto;max-width:320px;line-height:1.3;}
.cfa-center{display:flex;justify-content:center;padding:18px;}
.cfa-sheet{position:relative;width:850px;max-width:100%;aspect-ratio:1700/2200;background:#fff;
 box-shadow:0 4px 20px rgba(0,0,0,.5);container-type:inline-size;}
.cfa-sheet img{position:absolute;inset:0;width:100%;height:100%;display:block;
 user-select:none;pointer-events:none;}
.cfa-fld{position:absolute;border:0;background:transparent;font-family:Arial,"Helvetica Neue",sans-serif;
 font-weight:700;line-height:1.12;padding:0 2px;outline:none;resize:none;overflow:hidden;
 -webkit-print-color-adjust:exact;print-color-adjust:exact;}
.cfa-fld:not(.ml){line-height:1;white-space:nowrap;}
.cfa-fld:not(:placeholder-shown){background:#faf9ef;}
.cfa-fld::placeholder{color:transparent;}
.show-fields .cfa-fld{box-shadow:inset 0 0 0 1px rgba(0,120,255,.55);background:rgba(0,120,255,.06);}
.show-fields .cfa-fld:not(:placeholder-shown){background:#faf9ef;}
@media print{
 @page{size:letter portrait;margin:0;}
 .cfa-wrap{background:#fff;}
 .cfa-bar{display:none!important;}
 .cfa-center{padding:0;}
 .cfa-sheet{width:100%;box-shadow:none;}
 .show-fields .cfa-fld{box-shadow:none;background:transparent;}
 .show-fields .cfa-fld:not(:placeholder-shown){background:#faf9ef;}
}
`;
