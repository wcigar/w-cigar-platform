// 客戶端展示+下單頁 — 走 dealer Supabase（oecagouzanoddmwfrvka）
// URL: /c/:ambassador_code（如 /c/XIAO_A）
// 🔒 合規：絕無公司名、地址、Wilson、W Cigar 字樣
// 🎯 復刻 dealer 客戶系統流程：年齡確認 → 商品 → 購物車 → 結帳 → 我的訂單
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabaseDealer as supabase } from '../../lib/supabaseDealer'
import { ShoppingCart, Plus, Minus, Trash2, ArrowLeft, Check, AlertCircle, ClipboardList } from 'lucide-react'

const CSS = `
.cstm-wrap{min-height:100vh;background:#0a0a0a;color:#e8e8e8;font-family:"PingFang TC","Noto Sans TC",sans-serif;padding-bottom:120px;}
.cstm-hdr{padding:20px 16px 12px;border-bottom:1px solid #1f1f1f;background:linear-gradient(180deg,#000,#0a0a0a);position:sticky;top:0;z-index:50;display:flex;justify-content:space-between;align-items:center;gap:12px;}
.cstm-hdr-left{flex:1;}
.cstm-hdr-title{font-size:20px;font-weight:300;letter-spacing:6px;color:#c9a84c;}
.cstm-hdr-sub{font-size:10px;color:#666;margin-top:3px;letter-spacing:3px;}
.cstm-my-orders-btn{background:transparent;border:1px solid #2a2a2a;color:#c9a84c;padding:7px 12px;border-radius:6px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;}
.cstm-my-orders-btn:hover{border-color:#c9a84c;}

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
.cstm-card{background:#111;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;cursor:pointer;transition:transform .15s,border-color .15s;position:relative;}
.cstm-card:hover{transform:translateY(-2px);border-color:rgba(201,168,76,.4);}
.cstm-sale-tag{position:absolute;top:8px;left:8px;background:#c44;color:#fff;font-size:10px;padding:3px 8px;border-radius:4px;font-weight:700;z-index:2;}
.cstm-img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#000;}
.cstm-body{padding:10px 12px;}
.cstm-brand{font-size:10px;color:#888;letter-spacing:1px;}
.cstm-name{font-size:13px;color:#e8e8e8;font-weight:600;margin-top:3px;line-height:1.3;min-height:34px;}
.cstm-spec{font-size:10px;color:#666;margin-top:4px;}
.cstm-price-row{display:flex;align-items:baseline;gap:6px;margin-top:6px;}
.cstm-price{font-size:18px;color:#c9a84c;font-weight:700;font-family:"Cormorant Garamond",serif;}
.cstm-orig{font-size:11px;color:#666;text-decoration:line-through;}
.cstm-stock{font-size:10px;color:#4a8;}
.cstm-stock.low{color:#c44;}

.cstm-fab{position:fixed;bottom:24px;right:20px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#c9a84c,#8b7a3e);color:#000;border:none;font-size:22px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px rgba(201,168,76,.4);z-index:100;display:flex;align-items:center;justify-content:center;}
.cstm-fab-badge{position:absolute;top:-4px;right:-4px;background:#c44;color:#fff;border-radius:50%;min-width:22px;height:22px;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0 6px;font-weight:800;}

.cstm-modal{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.cstm-modal-card{background:#0a0a0a;border:1px solid #c9a84c;border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:24px;}
.cstm-modal-h{font-size:16px;color:#c9a84c;font-weight:700;letter-spacing:3px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
.cstm-close{background:none;border:none;color:#888;font-size:28px;cursor:pointer;line-height:1;}

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
.cstm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}

.cstm-btn{width:100%;padding:14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;border:none;letter-spacing:3px;}
.cstm-btn-gold{background:linear-gradient(135deg,#c9a84c,#8b7a3e);color:#000;}
.cstm-btn-gold:disabled{opacity:.4;cursor:wait;}
.cstm-btn-outline{background:transparent;border:1px solid #2a2a2a;color:#888;}
.cstm-btn-outline:hover{border-color:#c9a84c;color:#c9a84c;}

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

/* 年齡確認門 */
.cstm-age-gate{position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;}
.cstm-age-card{max-width:420px;text-align:center;}
.cstm-age-title{font-size:22px;letter-spacing:8px;color:#c9a84c;margin-bottom:20px;font-weight:300;}
.cstm-age-warn{font-size:13px;color:#c44;background:rgba(196,77,77,.08);padding:14px;border-radius:8px;margin-bottom:20px;line-height:1.7;}
.cstm-age-btns{display:flex;gap:10px;margin-top:20px;}

/* 訂單卡 */
.cstm-order{background:#111;border:1px solid #1f1f1f;border-radius:10px;padding:14px;margin-bottom:10px;}
.cstm-order-no{font-size:11px;color:#888;letter-spacing:1px;}
.cstm-order-date{font-size:10px;color:#666;margin-top:2px;}
.cstm-order-status{font-size:10px;padding:3px 8px;border-radius:10px;font-weight:700;}
.cstm-order-items{margin-top:10px;padding-top:10px;border-top:1px solid #1f1f1f;font-size:12px;color:#aaa;}
.cstm-order-total{font-size:18px;color:#c9a84c;font-weight:700;text-align:right;margin-top:8px;}
`

const STATUS_LABELS = {
  pending: { l: '待確認', c: '#fb923c' },
  confirmed: { l: '已確認', c: '#4d8ac4' },
  paid: { l: '已付款', c: '#4a8' },
  shipped: { l: '出貨中', c: '#a78bfa' },
  completed: { l: '已完成', c: '#4a8' },
  cancelled: { l: '已取消', c: '#666' },
}

// 主元件
export default function CustomerApp() {
  const { ambassador_code } = useParams()
  const [ambassador, setAmbassador] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cart, setCart] = useState([])
  const [view, setView] = useState('shop') // shop | cart | checkout | success | my-orders
  const [catFilter, setCatFilter] = useState('全部')
  const [orderResult, setOrderResult] = useState(null)
  const [ageConfirmed, setAgeConfirmed] = useState(() => localStorage.getItem('age_gate_passed') === '1')
  const [savedPhone, setSavedPhone] = useState(() => localStorage.getItem('c_last_phone') || '')

  useEffect(() => { load() }, [ambassador_code])
  useEffect(() => {
    const saved = localStorage.getItem('c_cart_' + ambassador_code)
    if (saved) try { setCart(JSON.parse(saved)) } catch {}
  }, [ambassador_code])
  useEffect(() => {
    localStorage.setItem('c_cart_' + ambassador_code, JSON.stringify(cart))
  }, [cart, ambassador_code])

  async function load() {
    setLoading(true); setError(null)
    // 1. 找推薦人（dealer.code = ambassador_code、dealer_type 可以是 ambassador / dealer 都接受）
    const { data: dealer } = await supabase
      .from('dealers')
      .select('id, code, name, dealer_type, tier, is_active, blocked, paused_at, terminated_at')
      .ilike('code', ambassador_code)
      .maybeSingle()
    if (!dealer) { setError('連結無效或已過期'); setLoading(false); return }
    if (!dealer.is_active || dealer.blocked || dealer.terminated_at) {
      setError('連結已停用、請聯絡您的服務專員'); setLoading(false); return
    }
    setAmbassador(dealer)
    // 2. 載入商品（shop_visible=true、retail_price > 0）
    const { data: prods } = await supabase
      .from('products')
      .select('id, brand, name, spec, pack, retail_price, sale_price, sale_starts_at, sale_ends_at, sale_label, sections, image_url, stock_status, shop_featured, sale_stock_limit, sale_stock_sold')
      .eq('shop_visible', true)
      .eq('is_active', true)
      .gt('retail_price', 0)
      .order('shop_featured', { ascending: false })
      .order('sort_order', { ascending: true, nullsFirst: false })
    setProducts(prods || [])
    setLoading(false)
  }

  function addToCart(p) {
    const price = currentPrice(p)
    setCart(c => {
      const exist = c.find(x => x.product_id === p.id)
      if (exist) return c.map(x => x.product_id === p.id ? { ...x, qty: x.qty + 1 } : x)
      return [...c, { product_id: p.id, name: p.name, brand: p.brand, image_url: p.image_url, unit_price: price, qty: 1 }]
    })
  }
  function setQty(pid, delta) {
    setCart(c => c.map(x => x.product_id === pid ? { ...x, qty: Math.max(0, x.qty + delta) } : x).filter(x => x.qty > 0))
  }
  function removeItem(pid) { setCart(c => c.filter(x => x.product_id !== pid)) }

  const cartSubtotal = useMemo(() => cart.reduce((s, x) => s + x.unit_price * x.qty, 0), [cart])
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

  if (!ageConfirmed) return <AgeGate onPass={() => { localStorage.setItem('age_gate_passed', '1'); setAgeConfirmed(true) }} />

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

      <div className="cstm-hdr">
        <div className="cstm-hdr-left">
          <div className="cstm-hdr-title">PREMIUM CIGARS</div>
          <div className="cstm-hdr-sub">精選雪茄品鑑</div>
        </div>
        {savedPhone && (
          <button className="cstm-my-orders-btn" onClick={() => setView('my-orders')}>
            <ClipboardList size={12} /> 我的訂單
          </button>
        )}
      </div>

      <div className="cstm-ambinfo">
        <div className="cstm-amb-label">您的專屬服務</div>
        <div className="cstm-amb-name">{ambassador.name}</div>
        <div className="cstm-amb-hint">下單後將由 {ambassador.name} 為您確認細節</div>
      </div>

      {view === 'success' && orderResult ? (
        <SuccessView result={orderResult} ambassador={ambassador} onBack={() => { setCart([]); setOrderResult(null); setView('shop') }} />
      ) : view === 'my-orders' ? (
        <MyOrdersView phone={savedPhone} onBack={() => setView('shop')} />
      ) : view === 'checkout' ? (
        <CheckoutView
          cart={cart} cartSubtotal={cartSubtotal} ambassador={ambassador}
          savedPhone={savedPhone}
          onBack={() => setView('cart')}
          onPlaced={(res) => {
            setOrderResult(res);
            setView('success');
            if (res.contact_phone) {
              localStorage.setItem('c_last_phone', res.contact_phone)
              setSavedPhone(res.contact_phone)
            }
          }}
        />
      ) : (
        <>
          <div className="cstm-cats">
            {categories.map(c => (
              <button key={c} className={'cstm-cat' + (catFilter === c ? ' active' : '')} onClick={() => setCatFilter(c)}>{c}</button>
            ))}
          </div>

          <div className="cstm-grid">
            {filteredProducts.map(p => {
              const onSale = isOnSale(p)
              const price = currentPrice(p)
              return (
                <div key={p.id} className="cstm-card" onClick={() => addToCart(p)}>
                  {onSale && <div className="cstm-sale-tag">{p.sale_label || 'SALE'}</div>}
                  {p.image_url && <img src={p.image_url} alt="" className="cstm-img" loading="lazy" />}
                  <div className="cstm-body">
                    <div className="cstm-brand">{p.brand}</div>
                    <div className="cstm-name">{p.name}</div>
                    {p.spec && <div className="cstm-spec">{p.spec}</div>}
                    <div className="cstm-price-row">
                      <div className="cstm-price">${price?.toLocaleString()}</div>
                      {onSale && <div className="cstm-orig">${p.retail_price?.toLocaleString()}</div>}
                    </div>
                    <div className={'cstm-stock' + (p.stock_status === 'low' ? ' low' : '')}>
                      {p.stock_status === 'out' ? '缺貨' : p.stock_status === 'low' ? '少量現貨' : '現貨'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredProducts.length === 0 && <div className="cstm-empty">此分類目前無品項</div>}
        </>
      )}

      <div className="cstm-warning">⚠️ 本網站限 20+ 成年人 ｜ 吸菸有害健康</div>
      <div className="cstm-footer">
        © 限會員邀請瀏覽 · 不對外公開<br />
        如需服務請聯絡推薦您的專員
      </div>

      {view === 'shop' && cartCount > 0 && (
        <button className="cstm-fab" onClick={() => setView('cart')}>
          <ShoppingCart size={22} />
          <span className="cstm-fab-badge">{cartCount}</span>
        </button>
      )}

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
                      <div className="cstm-cart-price">${(it.unit_price * it.qty).toLocaleString()}</div>
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
                  <div className="cstm-sr big"><span>小計</span><span>${cartSubtotal.toLocaleString()}</span></div>
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

function currentPrice(p) {
  if (isOnSale(p) && p.sale_price > 0) return p.sale_price
  return p.retail_price
}
function isOnSale(p) {
  if (!p.sale_price || p.sale_price <= 0 || p.sale_price >= p.retail_price) return false
  const now = new Date()
  if (p.sale_starts_at && new Date(p.sale_starts_at) > now) return false
  if (p.sale_ends_at && new Date(p.sale_ends_at) < now) return false
  if (p.sale_stock_limit && p.sale_stock_sold >= p.sale_stock_limit) return false
  return true
}

// 年齡確認門
function AgeGate({ onPass }) {
  return (
    <div className="cstm-age-gate">
      <style>{CSS}</style>
      <div className="cstm-age-card">
        <div className="cstm-age-title">PREMIUM CIGARS</div>
        <div className="cstm-age-warn">
          ⚠️ 此網站含菸品資訊<br />
          僅供 <b>滿 20 歲成年人</b> 瀏覽<br />
          <br />
          吸菸有害健康<br />
          戒菸專線 0800-636363
        </div>
        <div className="cstm-age-btns">
          <button className="cstm-btn cstm-btn-outline" onClick={() => { window.location.href = 'https://www.google.com' }}>
            未滿 20 歲 · 離開
          </button>
          <button className="cstm-btn cstm-btn-gold" onClick={onPass}>
            我已滿 20 歲
          </button>
        </div>
      </div>
    </div>
  )
}

// 結帳頁
function CheckoutView({ cart, cartSubtotal, ambassador, savedPhone, onBack, onPlaced }) {
  const [form, setForm] = useState({
    name: '', phone: savedPhone || '', line_id: '',
    shipping_method: '黑貓宅配', shipping_address: '',
    payment_method: '匯款', notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)

  const shippingFee = form.shipping_method === '自取' ? 0 : (cartSubtotal >= 5000 ? 0 : 120)
  const orderTotal = cartSubtotal + shippingFee

  async function submit() {
    setErr(null)
    if (!form.name.trim()) { setErr('請填寫姓名'); return }
    if (!form.phone.trim()) { setErr('請填寫電話'); return }
    if (!/^09\d{8}$/.test(form.phone.trim().replace(/\s|-/g, ''))) { setErr('電話格式錯誤（09 開頭 10 碼）'); return }
    if (form.shipping_method !== '自取' && !form.shipping_address.trim()) { setErr('請填寫收貨地址'); return }
    setSubmitting(true)

    const items_json = cart.map(x => ({
      product_id: x.product_id, name: x.name, brand: x.brand,
      qty: x.qty, unit_price: x.unit_price, subtotal: x.unit_price * x.qty
    }))
    const order_no = 'CO-' + new Date().toISOString().replace(/[-:T.Z]/g, '').slice(2, 14) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()

    const { data, error } = await supabase
      .from('customer_orders')
      .insert({
        order_no,
        ref_source: 'web_link',
        referrer_dealer_code: ambassador.code,
        referrer_dealer_id: ambassador.id,
        referrer_dealer_type: ambassador.dealer_type || ambassador.tier || 'ambassador',
        contact_name: form.name.trim(),
        contact_phone: form.phone.trim(),
        shipping_method: form.shipping_method,
        shipping_address: form.shipping_address.trim() || null,
        shipping_fee: shippingFee,
        subtotal: cartSubtotal,
        order_total: orderTotal,
        items_json,
        payment_method: form.payment_method,
        payment_status: 'unpaid',
        status: 'pending',
        notes: form.notes.trim() || null,
      })
      .select('id, order_no, order_total, contact_phone')
      .single()

    if (error) { setErr(error.message); setSubmitting(false); return }

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

      <div className="cstm-row">
        <div>
          <label className="cstm-label">手機 *</label>
          <input className="cstm-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="09xxxxxxxx" inputMode="numeric" />
        </div>
        <div>
          <label className="cstm-label">LINE ID（選填）</label>
          <input className="cstm-input" value={form.line_id} onChange={e => setForm(p => ({ ...p, line_id: e.target.value }))} placeholder="方便聯絡" />
        </div>
      </div>

      <label className="cstm-label">配送方式 *</label>
      <select className="cstm-input" value={form.shipping_method} onChange={e => setForm(p => ({ ...p, shipping_method: e.target.value }))}>
        <option>黑貓宅配</option>
        <option>新竹貨運</option>
        <option>自取</option>
      </select>

      {form.shipping_method !== '自取' && (
        <>
          <label className="cstm-label">收貨地址 *</label>
          <input className="cstm-input" value={form.shipping_address} onChange={e => setForm(p => ({ ...p, shipping_address: e.target.value }))} placeholder="完整地址、含郵遞區號" />
        </>
      )}

      <label className="cstm-label">付款方式</label>
      <select className="cstm-input" value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
        <option>匯款</option>
        <option>貨到付款</option>
        <option>LINE Pay</option>
      </select>

      <label className="cstm-label">備註（選填）</label>
      <textarea className="cstm-input" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="特殊需求或希望聯絡時段" />

      <div className="cstm-summary">
        {cart.map(it => (
          <div key={it.product_id} className="cstm-sr">
            <span>{it.brand} {it.name} × {it.qty}</span>
            <span>${(it.unit_price * it.qty).toLocaleString()}</span>
          </div>
        ))}
        <div className="cstm-sr"><span>小計</span><span>${cartSubtotal.toLocaleString()}</span></div>
        <div className="cstm-sr">
          <span>運費{cartSubtotal >= 5000 && form.shipping_method !== '自取' ? '（滿 5000 免運）' : ''}</span>
          <span>${shippingFee.toLocaleString()}</span>
        </div>
        <div className="cstm-sr big"><span>應付總額</span><span>${orderTotal.toLocaleString()}</span></div>
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

// 我的訂單
function MyOrdersView({ phone, onBack }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { load() }, [phone])
  async function load() {
    if (!phone) { setLoading(false); return }
    const { data } = await supabase
      .from('customer_orders')
      .select('id, order_no, order_total, status, payment_status, items_json, shipping_method, created_at, shipping_no')
      .eq('contact_phone', phone)
      .order('created_at', { ascending: false })
      .limit(20)
    setOrders(data || [])
    setLoading(false)
  }
  return (
    <div style={{ padding: '16px' }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <ArrowLeft size={14} /> 返回
      </button>
      <div className="cstm-modal-h" style={{ marginBottom: 16 }}>我的訂單</div>
      {loading ? <div className="cstm-empty">載入中...</div> :
       orders.length === 0 ? <div className="cstm-empty">目前無訂單紀錄</div> :
       orders.map(o => {
         const s = STATUS_LABELS[o.status] || { l: o.status, c: '#888' }
         const items = Array.isArray(o.items_json) ? o.items_json : []
         return (
           <div key={o.id} className="cstm-order">
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div>
                 <div className="cstm-order-no">{o.order_no}</div>
                 <div className="cstm-order-date">{new Date(o.created_at).toLocaleString('zh-TW')}</div>
               </div>
               <div className="cstm-order-status" style={{ background: s.c + '22', color: s.c }}>{s.l}</div>
             </div>
             <div className="cstm-order-items">
               {items.slice(0, 3).map((it, i) => (
                 <div key={i}>· {it.brand} {it.name} × {it.qty}</div>
               ))}
               {items.length > 3 && <div>...其他 {items.length - 3} 項</div>}
             </div>
             {o.shipping_no && <div style={{ fontSize: 11, color: '#4a8', marginTop: 6 }}>📦 物流編號：{o.shipping_no}</div>}
             <div className="cstm-order-total">${(+o.order_total).toLocaleString()}</div>
           </div>
         )
       })
      }
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
        應付金額：<span style={{ color: '#c9a84c', fontWeight: 700 }}>${(+result.order_total).toLocaleString()}</span>
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
