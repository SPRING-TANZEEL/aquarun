import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Inventory({ tenantId }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (tenantId) fetchProducts() }, [tenantId])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase.from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('product_type').order('name')
    setProducts(data || [])
    setLoading(false)
  }

  const rawMaterials = products.filter(p => p.product_type === 'raw_material')
  const finishedGoods = products.filter(p => p.product_type === 'finished_good')
  const tradingItems = products.filter(p => p.product_type === 'trading')

  const tabs = [
    { key: 'dashboard', label: '📊 Stock Overview' },
    { key: 'opening', label: '🗂️ Opening Stock' },
    { key: 'purchase', label: '📥 Purchase' },
    { key: 'production', label: '🏭 Production' },
    { key: 'products', label: '📦 Products' },
    { key: 'history', label: '📋 History' },
  ]

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>🏭 Inventory Management</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Raw materials, production, finished goods and trading items.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: activeTab === t.key ? '#0f4c81' : '#f0f0f0',
              color: activeTab === t.key ? 'white' : '#555',
              fontWeight: activeTab === t.key ? '700' : '400', fontSize: '13px'
            }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'dashboard' && <StockDashboard products={products} loading={loading} rawMaterials={rawMaterials} finishedGoods={finishedGoods} tradingItems={tradingItems} />}
      {activeTab === 'opening' && <OpeningStock products={products} onRefresh={fetchProducts} tenantId={tenantId} />}
      {activeTab === 'purchase' && <PurchaseEntry products={products} onRefresh={fetchProducts} tenantId={tenantId} />}
      {activeTab === 'production' && <ProductionEntry products={products} onRefresh={fetchProducts} tenantId={tenantId} />}
      {activeTab === 'products' && <ProductManagement products={products} onRefresh={fetchProducts} tenantId={tenantId} />}
      {activeTab === 'history' && <StockHistory products={products} tenantId={tenantId} />}
    </div>
  )
}

// ─── STOCK DASHBOARD ───────────────────────────────────────────────
function StockDashboard({ products, loading, rawMaterials, finishedGoods, tradingItems }) {
  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  function StockCard({ product }) {
    const isLow = product.current_stock < 10
    const isShrinkingPaper = product.name === 'Shrinking Paper'
    return (
      <div style={{
        background: 'white', borderRadius: '12px', padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        borderLeft: `4px solid ${isLow ? '#f44336' : '#1a7a4a'}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: 0, flex: 1 }}>{product.name}</p>
          {isLow && <span style={{ fontSize: '10px', background: '#ffebee', color: '#c62828', padding: '2px 6px', borderRadius: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>Low Stock</span>}
        </div>
        <p style={{ fontSize: '28px', fontWeight: '700', color: isLow ? '#f44336' : '#0f4c81', margin: '0 0 4px' }}>
          {Number(product.current_stock).toLocaleString()}
          <span style={{ fontSize: '13px', color: '#888', fontWeight: '400', marginLeft: '4px' }}>pcs</span>
        </p>
        {isShrinkingPaper && (
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
            {Number(product.current_stock_kg || 0).toFixed(2)} kg remaining
          </p>
        )}
        {product.sale_price > 0 && (
          <p style={{ fontSize: '12px', color: '#1a7a4a', margin: '4px 0 0', fontWeight: '600' }}>
            Sale: Rs. {Number(product.sale_price).toLocaleString()}
          </p>
        )}
        {product.opening_stock > 0 && (
          <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>
            Opening: {Number(product.opening_stock).toLocaleString()} pcs
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>🧪 Raw Materials</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {rawMaterials.map(p => <StockCard key={p.id} product={p} />)}
      </div>

      <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>✅ Finished Goods</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {finishedGoods.map(p => <StockCard key={p.id} product={p} />)}
      </div>

      {tradingItems.length > 0 && (
        <>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>🛒 Trading Items</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {tradingItems.map(p => <StockCard key={p.id} product={p} />)}
          </div>
        </>
      )}
    </div>
  )
}

// ─── OPENING STOCK ─────────────────────────────────────────────────
function OpeningStock({ products, onRefresh, tenantId }) {
  const [stockValues, setStockValues] = useState({})
  const [kgValues, setKgValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const initial = {}
    const initialKg = {}
    products.forEach(p => {
      initial[p.id] = p.opening_stock || 0
      if (p.name === 'Shrinking Paper') initialKg[p.id] = p.current_stock_kg || 0
    })
    setStockValues(initial)
    setKgValues(initialKg)
  }, [products])

  async function saveOpeningStock() {
    setSaving(true)
    for (const product of products) {
      const openingQty = Number(stockValues[product.id] || 0)
      const updateData = {
        opening_stock: openingQty,
        current_stock: openingQty
      }
      if (product.name === 'Shrinking Paper') {
        updateData.current_stock_kg = Number(kgValues[product.id] || 0)
      }
      await supabase.from('products')
        .update(updateData)
        .eq('id', product.id)
        .eq('tenant_id', tenantId)
    }
    setSaved(true)
    onRefresh()
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  function Section({ title, items }) {
    if (items.length === 0) return null
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '14px' }}>{title}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(p => (
            <div key={p.id}>
              <div style={{ display: 'grid', gridTemplateColumns: p.name === 'Shrinking Paper' ? '2fr 1fr 1fr' : '2fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>{p.name}</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Current stock: {Number(p.current_stock || 0).toLocaleString()} pcs</p>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>
                    {p.name === 'Shrinking Paper' ? 'Opening Pieces' : 'Opening Stock (pcs)'}
                  </label>
                  <input type="number" value={stockValues[p.id] || ''}
                    onChange={e => setStockValues(v => ({ ...v, [p.id]: e.target.value }))}
                    placeholder="0" style={inp} />
                </div>
                {p.name === 'Shrinking Paper' && (
                  <div>
                    <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>Opening KGs</label>
                    <input type="number" value={kgValues[p.id] || ''}
                      onChange={e => setKgValues(v => ({ ...v, [p.id]: e.target.value }))}
                      placeholder="0.00" style={inp} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>🗂️ Opening Stock Entry</h3>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
          Enter your current physical stock for all products. This is a one-time setup — after this all movements are tracked automatically.
        </p>
      </div>

      {saved && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', margin: 0 }}>✅ Opening stock saved! All stock levels updated.</p>
        </div>
      )}

      <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>⚠️ Important</p>
        <p style={{ fontSize: '12px', color: '#795548', margin: 0 }}>
          Saving opening stock will overwrite the current stock for all products. Only use this once at the start. After that use Purchase, Production, and Adjustments to update stock.
        </p>
      </div>

      <Section title="🧪 Raw Materials" items={products.filter(p => p.product_type === 'raw_material')} />
      <Section title="✅ Finished Goods" items={products.filter(p => p.product_type === 'finished_good')} />
      <Section title="🛒 Trading Items" items={products.filter(p => p.product_type === 'trading')} />

      <button onClick={saveOpeningStock} disabled={saving}
        style={{ width: '100%', padding: '14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
        {saving ? 'Saving...' : '✓ Save Opening Stock'}
      </button>
    </div>
  )
}

// ─── PURCHASE ENTRY ────────────────────────────────────────────────
function PurchaseEntry({ products, onRefresh, tenantId }) {
  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState('')
  const [quantityKg, setQuantityKg] = useState('')
  const [piecesPerKg, setPiecesPerKg] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const PAYMENT_METHODS = [
    { key: 'cash', label: 'Cash', icon: '💵' },
    { key: 'jazzcash', label: 'JazzCash', icon: '📱' },
    { key: 'bank', label: 'Bank', icon: '🏦' },
  ]

  const purchasableProducts = products.filter(p => p.product_type === 'raw_material' || p.product_type === 'trading')
  const product = products.find(p => p.id === selectedProduct)
  const isShrinkingPaper = product?.name === 'Shrinking Paper'
  const totalCost = isShrinkingPaper
    ? Number(quantityKg) * Number(purchasePrice)
    : Number(quantity) * Number(purchasePrice)

  async function savePurchase() {
    if (!selectedProduct) return alert('Please select a product')
    if (isShrinkingPaper) {
      if (!quantityKg || Number(quantityKg) <= 0) return alert('Please enter KGs purchased')
      if (!piecesPerKg || Number(piecesPerKg) <= 0) return alert('Please enter pieces per KG')
    } else {
      if (!quantity || Number(quantity) <= 0) return alert('Please enter quantity')
    }
    if (!purchasePrice || Number(purchasePrice) <= 0) return alert('Please enter purchase price')

    setSaving(true)
    const totalPieces = isShrinkingPaper ? Number(quantityKg) * Number(piecesPerKg) : Number(quantity)

    const { data: savedPurchase, error } = await supabase.from('stock_purchases').insert([{
      tenant_id: tenantId,
      product_id: selectedProduct,
      quantity: totalPieces,
      quantity_kg: isShrinkingPaper ? Number(quantityKg) : 0,
      pieces_per_kg: isShrinkingPaper ? Number(piecesPerKg) : 0,
      purchase_price: Number(purchasePrice),
      total_cost: isShrinkingPaper ? Number(quantityKg) * Number(purchasePrice) : totalPieces * Number(purchasePrice),
      supplier, notes,
      payment_method: paymentMethod,
      purchase_date: new Date().toISOString().split('T')[0]
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Auto-post journal entry
    try {
      const { postStockPurchaseJournal } = await import('../accountingEngine')
      await postStockPurchaseJournal(savedPurchase, tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    const updateData = { current_stock: (product.current_stock || 0) + totalPieces }
    if (isShrinkingPaper) updateData.current_stock_kg = (product.current_stock_kg || 0) + Number(quantityKg)
    await supabase.from('products')
      .update(updateData)
      .eq('id', selectedProduct)
      .eq('tenant_id', tenantId)

    setSuccess(true)
    setSelectedProduct('')
    setQuantity('')
    setQuantityKg('')
    setPiecesPerKg('')
    setPurchasePrice('')
    setSupplier('')
    setNotes('')
    setPaymentMethod('cash')
    onRefresh()
    setSaving(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📥 Purchase Entry</h3>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', margin: 0 }}>✅ Purchase recorded and stock updated!</p>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Select Product *</label>
          <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} style={inp}>
            <option value="">-- Select Product --</option>
            {purchasableProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name} — Stock: {Number(p.current_stock).toLocaleString()} pcs</option>
            ))}
          </select>
        </div>

        {isShrinkingPaper ? (
          <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', margin: '0 0 12px' }}>📦 Shrinking Paper — KG Based Purchase</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>KGs Purchased *</label>
                <input type="number" value={quantityKg} onChange={e => setQuantityKg(e.target.value)} placeholder="e.g. 5" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Pieces per KG *</label>
                <input type="number" value={piecesPerKg} onChange={e => setPiecesPerKg(e.target.value)} placeholder="55 to 80" style={inp} />
              </div>
            </div>
            {quantityKg && piecesPerKg && (
              <div style={{ marginTop: '12px', padding: '10px', background: 'white', borderRadius: '8px' }}>
                <p style={{ fontSize: '13px', color: '#333', margin: 0 }}>
                  Total Pieces: <strong>{(Number(quantityKg) * Number(piecesPerKg)).toLocaleString()} pcs</strong>
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Quantity (pcs) *</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 1000" style={inp} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>
              {isShrinkingPaper ? 'Price per KG (Rs.) *' : 'Price per Unit (Rs.) *'}
            </label>
            <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="0" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Supplier (optional)</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier name" style={inp} />
          </div>
        </div>

        {/* Payment Method */}
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>Paid From</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {PAYMENT_METHODS.map(m => (
            <button key={m.key} onClick={() => setPaymentMethod(m.key)}
              style={{
                flex: 1, padding: '12px 6px', border: '2px solid',
                borderColor: paymentMethod === m.key ? (m.key === 'cash' ? '#0f4c81' : m.key === 'jazzcash' ? '#9c27b0' : '#1a7a4a') : '#eee',
                borderRadius: '10px', cursor: 'pointer',
                background: paymentMethod === m.key ? (m.key === 'cash' ? '#e3f0ff' : m.key === 'jazzcash' ? '#fdf4ff' : '#e8f5e9') : '#f8f9fa',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
              }}>
              <span style={{ fontSize: '20px' }}>{m.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: paymentMethod === m.key ? (m.key === 'cash' ? '#0f4c81' : m.key === 'jazzcash' ? '#9c27b0' : '#1a7a4a') : '#555' }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." style={inp} />
        </div>

        {totalCost > 0 && (
          <div style={{ background: '#e8f5e9', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#333' }}>Total Purchase Cost</span>
              <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {totalCost.toLocaleString()}</span>
            </div>
            <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>
              Will be deducted from {paymentMethod === 'cash' ? '💵 Cash in Hand' : paymentMethod === 'jazzcash' ? '📱 JazzCash' : '🏦 Bank'} balance
            </p>
          </div>
        )}

        <button onClick={savePurchase} disabled={saving}
          style={{ width: '100%', padding: '14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
          {saving ? 'Saving...' : '✓ Record Purchase'}
        </button>
      </div>
    </div>
  )
}

// ─── PRODUCTION ENTRY ──────────────────────────────────────────────
function ProductionEntry({ products, onRefresh, tenantId }) {
  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [bom, setBom] = useState([])
  const [bomLoading, setBomLoading] = useState(false)
  const [overhead, setOverhead] = useState(20)
  const [notes, setNotes] = useState('')

  const finishedGoods = products.filter(p => p.product_type === 'finished_good')

  async function loadBom(productId) {
    if (!productId) { setBom([]); return }
    setBomLoading(true)
    const { data } = await supabase
      .from('bill_of_materials')
      .select('*, raw_material:raw_material_id(*)')
      .eq('tenant_id', tenantId)
      .eq('finished_good_id', productId)
    setBom(data || [])
    setBomLoading(false)
  }

  function handleProductChange(id) {
    setSelectedProduct(id)
    setQuantity('')
    setSuccess(null)
    loadBom(id)
  }

  const product = products.find(p => p.id === selectedProduct)
  const qty = Number(quantity) || 0

  function getRawMaterialRequired(bomItem) {
    const rm = products.find(p => p.id === bomItem.raw_material_id)
    const required = bomItem.quantity_per_unit * qty
    const available = rm?.current_stock || 0
    const sufficient = available >= required
    return { required, available, sufficient, rm }
  }

  async function saveProduction() {
    if (!selectedProduct) return alert('Please select a product')
    if (!quantity || qty <= 0) return alert('Please enter quantity to produce')

    for (const bomItem of bom) {
      const { required, available, sufficient, rm } = getRawMaterialRequired(bomItem)
      if (!sufficient) {
        return alert(`Insufficient stock!\n${rm?.name}: Need ${required}, Available ${available}`)
      }
    }

    setSaving(true)
     const totalOverhead = qty * overhead

    const { data: prodEntry, error: prodError } = await supabase
      .from('production_entries')
      .insert([{
        tenant_id: tenantId,
        finished_good_id: selectedProduct,
        quantity_produced: qty,
        total_overhead: totalOverhead,
        production_date: new Date().toISOString().split('T')[0],
        notes: notes,
        total_cost: 0,
        cost_per_unit: 0
      }])
      .select().single()

    if (prodError) { alert('Error: ' + prodError.message); setSaving(false); return }

    let totalRawMaterialCost = 0

    for (const bomItem of bom) {
      const consumed = bomItem.quantity_per_unit * qty
      const rm = products.find(p => p.id === bomItem.raw_material_id)
      const unitCost = Number(rm?.average_cost || rm?.purchase_price || 0)
      const lineCost = consumed * unitCost
      totalRawMaterialCost += lineCost

      // Save consumption line
      await supabase.from('production_consumption').insert([{
        tenant_id: tenantId,
        production_entry_id: prodEntry.id,
        raw_material_id: bomItem.raw_material_id,
        quantity_consumed: consumed,
        unit_cost: unitCost,
        total_cost: lineCost
      }])

      // Reduce raw material stock
      const newStock = Math.max(0, (rm?.current_stock || 0) - consumed)
      const updateData = { current_stock: newStock }
      if (rm?.name === 'Shrinking Paper' && rm?.current_stock_kg > 0 && rm?.current_stock > 0) {
        const kgPerPiece = rm.current_stock_kg / rm.current_stock
        updateData.current_stock_kg = Math.max(0, (rm.current_stock_kg || 0) - (consumed * kgPerPiece))
      }
      await supabase.from('products').update(updateData).eq('id', bomItem.raw_material_id).eq('tenant_id', tenantId)
    }

    const totalCost = totalRawMaterialCost + totalOverhead
    const costPerUnit = qty > 0 ? totalCost / qty : 0

    // Update production entry with actual cost
    await supabase.from('production_entries')
      .update({ total_cost: totalCost, cost_per_unit: costPerUnit })
      .eq('id', prodEntry.id)
      .eq('tenant_id', tenantId)

    // Increase finished good stock and update average cost
    const currentStock = product?.current_stock || 0
    const currentAvgCost = product?.average_cost || 0
    const newAvgCost = currentStock > 0
      ? ((currentStock * currentAvgCost) + totalCost) / (currentStock + qty)
      : costPerUnit

    await supabase.from('products').update({
      current_stock: currentStock + qty,
      average_cost: newAvgCost
    }).eq('id', selectedProduct).eq('tenant_id', tenantId)

    // Post journal entry
    // DR 1201 Finished Goods Inventory
    // CR 1200 Raw Materials Inventory (raw material cost)
    // CR 5002 Production Overhead (overhead cost)
    try {
      const { data: je } = await supabase.from('journal_entries').insert([{
        tenant_id: tenantId,
        entry_date: new Date().toISOString().split('T')[0],
        reference_type: 'production',
        reference_id: prodEntry.id,
        narration: `Production: ${product?.name} × ${qty} units — Cost Rs.${totalCost.toLocaleString()}`,
        total_amount: totalCost,
        created_by: 'admin'
      }]).select().single()

      if (je) {
        const lines = [
          { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1201', account_name: 'Inventory - Finished Goods', debit: totalCost, credit: 0 },
        ]
        if (totalRawMaterialCost > 0) {
          lines.push({ tenant_id: tenantId, journal_entry_id: je.id, account_code: '1200', account_name: 'Inventory - Raw Materials', debit: 0, credit: totalRawMaterialCost })
        }
        if (totalOverhead > 0) {
          lines.push({ tenant_id: tenantId, journal_entry_id: je.id, account_code: '5002', account_name: 'Production Overhead', debit: 0, credit: totalOverhead })
        }
        await supabase.from('journal_entry_lines').insert(lines)
        await supabase.from('production_entries').update({ journal_entry_id: je.id }).eq('id', prodEntry.id)
      }
    } catch (err) { console.error('Journal error:', err) }

    setSuccess({ product: product?.name, qty, totalOverhead, totalRawMaterialCost, totalCost, costPerUnit })
    setSelectedProduct('')
    setQuantity('')
    setBom([])
    onRefresh()
    setSaving(false)
  }

  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>🏭 Production Entry</h3>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Production Recorded!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{success.product} × {success.qty} units produced</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Raw Material Cost: Rs. {success.totalRawMaterialCost?.toLocaleString()}</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Overhead: Rs. {success.totalOverhead?.toLocaleString()}</p>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>Total Cost: Rs. {success.totalCost?.toLocaleString()}</p>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Cost per Unit: Rs. {Number(success.costPerUnit).toFixed(2)}</p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            New Production
          </button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Select Finished Good *</label>
          <select value={selectedProduct} onChange={e => handleProductChange(e.target.value)} style={inp}>
            <option value="">-- Select Product --</option>
            {finishedGoods.map(p => (
              <option key={p.id} value={p.id}>{p.name} (Stock: {Number(p.current_stock).toLocaleString()} pcs)</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Quantity to Produce *</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 100" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Overhead per Unit (Rs.)</label>
            <input type="number" value={overhead} onChange={e => setOverhead(Number(e.target.value) || 0)} placeholder="20" style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Morning batch..." style={inp} />
        </div>

        {selectedProduct && qty > 0 && bom.length > 0 && (
          <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Raw Material Requirements</p>
            {bom.map(item => {
              const { required, available, sufficient } = getRawMaterialRequired(item)
              return (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{item.raw_material?.name}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                      {item.quantity_per_unit} × {qty} = <strong>{required} pcs needed</strong>
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: sufficient ? '#1a7a4a' : '#f44336', margin: 0 }}>
                      {available} available
                    </p>
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: '700',
                      background: sufficient ? '#e8f5e9' : '#ffebee',
                      color: sufficient ? '#2e7d32' : '#c62828'
                    }}>{sufficient ? '✅ OK' : '❌ Insufficient'}</span>
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop: '12px', padding: '10px', background: 'white', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>Overhead ({qty} × Rs. {OVERHEAD_PER_UNIT})</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#e65100' }}>Rs. {(qty * OVERHEAD_PER_UNIT).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <button onClick={saveProduction} disabled={saving}
          style={{ width: '100%', padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
          {saving ? 'Saving...' : '✓ Record Production'}
        </button>
      </div>
    </div>
  )
}

// ─── PRODUCT MANAGEMENT ────────────────────────────────────────────
function ProductManagement({ products, onRefresh, tenantId }) {
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [manageBom, setManageBom] = useState(null)
  const [form, setForm] = useState({
    name: '', product_type: 'trading', unit: 'pcs',
    sale_price: 0, purchase_price: 0, is_saleable: true, notes: ''
  })
  const [saving, setSaving] = useState(false)

  function openAddForm() {
    setEditProduct(null)
    setForm({ name: '', product_type: 'trading', unit: 'pcs', sale_price: 0, purchase_price: 0, is_saleable: true, notes: '' })
    setShowForm(true)
  }

  function openEditForm(p) {
    setEditProduct(p)
    setForm({
      name: p.name, product_type: p.product_type, unit: p.unit,
      sale_price: p.sale_price || 0, purchase_price: p.purchase_price || 0,
      is_saleable: p.is_saleable, notes: p.notes || ''
    })
    setShowForm(true)
  }

  async function saveProduct() {
    if (!form.name) return alert('Please enter product name')
    setSaving(true)

    if (editProduct) {
      const { error } = await supabase.from('products')
        .update(form)
        .eq('id', editProduct.id)
        .eq('tenant_id', tenantId)
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      alert('Product updated!')
    } else {
      const { error } = await supabase.from('products').insert([{
        ...form,
        tenant_id: tenantId,
        current_stock: 0,
        opening_stock: 0
      }])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      alert('Product added! Go to Opening Stock tab to set current stock.')
    }

    setShowForm(false)
    setEditProduct(null)
    onRefresh()
    setSaving(false)
  }

  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', margin: 0 }}>📦 Product Management</h3>
        <button onClick={openAddForm}
          style={{ padding: '10px 18px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          + Add Product
        </button>
      </div>

      {manageBom && (
        <BOMEditor
          product={manageBom}
          products={products}
          tenantId={tenantId}
          onClose={() => setManageBom(null)}
        />
      )}

      {showForm && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, color: '#0f4c81' }}>{editProduct ? '✏️ Edit Product' : '➕ New Product'}</h4>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Product Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Table Dispenser" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Product Type *</label>
              <select value={form.product_type} onChange={e => setForm({ ...form, product_type: e.target.value })} style={inp}>
                <option value="trading">Trading Item (Buy & Sell)</option>
                <option value="raw_material">Raw Material</option>
                <option value="finished_good">Finished Good</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Sale Price (Rs.)</label>
              <input type="number" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: Number(e.target.value) })} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Purchase Price (Rs.)</label>
              <input type="number" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: Number(e.target.value) })} placeholder="0" style={inp} />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Notes (optional)</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes..." style={inp} />
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: form.is_saleable ? '#e8f5e9' : '#f8f9fa',
            border: '1px solid ' + (form.is_saleable ? '#c8e6c9' : '#eee'),
            borderRadius: '10px', marginBottom: '16px', cursor: 'pointer'
          }} onClick={() => setForm({ ...form, is_saleable: !form.is_saleable })}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>Show in Customer Portal</p>
              <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Customers can order this product</p>
            </div>
            <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: form.is_saleable ? '#1a7a4a' : '#ddd', position: 'relative' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: form.is_saleable ? '23px' : '3px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          <button onClick={saveProduct} disabled={saving}
            style={{ padding: '12px 24px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            {saving ? 'Saving...' : editProduct ? '✓ Update' : '✓ Add Product'}
          </button>
        </div>
      )}

      {['trading', 'finished_good', 'raw_material'].map(type => {
        const typeProducts = products.filter(p => p.product_type === type)
        if (typeProducts.length === 0) return null
        const typeLabel = type === 'trading' ? '🛒 Trading Items' : type === 'finished_good' ? '✅ Finished Goods' : '🧪 Raw Materials'
        return (
          <div key={type} style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{typeLabel}</p>
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Name', 'Stock', 'Opening', 'Sale Price', 'Purchase Price', 'In Portal', 'Action'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {typeProducts.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '600' }}>{p.name}</td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '700', color: p.current_stock < 10 ? '#f44336' : '#0f4c81' }}>
                        {Number(p.current_stock).toLocaleString()} pcs
                        {p.name === 'Shrinking Paper' && p.current_stock_kg > 0 && (
                          <span style={{ fontSize: '11px', color: '#888', display: 'block' }}>{Number(p.current_stock_kg).toFixed(2)} kg</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#888' }}>
                        {Number(p.opening_stock || 0).toLocaleString()} pcs
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', color: '#1a7a4a', fontWeight: '600' }}>
                        {p.sale_price > 0 ? 'Rs. ' + Number(p.sale_price).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', color: '#555' }}>
                        {p.purchase_price > 0 ? 'Rs. ' + Number(p.purchase_price).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                          background: p.is_saleable ? '#e8f5e9' : '#f5f5f5',
                          color: p.is_saleable ? '#2e7d32' : '#888'
                        }}>{p.is_saleable ? '✅ Yes' : 'No'}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => openEditForm(p)}
                          style={{ padding: '5px 10px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginRight: '4px' }}>
                          ✏️ Edit
                        </button>
                        {p.product_type === 'finished_good' && (
                          <button onClick={() => setManageBom(p)}
                            style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                            🧪 BOM
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
// ─── BOM EDITOR ────────────────────────────────────────────────────
function BOMEditor({ product, products, tenantId, onClose }) {
  const [bom, setBom] = useState([])
  const [loading, setLoading] = useState(true)
  const [addRawMaterial, setAddRawMaterial] = useState('')
  const [addQty, setAddQty] = useState('')
  const [saving, setSaving] = useState(false)

  const rawMaterials = products.filter(p => p.product_type === 'raw_material')

  useEffect(() => { fetchBom() }, [])

  async function fetchBom() {
    setLoading(true)
    const { data } = await supabase.from('bill_of_materials')
      .select('*, raw_material:raw_material_id(*)')
      .eq('tenant_id', tenantId)
      .eq('finished_good_id', product.id)
    setBom(data || [])
    setLoading(false)
  }

  async function addBomItem() {
    if (!addRawMaterial) return alert('Select a raw material')
    if (!addQty || Number(addQty) <= 0) return alert('Enter quantity per unit')
    setSaving(true)
    const { error } = await supabase.from('bill_of_materials').insert([{
      tenant_id: tenantId,
      finished_good_id: product.id,
      raw_material_id: addRawMaterial,
      quantity_required: Number(addQty),
      unit: 'pcs'
    }])
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    setAddRawMaterial('')
    setAddQty('')
    fetchBom()
    setSaving(false)
  }

  async function deleteBomItem(id) {
    if (!window.confirm('Remove this item from BOM?')) return
    await supabase.from('bill_of_materials').delete().eq('id', id)
    fetchBom()
  }

  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e8f5e9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h4 style={{ margin: '0 0 4px', color: '#1a7a4a', fontSize: '15px' }}>🧪 Bill of Materials — {product.name}</h4>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Define raw materials needed to produce 1 unit</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
      </div>

      {loading ? (
        <p style={{ color: '#888', fontSize: '13px' }}>Loading...</p>
      ) : bom.length === 0 ? (
        <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '16px', textAlign: 'center', marginBottom: '16px' }}>
          <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>No raw materials defined yet. Add below.</p>
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>Current BOM (per 1 unit)</p>
          {bom.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '6px' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{item.raw_material?.name}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                  Stock: {Number(item.raw_material?.current_stock || 0).toLocaleString()} pcs available
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>
                  {item.quantity_required} pcs per unit
                </span>
                <button onClick={() => deleteBomItem(item.id)}
                  style={{ padding: '4px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                  ✕ Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px' }}>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', marginBottom: '10px' }}>+ Add Raw Material</p>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Raw Material</label>
            <select value={addRawMaterial} onChange={e => setAddRawMaterial(e.target.value)} style={inp}>
              <option value="">-- Select --</option>
              {rawMaterials.map(p => (
                <option key={p.id} value={p.id}>{p.name} (Stock: {Number(p.current_stock).toLocaleString()})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Qty per Unit</label>
            <input type="number" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="1" style={inp} />
          </div>
          <button onClick={addBomItem} disabled={saving}
            style={{ padding: '10px 16px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
            {saving ? '...' : '+ Add'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── STOCK HISTORY ─────────────────────────────────────────────────
function StockHistory({ products, tenantId }) {
  const [purchases, setPurchases] = useState([])
  const [productions, setProductions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('purchases')
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { if (tenantId) fetchHistory() }, [dateFrom, dateTo, tenantId])

  async function fetchHistory() {
    setLoading(true)

    const { data: purchasesData } = await supabase
      .from('stock_purchases').select('*, product:product_id(name)')
      .eq('tenant_id', tenantId)
      .gte('purchase_date', dateFrom).lte('purchase_date', dateTo)
      .order('purchase_date', { ascending: false })
    setPurchases(purchasesData || [])

    const { data: productionsData } = await supabase
      .from('production_entries')
      .select('*, product:finished_good_id(name), consumption:production_consumption(*, raw_material:raw_material_id(name))')
      .eq('tenant_id', tenantId)
      .gte('production_date', dateFrom).lte('production_date', dateTo)
      .order('production_date', { ascending: false })
    setProductions(productionsData || [])

    setLoading(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📋 Stock History</h3>

      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { key: 'purchases', label: `📥 Purchases (${purchases.length})` },
          { key: 'productions', label: `🏭 Productions (${productions.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: activeTab === t.key ? '#0f4c81' : '#f0f0f0',
              color: activeTab === t.key ? 'white' : '#555',
              fontWeight: activeTab === t.key ? '700' : '400', fontSize: '13px'
            }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : activeTab === 'purchases' ? (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {purchases.length === 0 ? (
            <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No purchases for this period.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  {['Date', 'Product', 'Quantity', 'Price/Unit', 'Total Cost', 'Paid From', 'Supplier'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#555' }}>{new Date(p.purchase_date).toLocaleDateString('en-PK')}</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '600' }}>{p.product?.name}</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px' }}>
                      {Number(p.quantity).toLocaleString()} pcs
                      {p.quantity_kg > 0 && <span style={{ fontSize: '11px', color: '#888', display: 'block' }}>{p.quantity_kg} kg × {p.pieces_per_kg} pcs/kg</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px' }}>Rs. {Number(p.purchase_price).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>Rs. {Number(p.total_cost).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', fontSize: '12px' }}>
  <span style={{ fontSize: '11px', background: '#f0f0f0', color: '#555', padding: '2px 8px', borderRadius: '6px' }}>
    {p.payment_method === 'jazzcash' ? '📱 JazzCash' : p.payment_method === 'bank' ? '🏦 Bank' : '💵 Cash'}
  </span>
</td>
<td style={{ padding: '10px 14px', fontSize: '12px', color: '#888' }}>{p.supplier || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {productions.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ color: '#888' }}>No production entries for this period.</p>
            </div>
          ) : productions.map(p => (
            <div key={p.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>
                    🏭 {p.product?.name} × {p.quantity_produced} units
                  </p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{new Date(p.production_date).toLocaleDateString('en-PK')}</p>
                </div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: 0 }}>
                  Overhead: Rs. {Number(p.total_overhead).toLocaleString()}
                </p>
              </div>
              {p.consumption && p.consumption.length > 0 && (
                <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: '700', color: '#555', margin: '0 0 6px' }}>Raw Materials Consumed:</p>
                  {p.consumption.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ fontSize: '12px', color: '#555' }}>{c.raw_material?.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#f44336' }}>−{Number(c.quantity_consumed).toLocaleString()} pcs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}