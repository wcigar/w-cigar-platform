// 客戶端匿名展示頁 — 大使分享專用、URL: /c/:ambassador_code
// 🔒 合規：絕無公司名 / 雪茄館地址 / 任何「W Cigar」「Wilson」字樣
// 訂單透過 place_customer_order RPC、Edge Function 自動推大使 LINE
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ShoppingCart, Plus, Minus, Trash2, ArrowLeft, Check, AlertCircle } from 'lucide-react'

const CSS = `
.cstm-wrap{min-height:100vh;background:#0a0a0a;color:#e8e8e8;font-family:"PingFang TC","Noto Sans TC",sans-serif;padding-bottom:120px;}
.cstm-hdr{padding:20px 16px 12px;border-bottom:1px solid #1f1f1f;background:linear-gradient(180deg,#000,#0a0a0a);position:sticky;top:0;z-index:50;}
.cstm-hdr-title{font-size:22px;font-weight:300;letter-spacing:8px;color:#c9a84c;text-align:center;}
.cstm-hdr-sub{font-size:11px;color:#666;text-align:center;margin-top:4px;letter-spacing:3px;}
.cstm-ambinfo{margin:14px 16px 8px;padding:14px;background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.2);border-radius:10px;text-align:center;}
.cstm-amb-label{font-size:11px;color:#888;letter-spacing:2px;}
.cstm-amb-name{font-size:18px;color:#c9a84c;font-weight:600;margin-top:4px;}
.cstm-amb-hint{font-size:11px;color:#888;margin-top:6px;}
.cstm-cats{display:flex;gap:6px;padding:10px 16px 4px;overflow-x:auto;scrollbar-width:none;}
.cstm-cats::-webkit-scrollbar{display:none;}
.cstm-cat{padding:7px 14px;border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;background:transparent;color:#888;border:1px solid #2a2a2a;}
.cstm-cat.active{background:rgba(201,168,76,.15);color:#c9a84c;border-color:rgba(201,168,76,.4);}
.cstm-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:10px 16px;}
@media (min-width:720px){.cstm-grid{grid-template-columns:repeat(3,1fr);}}
@media (min-width:960px){.cstm-grid{grid-template-columns:repeat(4,1fr);}}
.cstm-card{background:#111;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;cursor:pointer;transition:transform .15s,border-color .15s;}
.cstm-card:hover{transform:translateY(-2px);border-color:rgba(201,168,76,.4);}
.cstm-img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#000;}
.cstm-body{padding:10px 12px;}
.cstm-brand{font-size:10px;color:#888;letter-spacing:1px;}
.cstm-name{font-size:13px;color:#e8e8e8;font-weight:600;margin-top:3px;line-height:1.3;min-height:34px;}
.cstm-spec{font-size:10px;color:#666;margin-top:4px;}
.cstm-price{font-size:18px;color:#c9a84c;font-weight:700;margin-top:6px;font-family:"Cormorant Garamond",serif;}
.cstm-stock{font-size:10px;color:#4a8;}
.cstm-stock.low{color:#c44;}

.cstm-fab{position:fixed;bottom:24px;right:20px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#c9a84c,#8b7a3e);color:#000;border:none;font-size:22px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px rgba(201,168,76,.4);z-index:100;display:flex;align-items:center;justify-content:center;}
.cstm-fab-badge{position:absolute;top:-4px;right:-4px;background:#c44;color:#fff;border-radius:50%;min-width:22px;height:22px;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0 6px;font-weight:800;}

.cstm-modal{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;display:flex;align-items:flex-end;justify-content:center;}
.cstm-modal-card{background:#0a0a0a;border-top:1px solid #c9a84c;border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;padding:20px;}
.cstm-modal-h{font-size:16px;color:#c9a84c;font-weight:700;letter-spacing:3px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
.cstm-close{background:none;border:none;color:#888;font-size:24px;cursor:pointer;}

.cstm-cart-item{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #1f1f1f;align-items:center;}
.cstm-cart-img{width:54px;height:54px;border-radius:6px;object-fit:cover;background:#000;}
.cstm-cart-info{flex:1;min-width:0;}
.cstm-cart-name{font-size:12px;color:#fff;font-weight:600;line-height:1.3;}
.cstm-cart-price{font-size:13px;color:#c9a84c;margin-top:4px;font-weight:700;}
.cstm-qty{display:flex;align-items:center;gap:6px;}
.cstm-qty-btn{width:28px;height:28px;border-radius:6px;background:#1f1f1f;color:#fff;border:none;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.cstm-qty-n{min-width:24px;text-align:center;font-size:13px;color:#fff;font-weight:600;}

.cstm-input{width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:14px;padding:11px 12px;margin-bottom:10px;box-sizing:border-box;}
.cstm-input:focus{outline:none;border-color:#c9a84c;}
.cstm-label{font-size:11px;color:#888;font-weight:600;letter-spacing:1px;margin-bottom:4px;display:block;}

.cstm-btn{width:100%;padding:14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;border:none;letter-spacing:3px;}
.cstm-btn-gold{background:linear-gradient(135deg,#c9a84c,#8b7a3e);color:#000;}
.cstm-btn-gold:disabled{opacity:.4;cursor:wait;}
.cstm-btn-outline{background:transparent;border:1px solid #2a2a2a;color:#888;}

.cstm-summary{padding:14px 0;border-top:1px solid #1f1f1f;margin-top:12px;}
.cstm-sr{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#aaa;}
.cstm-sr.big{font-size:18px;color:#c9a84c;font-weight:700;border-top:1px solid #2a2a2a;padding-top:10px;margin-top:6px;}

.cstm-footer{text-align:center;padding:30px 16px;color:#444;font-size:10px;line-height:1.6;border-top:1px solid #1a1a1a;margin-top:30px;}
.cstm-warning{margin:14px 16px;padding:12px;background:rgba(196,77,77,.06);border:1px solid rgba(196,77,77,.3);border-radius:8px;font-size:11px;color:#c44;text-align:center;letter-spacing:1px;}

.cstm-empty{text-align:center;padding:60px 20px;color:#666;}
.cstm-loading{text-align:center;padding:80px 20px;color:#888;}

.cstm-success{text-align:center;padding:50px 20px;}
.cstm-success-icon{width:80px;height:80px;border-radius:50%;background:rgba(77,168,108,.15);color:#4a8;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:40px;}
.cstm-success-no{font-size:18px;color:#c9a84c;font-weight:700;letter-spacing:2px;margin-top:10px;}
`

// 主元件
export default function CustomerApp() {
  const { ambassador_code } = useParams()
  const navigate = useNavigate()
  const [ambassador, setAmbassador] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cart, setCart] = useState([]) // [{product_id, name, image_url, suggest_price, qty}]
  const [view, setView] = useState('shop') // shop | cart | checkout | success
  const [catFilter, setCatFilter] = useState('全部')
  const [orderResult, setOrderResult] = useState(null)

  useEffect(() => { load() }, [ambassador_code])
  useEffect(() => {
    // localStorage 恢復購物車（綁大使代碼）
    const saved = localStorage.getItem('c_cart_' + ambassador_code)
    if (saved) try { setCart(JSON.parse(saved)) } catch {}
  }, [ambassador_code])
  useEffect(() => {
    localStorage.setItem('c_cart_' + ambassador_code, JSON.stringify(cart))
  }, [cart, ambassador_code])

  async function load() {
    setLoading(true)
    setError(null)
    // 1. 找大使（必須 referral_enabled）
    const { data: amb, error: ambErr } = await supabase
      .from('ambassadors')
      .select('id, name, ambassador_code, referral_enabled, is_active')
      .ilike('ambassador_code', ambassador_code)
      .maybeSingle()
    if (ambErr || !amb) { setError('連結無效或已過期'); setLoading(false); return }
    if (!amb.is_active) { setError('連結已停用'); setLoading(false); return }
    if (!amb.referral_enabled) { setError('此連結尚未開放下單'); setLoading(false); return }
    setAmbassador(amb)
    // 2. 載入商品（sections 含 cuban 顯示古巴；只看 suggest_price > 0）
    const { data: prods } = await supabase
      .from('products')
      .select('id, brand, name, spec, pack, suggest_price, sections, image_url, stock_status, is_active')
      .or('is_active.eq.true,is_active.is.null')
      .gt('suggest_price', 0)
      .order('sort_order', { ascending: true, nullsFirst: false })
    setProducts(prods || [])
    setLoading(false)
  }

  // 加入購物車
  function addToCart(p) {
    setCart(c => {
      const exist = c.find(x => x.product_id === p.id)
      if (exist) return c.map(x => x.product_id === p.id ? { ...x, qty: x.qty + 1 } : x)
      return [...c, { product_id: p.id, name: p.name, brand: p.brand, image_url: p.image_url, suggest_price: p.suggest_price, qty: 1 }]
    })
  }
  function setQty(pid, delta) {
    setCart(c => c.map(x => x.product_id === pid ? { ...x, qty: Math.max(0, x.qty + delta) } : x).filter(x => x.qty > 0))
  }
  function removeItem(pid) { setCart(c => c.filter(x => x.product_id !== pid)) }

  const cartTotal = useMemo(() => cart.reduce((s, x) => s + x.suggest_price * x.qty, 0), [cart])
  const cartCount = useMemo(() => cart.reduce((s, x) => s + x.qty, 0), [cart])

  // 分類
  const categories = useMemo(() => {
    const set = new Set(['全部'])
    products.forEach(p => {
      if (Array.isArray(p.sections)) {
        if (p.sections.includes('cuban')) set.add('古巴雪茄')
        else set.add('非古雪茄')
      }
    })
    return Array.from(set)
  }, [products])

  const filteredProducts = useMemo(() => {
    if (catFilter === '全部') return products
    return products.filter(p => {
      const isCuban = Array.isArray(p.sections) && p.sections.includes('cuban')
      return catFilter === '古巴雪茄' ? isCuban : !isCuban
    })
  }, [products, catFilter])

  if (loading) return (
    <div className="cstm-wrap"><style>{CSS}</style>
      <div className="cstm-loading">載入中...</div>
    </div>
  )

  if (error) return (
    <div className="cstm-wrap"><style>{CSS}</style>
      <div className="cstm-empty">
        <AlertCircle size={48} style={{ opacity: .5, marginBottom: 16 }} />
        <div style={{ fontSize: 16 }}>{error}</div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 12 }}>請聯絡您的服務專員</div>
      </div>
    </div>
  )

  return (
    <div className="cstm-wrap">
      <style>{CSS}</style>

      {/* 頂端標題（中性、無公司名）*/}
      <div className="cstm-hdr">
        <div className="cstm-hdr-title">PREMIUM CIGARS</div>
        <div className="cstm-hdr-sub">精選雪茄品鑑</div>
      </div>

      {/* 大使介紹（不顯示其他人）*/}
      <div className="cstm-ambinfo">
        <div className="cstm-amb-label">您的專屬服務</div>
        <div className="cstm-amb-name">{ambassador.name}</div>
        <div className="cstm-amb-hint">下單後將由 {ambassador.name} 為您確認細節</div>
      </div>

      {view === 'success' && orderResult ? (
        <SuccessView result={orderResult} ambassador={ambassador} onBack={() => { setCart([]); setOrderResult(null); setView('shop') }} />
      ) : view === 'checkout' ? (
        <CheckoutView
          cart={cart} cartTotal={cartTotal} ambassador={ambassador}
          onBack={() => setView('cart')}
          onPlaced={(res) => { setOrderResult(res); setView('success') }}
        />
      ) : (
        <>
          {/* 分類 chips */}
          <div className="cstm-cats">
            {categories.map(c => (
              <button key={c} className={'cstm-cat' + (catFilter === c ? ' active' : '')} onClick={() => setCatFilter(c)}>{c}</button>
            ))}
          </div>

          {/* 商品 grid */}
          <div className="cstm-grid">
            {filteredProducts.map(p => (
              <div key={p.id} className="cstm-card" onClick={() => addToCart(p)}>
                {p.image_url && <img src={p.image_url} alt="" className="cstm-img" loading="lazy" />}
                <div className="cstm-body">
                  <div className="cstm-brand">{p.brand}</div>
                  <div className="cstm-name">{p.name}</div>
                  {p.spec && <div className="cstm-spec">{p.spec}</div>}
                  <div className="cstm-price">${p.suggest_price?.toLocaleString()}</div>
                  <div className={'cstm-stock' + (p.stock_status === 'low' ? ' low' : '')}>
                    {p.stock_status === 'low' ? '少量現貨' : '現貨'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && <div className="cstm-empty">此分類目前無品項</div>}
        </>
      )}

      {/* 合規警語 */}
      <div className="cstm-warning">⚠️ 本網站限 20+ 成年人 ｜ 吸菸有害健康</div>

      {/* footer：完全匿名 */}
      <div className="cstm-footer">
        © 限會員邀請瀏覽 · 不對外公開<br />
        如需服務請聯絡推薦您的專員
      </div>

      {/* 浮動購物車按鈕 */}
      {view === 'shop' && cartCount > 0 && (
        <button className="cstm-fab" onClick={() => setView('cart')}>
          <ShoppingCart size={22} />
          <span className="cstm-fab-badge">{cartCount}</span>
        </button>
      )}

      {/* 購物車 modal */}
      {view === 'cart' && (
        <div className="cstm-modal" onClick={() => setView('shop')}>
          <div className="cstm-modal-card" onClick={e => e.stopPropagation()}>
            <div className="cstm-modal-h">
              <span>購物車 ({cartCount})</span>
              <button className="cstm-close" onClick={() => setView('shop')}>×</button>
            </div>
            {cart.length === 0 ? (
              <div className="cstm-empty">購物車是空的</div>
            ) : (
              <>
                {cart.map(it => (
                  <div key={it.product_id} className="cstm-cart-item">
                    {it.image_url && <img src={it.image_url} alt="" className="cstm-cart-img" />}
                    <div className="cstm-cart-info">
                      <div className="cstm-cart-name">{it.brand} · {it.name}</div>
                      <div className="cstm-cart-price">${(it.suggest_price * it.qty).toLocaleString()}</div>
                    </div>
                    <div className="cstm-qty">
                      <button className="cstm-qty-btn" onClick={() => setQty(it.product_id, -1)}><Minus size={12} /></button>
                      <span className="cstm-qty-n">{it.qty}</span>
                      <button className="cstm-qty-btn" onClick={() => setQty(it.product_id, +1)}><Plus size={12} /></button>
                      <button className="cstm-qty-btn" style={{ background: 'transparent', color: '#c44' }} onClick={() => removeItem(it.product_id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
                <div className="cstm-summary">
                  <div className="cstm-sr big"><span>總計</span><span>${cartTotal.toLocaleString()}</span></div>
                </div>
                <button className="cstm-btn cstm-btn-gold" style={{ marginTop: 14 }} onClick={() => setView('checkout')}>
                  下一步 · 填寫資料
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// 結帳頁
function CheckoutView({ cart, cartTotal, ambassador, onBack, onPlaced }) {
  const [form, setForm] = useState({ name: '', phone: '', line_id: '', address: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)

  async function submit() {
    setErr(null)
    if (!form.name.trim()) { setErr('請填寫姓名'); return }
    if (!form.phone.trim()) { setErr('請填寫電話'); return }
    if (!/^09\d{8}$/.test(form.phone.trim().replace(/\s|-/g, ''))) { setErr('電話格式錯誤（09 開頭 10 碼）'); return }
    setSubmitting(true)
    const items = cart.map(x => ({ product_id: x.product_id, qty: x.qty }))
    const { data, error } = await supabase.rpc('place_customer_order', {
      p_ambassador_code: ambassador.ambassador_code,
      p_customer_name: form.name.trim(),
      p_customer_phone: form.phone.trim(),
      p_customer_line_id: form.line_id.trim() || null,
      p_customer_address: form.address.trim() || null,
      p_items: items,
      p_notes: form.notes.trim() || null,
    })
    if (error) { setErr(error.message); setSubmitting(false); return }
    if (!data?.success) { setErr(data?.error || '下單失敗'); setSubmitting(false); return }

    // 觸發 LINE 通知（非阻塞、就算 fail 訂單還是成立）
    try {
      await supabase.functions.invoke('customer-order-notify', { body: { order_id: data.order_id } })
    } catch {}

    setSubmitting(false)
    onPlaced(data)
  }

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <ArrowLeft size={14} /> 返回購物車
      </button>
      <div className="cstm-modal-h" style={{ marginBottom: 16 }}>填寫聯絡資料</div>

      <label className="cstm-label">姓名 *</label>
      <input className="cstm-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="您的稱呼" />

      <label className="cstm-label">手機 *</label>
      <input className="cstm-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="09xxxxxxxx" inputMode="numeric" />

      <label className="cstm-label">LINE ID（選填）</label>
      <input className="cstm-input" value={form.line_id} onChange={e => setForm(p => ({ ...p, line_id: e.target.value }))} placeholder="方便專員聯絡" />

      <label className="cstm-label">收貨地址（選填）</label>
      <input className="cstm-input" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="可下單後再確認" />

      <label className="cstm-label">備註（選填）</label>
      <textarea className="cstm-input" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="特殊需求或希望聯絡時段" />

      <div className="cstm-summary">
        {cart.map(it => (
          <div key={it.product_id} className="cstm-sr">
            <span>{it.brand} {it.name} × {it.qty}</span>
            <span>${(it.suggest_price * it.qty).toLocaleString()}</span>
          </div>
        ))}
        <div className="cstm-sr big"><span>總計</span><span>${cartTotal.toLocaleString()}</span></div>
      </div>

      {err && <div className="cstm-warning" style={{ margin: '12px 0' }}>{err}</div>}

      <button className="cstm-btn cstm-btn-gold" onClick={submit} disabled={submitting}>
        {submitting ? '送出中...' : '送出訂單'}
      </button>
      <div style={{ fontSize: 10, color: '#666', textAlign: 'center', marginTop: 8 }}>
        送出後 {ambassador.name} 將立即收到通知並聯繫您
      </div>
    </div>
  )
}

// 成功頁
function SuccessView({ result, ambassador, onBack }) {
  return (
    <div className="cstm-success">
      <div className="cstm-success-icon"><Check size={40} /></div>
      <div style={{ fontSize: 17, color: '#fff', fontWeight: 600, letterSpacing: 2 }}>訂單已送出</div>
      <div className="cstm-success-no">{result.order_no}</div>
      <div style={{ fontSize: 14, color: '#aaa', marginTop: 16 }}>
        金額：<span style={{ color: '#c9a84c', fontWeight: 700 }}>${(+result.total_amount).toLocaleString()}</span>
      </div>
      <div style={{ fontSize: 13, color: '#888', marginTop: 30, lineHeight: 1.8 }}>
        <b style={{ color: '#c9a84c' }}>{ambassador.name}</b> 將盡快與您聯絡<br />
        確認付款方式與出貨資訊
      </div>
      <button className="cstm-btn cstm-btn-outline" style={{ marginTop: 40, maxWidth: 200 }} onClick={onBack}>
        繼續瀏覽
      </button>
    </div>
  )
}
