import { useState, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

/**
 * GSP Form A 產地證明 — 程式排版乾淨版（無掃描底圖、零殘留）
 * 表格框線 + 制式文字全程式畫，欄位直接在格內填，下載 PDF 用 onclone 把欄位值畫出。
 */

const DEFAULTS = { certNo: "" };

function CertificateFormA() {
  const [vals, setVals] = useState(DEFAULTS);
  const [showFields, setShowFields] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const sheetRef = useRef(null);

  const set = (id) => (e) => setVals((s) => ({ ...s, [id]: e.target.value }));

  async function downloadPdf() {
    const sheet = sheetRef.current;
    if (!sheet) return;
    setDownloading(true);
    const prev = showFields;
    setShowFields(false);
    await new Promise((r) => setTimeout(r, 200));
    try {
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (clonedDoc) => {
          // html2canvas 不畫 input/textarea 的輸入值 → clone 裡換成顯示當前值的 div
          const origs = sheet.querySelectorAll(".cfa-in, .cfa-line");
          const clones = clonedDoc.querySelectorAll(".cfa-in, .cfa-line");
          clones.forEach((el, i) => {
            const orig = origs[i];
            if (!orig) return;
            const cs = window.getComputedStyle(orig);
            const div = clonedDoc.createElement("div");
            div.textContent = orig.value || "";
            div.style.fontFamily = cs.fontFamily;
            div.style.fontWeight = cs.fontWeight;
            div.style.fontSize = cs.fontSize;
            div.style.color = "#000";
            div.style.whiteSpace = orig.tagName === "TEXTAREA" ? "pre-wrap" : "nowrap";
            div.style.textAlign = cs.textAlign;
            div.style.lineHeight = "1.25";
            div.style.width = "100%";
            div.style.minHeight = cs.height;
            div.style.padding = cs.padding;
            div.style.boxSizing = "border-box";
            el.parentNode.replaceChild(div, el);
          });
        },
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const ratio = canvas.height / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageW * ratio);
      const today = new Date().toISOString().slice(0, 10);
      pdf.save(`FormA_${vals.certNo || "COO"}_${today}.pdf`);
    } catch (e) {
      console.error("PDF 下載失敗:", e);
      alert("❌ PDF 下載失敗：" + (e.message || e));
    } finally {
      setShowFields(prev);
      setDownloading(false);
    }
  }

  const sheetCls = "cfa-sheet" + (showFields ? " show-fields" : "");

  return (
    <div className="cfa-wrap">
      <style>{CSS}</style>

      <div className="cfa-bar cfa-no-print">
        <strong>GSP Form A 產地證明</strong>
        <button className="cfa-btn dl" onClick={downloadPdf} disabled={downloading}>
          {downloading ? "⏳ 產生中..." : "⬇ 下載 PDF"}
        </button>
        <button className="cfa-btn print" onClick={() => window.print()}>🖨️ 列印</button>
        <button className="cfa-btn reset" onClick={() => { if (window.confirm("清空所有欄位？")) setVals({}); }}>↺ 清空</button>
        <label className="cfa-toggle">
          <input type="checkbox" checked={showFields} onChange={(e) => setShowFields(e.target.checked)} />
          標示欄位
        </label>
      </div>

      {/* 快速編輯區 */}
      <div className="cfa-quick cfa-no-print">
        <div className="cfa-quick-title">⭐ 快速編輯</div>
        <div className="cfa-quick-grid">
          <label><span>證明號 N°</span><input value={vals.certNo || ""} onChange={set("certNo")} placeholder="如 154013" /></label>
          <label><span>出口商</span><input value={vals.exporter || ""} onChange={set("exporter")} placeholder="公司名 / 地址 / 國別" /></label>
          <label><span>收貨人</span><input value={vals.consignee || ""} onChange={set("consignee")} placeholder="進口商 / 地址 / 國別" /></label>
          <label><span>運送/航班</span><input value={vals.transport || ""} onChange={set("transport")} placeholder="BY AIR / AWB..." /></label>
          <label className="wide"><span>貨物說明</span><textarea rows={2} value={vals.desc || ""} onChange={set("desc")} placeholder="CIGARS, HANDMADE..." /></label>
          <label><span>毛重</span><input value={vals.weight9 || ""} onChange={set("weight9")} placeholder="17.2 KGS" /></label>
          <label><span>發票號/日期</span><input value={vals.inv10 || ""} onChange={set("inv10")} placeholder="INV-xxx / 日期" /></label>
          <label><span>原產地標準</span><input value={vals.crit8 || ""} onChange={set("crit8")} placeholder="P" /></label>
          <label><span>生產國</span><input value={vals.prod12 || ""} onChange={set("prod12")} placeholder="NICARAGUA" /></label>
        </div>
      </div>

      {/* Form A 本體 */}
      <div className="cfa-center">
        <div ref={sheetRef} className={sheetCls}>
          <div className="cfa-topbar">
            <div className="cfa-dga">D<span>G</span>A · ADUANAS</div>
            <div className="cfa-nobox">N° <input className="cfa-line cfa-certno" value={vals.certNo || ""} onChange={set("certNo")} /></div>
          </div>

          <table className="cfa-tbl"><tbody>
            <tr>
              <td colSpan={3} className="cfa-cell">
                <div className="cfa-lbl">1. Goods consigned from (Exporter's business name, address, country)</div>
                <textarea className="cfa-in" rows={3} value={vals.exporter || ""} onChange={set("exporter")} />
              </td>
              <td colSpan={3} rowSpan={2} className="cfa-cell cfa-title">
                <div className="cfa-ref">Reference No. <input className="cfa-line" value={vals.refNo || ""} onChange={set("refNo")} /></div>
                <div className="cfa-gsp">GENERALIZED SYSTEM OF PREFERENCES</div>
                <div className="cfa-coo">CERTIFICATE OF ORIGIN</div>
                <div className="cfa-subt">(Combined declaration and certificate)</div>
                <div className="cfa-forma">FORM A</div>
                <div className="cfa-issued">Issued in <input className="cfa-line" value={vals.issuedIn || ""} onChange={set("issuedIn")} /></div>
                <div className="cfa-cty">(country)</div>
                <div className="cfa-notes">See notes overleaf</div>
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="cfa-cell">
                <div className="cfa-lbl">2. Goods consigned to (Consignee's name, address, country)</div>
                <textarea className="cfa-in" rows={3} value={vals.consignee || ""} onChange={set("consignee")} />
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="cfa-cell">
                <div className="cfa-lbl">3. Means of transport and route (as far as known)</div>
                <input className="cfa-in" value={vals.transport || ""} onChange={set("transport")} />
              </td>
              <td colSpan={3} className="cfa-cell">
                <div className="cfa-lbl">4. For official use</div>
                <textarea className="cfa-in" rows={2} value={vals.official || ""} onChange={set("official")} />
              </td>
            </tr>
            <tr className="cfa-colhead">
              <td className="cfa-cell"><div className="cfa-lbl">5. Item number</div></td>
              <td className="cfa-cell"><div className="cfa-lbl">6. Marks and numbers of packages</div></td>
              <td className="cfa-cell"><div className="cfa-lbl">7. Number and kind of packages; description of goods</div></td>
              <td className="cfa-cell"><div className="cfa-lbl">8. Origin criterion (see Notes overleaf)</div></td>
              <td className="cfa-cell"><div className="cfa-lbl">9. Gross weight or other quantity</div></td>
              <td className="cfa-cell"><div className="cfa-lbl">10. Number and date of invoices</div></td>
            </tr>
            <tr className="cfa-databody">
              <td className="cfa-cell"><textarea className="cfa-in" rows={8} value={vals.item5 || ""} onChange={set("item5")} /></td>
              <td className="cfa-cell"><textarea className="cfa-in" rows={8} value={vals.marks || ""} onChange={set("marks")} /></td>
              <td className="cfa-cell"><textarea className="cfa-in" rows={8} value={vals.desc || ""} onChange={set("desc")} /></td>
              <td className="cfa-cell"><textarea className="cfa-in" rows={8} value={vals.crit8 || ""} onChange={set("crit8")} /></td>
              <td className="cfa-cell"><textarea className="cfa-in" rows={8} value={vals.weight9 || ""} onChange={set("weight9")} /></td>
              <td className="cfa-cell"><textarea className="cfa-in" rows={8} value={vals.inv10 || ""} onChange={set("inv10")} /></td>
            </tr>
            <tr>
              <td colSpan={3} className="cfa-cell cfa-decl">
                <div className="cfa-lbl">11. Certification</div>
                <div className="cfa-dtext">It is hereby certified, on the basis of control carried out, that the declaration by the exporter is correct.</div>
                <div className="cfa-signline">..................................................................</div>
                <div className="cfa-signsub">Place and date, signature and stamp of certifying authority</div>
              </td>
              <td colSpan={3} className="cfa-cell cfa-decl">
                <div className="cfa-lbl">12. Declaration by the exporter</div>
                <div className="cfa-dtext">
                  The undersigned hereby declares that the above details and statements are correct; that all the goods were produced in
                  <input className="cfa-line" value={vals.prod12 || ""} onChange={set("prod12")} /> (country)
                  and that they comply with the origin requirements specified for those goods in the Generalized System of Preferences for goods exported to
                  <input className="cfa-line" value={vals.importTo || ""} onChange={set("importTo")} /> (importing country).
                </div>
                <div className="cfa-signline">..................................................................</div>
                <div className="cfa-signsub">Place and date, signature of authorized signatory</div>
              </td>
            </tr>
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

export default function CertificateFormAButton({ label = "📋 產地證明生成", className = "" }) {
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
          <CertificateFormA />
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
.cfa-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);overflow:auto;padding:20px 0;}
.cfa-close{position:fixed;top:14px;right:16px;z-index:10000;width:40px;height:40px;border-radius:50%;
 border:0;background:#222;color:#fff;font-size:18px;cursor:pointer;}
@media print{.cfa-modal{position:static;background:#fff;overflow:visible;padding:0;}.cfa-close{display:none!important;}}
`;

const CSS = `
.cfa-wrap{background:#f4f4f4;min-height:100%;}
.cfa-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 18px;background:#1a1a1a;color:#fff;}
.cfa-bar strong{font-size:15px;}
.cfa-btn{padding:9px 16px;border:0;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;}
.cfa-btn.dl{background:#c9a227;color:#111;}
.cfa-btn.print{background:#4da86c;color:#fff;}
.cfa-btn.reset{background:#444;color:#ddd;}
.cfa-toggle{display:flex;align-items:center;gap:5px;font-size:12px;color:#ccc;cursor:pointer;}
.cfa-quick{background:#2a2520;padding:12px 18px;}
.cfa-quick-title{font-size:12px;color:#c9a227;font-weight:700;margin-bottom:8px;}
.cfa-quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.cfa-quick label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#aaa;}
.cfa-quick label.wide{grid-column:span 2;}
.cfa-quick input,.cfa-quick textarea{padding:7px 9px;border:1px solid #444;border-radius:5px;background:#1a1714;color:#fff;font-size:13px;outline:none;}
@media (max-width:720px){.cfa-quick-grid{grid-template-columns:1fr 1fr;}.cfa-quick label.wide{grid-column:span 2;}}

.cfa-center{display:flex;justify-content:center;padding:18px;}
.cfa-sheet{width:850px;max-width:100%;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.5);padding:14px 16px;color:#000;font-family:Arial,"Helvetica Neue",sans-serif;}
.cfa-topbar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;}
.cfa-dga{font-size:24px;font-weight:800;letter-spacing:1px;}
.cfa-dga span{color:#c00;}
.cfa-nobox{font-size:13px;font-weight:700;display:flex;align-items:center;gap:4px;}
.cfa-certno{color:#c00 !important;font-size:18px !important;font-weight:800 !important;width:120px;text-align:center;}

.cfa-tbl{width:100%;border-collapse:collapse;table-layout:fixed;}
.cfa-cell{border:1px solid #000;padding:4px 5px;vertical-align:top;}
.cfa-lbl{font-size:8.5px;font-weight:400;line-height:1.15;margin-bottom:2px;}
.cfa-in{width:100%;border:0;outline:none;background:transparent;resize:none;
 font-family:inherit;font-size:12px;font-weight:700;line-height:1.25;color:#000;padding:0;}
.cfa-line{border:0;border-bottom:1px dotted #888;outline:none;background:transparent;
 font-family:inherit;font-size:12px;font-weight:700;color:#000;min-width:70px;padding:0 3px;}
.show-fields .cfa-in,.show-fields .cfa-line{background:rgba(0,120,255,.06);box-shadow:inset 0 0 0 1px rgba(0,120,255,.4);}

.cfa-title{text-align:center;line-height:1.3;}
.cfa-ref{font-size:9px;text-align:left;margin-bottom:6px;display:flex;align-items:center;gap:4px;}
.cfa-gsp{font-size:11px;font-weight:700;margin-top:2px;}
.cfa-coo{font-size:12px;font-weight:700;margin-top:3px;}
.cfa-subt{font-size:9px;font-style:italic;}
.cfa-forma{font-size:15px;font-weight:800;margin:4px 0;}
.cfa-issued{font-size:9px;display:flex;align-items:center;justify-content:center;gap:4px;}
.cfa-cty{font-size:8px;color:#444;}
.cfa-notes{font-size:8px;text-align:right;margin-top:6px;font-style:italic;}

.cfa-colhead .cfa-cell{height:auto;background:#fafafa;}
.cfa-databody .cfa-cell{height:200px;}
.cfa-databody .cfa-in{height:100%;}

.cfa-decl{vertical-align:top;}
.cfa-dtext{font-size:8.5px;line-height:1.3;margin:3px 0;}
.cfa-signline{margin-top:26px;font-size:11px;letter-spacing:1px;}
.cfa-signsub{font-size:8px;color:#333;margin-top:2px;}

@media print{
 @page{size:A4 portrait;margin:8mm;}
 .cfa-wrap{background:#fff;}
 .cfa-bar,.cfa-quick{display:none!important;}
 .cfa-center{padding:0;}
 .cfa-sheet{width:100%;box-shadow:none;padding:0;}
 .show-fields .cfa-in,.show-fields .cfa-line{background:transparent;box-shadow:none;}
}
`;
