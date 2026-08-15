import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'

const RIDER_COLORS = [
  '#0f4c81', '#1a7a4a', '#7c3aed', '#c62828', '#b45309',
  '#0891b2', '#be185d', '#047857', '#6d28d9', '#b91c1c'
]

const MAP_STYLES = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

function timeSince(dateStr) {
  if (!dateStr) return '—'
  const mins = Math.floor((Date.now() - new Date(dateStr)) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

function getRiderStatusColor(updatedAt) {
  const mins = (Date.now() - new Date(updatedAt)) / 60000
  if (mins < 5) return '#1a7a4a'
  if (mins < 15) return '#f59e0b'
  return '#c62828'
}

export default function RiderTrackingMap({ tenantId }) {
  const [mapMode, setMapMode]             = useState('live') // 'live' | 'customers'
  const [riders, setRiders]               = useState([])
  const [orders, setOrders]               = useState([])
  const [deliveries, setDeliveries]       = useState([])
  const [customers, setCustomers]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [customersLoading, setCustomersLoading] = useState(false)
  const [lastUpdate, setLastUpdate]       = useState(null)
  const [selectedRider, setSelectedRider] = useState(null)
  const [isMobile, setIsMobile]           = useState(window.innerWidth < 768)
  const [showPanel, setShowPanel]         = useState(true)
  const [mapsReady, setMapsReady]         = useState(!!window.google?.maps)
  const [mapError, setMapError]           = useState(null)
  const [mapInitTries, setMapInitTries]   = useState(0)

  const mapDivRef            = useRef(null)
  const mapInstanceRef       = useRef(null)
  const markersRef           = useRef({})
  const stopMarkersRef       = useRef([])
  const routeLinesRef        = useRef([])
  const customerMarkersRef   = useRef([])
  const infoWindowRef        = useRef(null)
  const directionsServiceRef = useRef(null)
  const realtimeChannelRef   = useRef(null)
  const boundsSetRef         = useRef(false)
  const selectedRiderRef     = useRef(null)
  const mapModeRef           = useRef('live')

  useEffect(() => { selectedRiderRef.current = selectedRider }, [selectedRider])
  useEffect(() => { mapModeRef.current = mapMode }, [mapMode])

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return }
    const interval = setInterval(() => {
      if (window.google?.maps) { setMapsReady(true); clearInterval(interval) }
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // ── Data fetch ───────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

      const [{ data: locations }, { data: riderData }, { data: todayOrders }, { data: completedDeliveries }] =
        await Promise.all([
          supabase.from('rider_locations').select('*')
            .eq('tenant_id', tenantId).gte('updated_at', twoHoursAgo).eq('is_active', true),
          supabase.from('riders').select('id, full_name')
            .eq('tenant_id', tenantId).eq('is_active', true),
          supabase.from('orders')
            .select('*, customers(full_name, address, latitude, longitude)')
            .eq('tenant_id', tenantId).eq('delivery_date', today)
            .in('status', ['assigned', 'completed']),
          supabase.from('deliveries')
            .select('id, customer_id, rider_id, delivered_at, qty_19l, delivery_lat, delivery_lng, customers(full_name)')
            .eq('tenant_id', tenantId).gte('delivered_at', today + 'T00:00:00').eq('is_voided', false),
        ])

      const riderMap = {}
      ;(riderData || []).forEach((r, i) => {
        riderMap[r.id] = { ...r, color: RIDER_COLORS[i % RIDER_COLORS.length] }
      })

      const enrichedLocations = (locations || []).map(l => ({
        ...l,
        riderInfo: riderMap[l.rider_id] || { full_name: 'Unknown', color: '#888' }
      }))

      setRiders(enrichedLocations)
      setOrders(todayOrders || [])
      setDeliveries(completedDeliveries || [])
      setLastUpdate(new Date())
      setLoading(false)
    } catch (err) {
      console.error('Tracking fetch error:', err)
      setLoading(false)
      setLastUpdate(new Date())
    }
  }, [tenantId])

  const fetchCustomers = useCallback(async () => {
    setCustomersLoading(true)
    try {
      const { data } = await supabase.from('customers')
        .select('id, full_name, address, latitude, longitude, balance, mobile, our_bottles_placed, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
      setCustomers(data || [])
    } catch (err) {
      console.error('Customer fetch error:', err)
    }
    setCustomersLoading(false)
  }, [tenantId])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current)
    const channel = supabase
      .channel(`rider_locations_${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'rider_locations',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchAll())
      .subscribe()
    realtimeChannelRef.current = channel
    return () => supabase.removeChannel(channel)
  }, [tenantId, fetchAll])

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || mapInstanceRef.current) return
    if (!mapDivRef.current) return
    try {
      const map = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: 31.5204, lng: 74.3587 },
        zoom: 12,
        styles: MAP_STYLES,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
      })
      map.addListener('click', () => {
        if (infoWindowRef.current) infoWindowRef.current.close()
      })
      mapInstanceRef.current = map
      directionsServiceRef.current = new window.google.maps.DirectionsService()
      infoWindowRef.current = new window.google.maps.InfoWindow()
    } catch (err) {
      setMapError(err.message)
    }
  }, [mapsReady, mapInitTries])

  // ── Update map when data/mode changes ────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || loading) return
    if (mapMode === 'live') {
      clearCustomerMarkers()
      updateLiveMap()
    } else {
      clearLiveMarkers()
      updateCustomerMap()
    }
  }, [riders, orders, deliveries, customers, selectedRider, loading, mapMode])

  // Switch mode
  function switchMode(mode) {
    setMapMode(mode)
    boundsSetRef.current = false
    if (infoWindowRef.current) infoWindowRef.current.close()
    if (mode === 'customers' && customers.length === 0) {
      fetchCustomers()
    }
  }

  function clearCustomerMarkers() {
    customerMarkersRef.current.forEach(m => m.setMap(null))
    customerMarkersRef.current = []
  }

  function clearLiveMarkers() {
    stopMarkersRef.current.forEach(m => m.setMap(null))
    stopMarkersRef.current = []
    routeLinesRef.current.forEach(l => l.setMap(null))
    routeLinesRef.current = []
    Object.values(markersRef.current).forEach(m => m.setMap(null))
    markersRef.current = {}
  }

  // ── Live tracking map update ──────────────────────────────────────────────
  function updateLiveMap() {
    const map = mapInstanceRef.current
    if (!map) return
    const G = window.google.maps
    const visibleRiders = selectedRiderRef.current
      ? riders.filter(r => r.rider_id === selectedRiderRef.current)
      : riders

    stopMarkersRef.current.forEach(m => m.setMap(null))
    stopMarkersRef.current = []
    routeLinesRef.current.forEach(l => l.setMap(null))
    routeLinesRef.current = []

    visibleRiders.forEach(rider => {
      const color = rider.riderInfo?.color || '#0f4c81'
      const riderOrders = orders.filter(o => o.rider_id === rider.rider_id)
      const riderDeliveries = deliveries.filter(d => d.rider_id === rider.rider_id)
      const deliveredIds = new Set(riderDeliveries.map(d => d.customer_id))
      const routePoints = []

      riderOrders.forEach((order, idx) => {
        const lat = parseFloat(order.customers?.latitude)
        const lng = parseFloat(order.customers?.longitude)
        if (!lat || !lng) return

        const isDone = order.status === 'completed' || deliveredIds.has(order.customer_id)
        const name = order.customers?.full_name || 'Customer'
        const deliveryTime = riderDeliveries.find(d => d.customer_id === order.customer_id)?.delivered_at
        routePoints.push({ lat, lng })

        const stopIcon = {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="120" height="36">
              <rect x="0" y="0" width="120" height="28" rx="5" fill="${isDone ? '#1a7a4a' : color}" stroke="white" stroke-width="2"/>
              <text x="60" y="18" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="white" text-anchor="middle">${isDone ? '✅' : '⏳' + (idx + 1)} ${name.length > 10 ? name.slice(0, 10) + '…' : name}</text>
              <polygon points="55,28 65,28 60,36" fill="${isDone ? '#1a7a4a' : color}"/>
            </svg>
          `)}`,
          scaledSize: new G.Size(120, 36),
          anchor: new G.Point(60, 36),
        }

        const marker = new G.Marker({ position: { lat, lng }, map, icon: stopIcon, zIndex: 10 })
        marker.addListener('click', () => {
          infoWindowRef.current.setContent(`
            <div style="font-family:system-ui,sans-serif;min-width:180px;padding:4px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                <span style="font-size:18px">${isDone ? '✅' : '⏳'}</span>
                <strong style="font-size:14px;color:#1a1a2e">${name}</strong>
              </div>
              ${order.customers?.address ? `<p style="font-size:11px;color:#888;margin:0 0 4px">📍 ${order.customers.address}</p>` : ''}
              <p style="font-size:11px;color:#555;margin:0 0 4px">🍶 ${[order.qty_19l > 0 && `19L×${order.qty_19l}`, order.qty_half_litre > 0 && `½L×${order.qty_half_litre}`].filter(Boolean).join(' · ')}</p>
              <p style="font-size:11px;margin:0 0 4px;font-weight:700;color:${isDone ? '#1a7a4a' : color}">
                ${isDone ? `✅ Delivered${deliveryTime ? ` at ${new Date(deliveryTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}` : ''}` : '⏳ Pending'}
              </p>
              <p style="font-size:10px;color:#aaa;margin:0">🚴 ${rider.riderInfo?.full_name}</p>
            </div>
          `)
          infoWindowRef.current.open(map, marker)
        })
        stopMarkersRef.current.push(marker)
      })

      if (routePoints.length > 1 && directionsServiceRef.current) {
        const waypts = routePoints.slice(1, -1).map(p => ({ location: p, stopover: false }))
        directionsServiceRef.current.route({
          origin: routePoints[0],
          destination: routePoints[routePoints.length - 1],
          waypoints: waypts,
          travelMode: G.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && result.routes[0]) {
            const path = []
            result.routes[0].legs.forEach(leg => leg.steps.forEach(step => step.path.forEach(p => path.push({ lat: p.lat(), lng: p.lng() }))))
            routeLinesRef.current.push(new G.Polyline({ path, map, strokeColor: color, strokeWeight: 4, strokeOpacity: 0.7, geodesic: true }))
          } else {
            routeLinesRef.current.push(new G.Polyline({ path: routePoints, map, strokeColor: color, strokeWeight: 3, strokeOpacity: 0.5, geodesic: true }))
          }
        })
      }
    })

    // Rider pins
    visibleRiders.forEach(rider => {
      const color = rider.riderInfo?.color || '#0f4c81'
      const statusColor = getRiderStatusColor(rider.updated_at)
      const name = rider.riderInfo?.full_name || 'Rider'
      const initial = name[0]?.toUpperCase() || '?'
      const riderOrders = orders.filter(o => o.rider_id === rider.rider_id)
      const riderDeliveries = deliveries.filter(d => d.rider_id === rider.rider_id)
      const deliveredIds = new Set(riderDeliveries.map(d => d.customer_id))
      const completed = riderOrders.filter(o => o.status === 'completed' || deliveredIds.has(o.customer_id)).length
      const total = riderOrders.length
      const progress = total > 0 ? Math.round(completed / total * 100) : 0

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="68">
        <circle cx="40" cy="24" r="22" fill="${color}" stroke="white" stroke-width="3"/>
        <text x="40" y="30" font-family="system-ui,sans-serif" font-size="18" font-weight="900" fill="white" text-anchor="middle">${initial}</text>
        <circle cx="56" cy="6" r="7" fill="${statusColor}" stroke="white" stroke-width="2"/>
        <rect x="5" y="48" width="70" height="16" rx="4" fill="${color}"/>
        <text x="40" y="59" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="white" text-anchor="middle">🚴 ${name.length > 9 ? name.slice(0,9)+'…' : name}</text>
        <polygon points="35,46 45,46 40,54" fill="${color}"/>
      </svg>`

      const icon = {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new window.google.maps.Size(80, 68),
        anchor: new window.google.maps.Point(40, 68),
      }

      const popupContent = `
        <div style="font-family:system-ui,sans-serif;min-width:200px;padding:4px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #eee">
            <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:15px">${initial}</div>
            <div>
              <p style="font-weight:700;font-size:14px;margin:0;color:#1a1a2e">🚴 ${name}</p>
              <p style="font-size:10px;color:#888;margin:0">Updated: ${timeSince(rider.updated_at)}</p>
            </div>
          </div>
          <div style="background:#f0f9ff;border-radius:6px;padding:8px;margin-bottom:8px">
            <p style="font-size:11px;color:#0f4c81;font-weight:700;margin:0 0 4px">📊 ${completed}/${total} orders (${progress}%)</p>
            <div style="height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${progress}%;background:${progress===100?'#1a7a4a':'#0f4c81'};border-radius:3px"></div>
            </div>
          </div>
          <a href="https://www.google.com/maps?q=${rider.latitude},${rider.longitude}" target="_blank"
            style="display:block;padding:6px;background:#0f4c81;color:white;border-radius:6px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">
            📍 Open in Google Maps
          </a>
        </div>
      `

      if (markersRef.current[rider.rider_id]) {
        markersRef.current[rider.rider_id].setPosition({ lat: rider.latitude, lng: rider.longitude })
        markersRef.current[rider.rider_id].setIcon(icon)
        markersRef.current[rider.rider_id]._infoContent = popupContent
      } else {
        const marker = new window.google.maps.Marker({
          position: { lat: rider.latitude, lng: rider.longitude },
          map, icon, zIndex: 1000,
        })
        marker._infoContent = popupContent
        marker.addListener('click', () => {
          infoWindowRef.current.setContent(marker._infoContent)
          infoWindowRef.current.open(map, marker)
        })
        markersRef.current[rider.rider_id] = marker
      }
    })

    Object.keys(markersRef.current).forEach(id => {
      if (!visibleRiders.find(r => r.rider_id === id)) {
        markersRef.current[id].setMap(null)
        delete markersRef.current[id]
      }
    })

    if (!boundsSetRef.current && visibleRiders.length > 0) {
      const bounds = new window.google.maps.LatLngBounds()
      visibleRiders.forEach(r => bounds.extend({ lat: r.latitude, lng: r.longitude }))
      orders.forEach(o => {
        if (o.customers?.latitude) bounds.extend({ lat: parseFloat(o.customers.latitude), lng: parseFloat(o.customers.longitude) })
      })
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60 })
        window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
          if (map.getZoom() > 14) map.setZoom(14)
        })
      }
      boundsSetRef.current = true
    }
  }

  // ── Customer map update ───────────────────────────────────────────────────
  function updateCustomerMap() {
    const map = mapInstanceRef.current
    if (!map || customers.length === 0) return
    const G = window.google.maps

    customerMarkersRef.current.forEach(m => m.setMap(null))
    customerMarkersRef.current = []

    const today = new Date().toISOString().split('T')[0]
    const deliveredCustomerIds = new Set(deliveries.map(d => d.customer_id))
    const assignedOrders = orders.filter(o => o.delivery_date === today)
    const assignedCustomerIds = new Set(assignedOrders.map(o => o.customer_id))

    const bounds = new G.LatLngBounds()
    let hasPoints = false

    customers.forEach(customer => {
      const lat = parseFloat(customer.latitude)
      const lng = parseFloat(customer.longitude)
      if (!lat || !lng) return

      const isDelivered = deliveredCustomerIds.has(customer.id)
      const isAssigned = assignedCustomerIds.has(customer.id)

      // Color logic
      let pinColor = '#0f4c81'   // default blue
      let statusEmoji = '📍'
      if (isDelivered) { pinColor = '#1a7a4a'; statusEmoji = '✅' }
      else if (isAssigned) { pinColor = '#f59e0b'; statusEmoji = '⏳' }

      const name = customer.full_name || 'Customer'
      const balance = Number(customer.balance || 0)

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="38">
        <rect x="0" y="0" width="110" height="28" rx="6" fill="${pinColor}" stroke="white" stroke-width="2"/>
        <text x="55" y="18" font-family="system-ui,sans-serif" font-size="10" font-weight="700" fill="white" text-anchor="middle">${statusEmoji} ${name.length > 11 ? name.slice(0,11)+'…' : name}</text>
        <polygon points="50,28 60,28 55,38" fill="${pinColor}"/>
      </svg>`

      const icon = {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new G.Size(110, 38),
        anchor: new G.Point(55, 38),
      }

      const assignedOrder = assignedOrders.find(o => o.customer_id === customer.id)
      const popupContent = `
        <div style="font-family:system-ui,sans-serif;min-width:190px;padding:4px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #eee">
            <span style="font-size:20px">${isDelivered ? '✅' : isAssigned ? '⏳' : '📍'}</span>
            <div>
              <p style="font-weight:700;font-size:14px;margin:0;color:#1a1a2e">${name}</p>
              <p style="font-size:10px;color:#888;margin:0">${customer.mobile || ''}</p>
            </div>
          </div>
          ${customer.address ? `<p style="font-size:11px;color:#888;margin:0 0 4px">📍 ${customer.address}</p>` : ''}
          <div style="display:flex;gap:8px;margin-bottom:6px">
            <span style="font-size:11px;font-weight:700;color:${balance > 0 ? '#c62828' : balance < 0 ? '#1a7a4a' : '#888'}">
              💰 ${balance > 0 ? `Rs.${balance.toLocaleString()} owed` : balance < 0 ? `Rs.${Math.abs(balance).toLocaleString()} advance` : 'Clear'}
            </span>
          </div>
          ${customer.our_bottles_placed > 0 ? `<p style="font-size:11px;color:#e65100;margin:0 0 4px">🫙 ${customer.our_bottles_placed} our bottles</p>` : ''}
          ${isDelivered ? `<p style="font-size:11px;color:#1a7a4a;font-weight:700;margin:0 0 4px">✅ Delivered today</p>` : ''}
          ${isAssigned && !isDelivered ? `<p style="font-size:11px;color:#f59e0b;font-weight:700;margin:0 0 4px">⏳ Order assigned today — pending</p>` : ''}
          ${assignedOrder ? `<p style="font-size:11px;color:#555;margin:0 0 4px">🍶 ${[assignedOrder.qty_19l > 0 && `19L×${assignedOrder.qty_19l}`, assignedOrder.qty_half_litre > 0 && `½L×${assignedOrder.qty_half_litre}`].filter(Boolean).join(' · ')}</p>` : ''}
          <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank"
            style="display:block;margin-top:6px;padding:5px;background:#0f4c81;color:white;border-radius:5px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">
            📍 Open in Google Maps
          </a>
        </div>
      `

      const marker = new G.Marker({ position: { lat, lng }, map, icon, zIndex: isDelivered ? 30 : isAssigned ? 20 : 10 })
      marker.addListener('click', () => {
        infoWindowRef.current.setContent(popupContent)
        infoWindowRef.current.open(map, marker)
      })
      customerMarkersRef.current.push(marker)
      bounds.extend({ lat, lng })
      hasPoints = true
    })

    if (hasPoints && !boundsSetRef.current) {
      map.fitBounds(bounds, { padding: 40 })
      window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom() > 14) map.setZoom(14)
      })
      boundsSetRef.current = true
    }
  }

  function selectRider(riderId) {
    setSelectedRider(riderId)
    boundsSetRef.current = false
    if (infoWindowRef.current) infoWindowRef.current.close()
    if (riderId && mapInstanceRef.current) {
      const rider = riders.find(r => r.rider_id === riderId)
      if (rider) {
        mapInstanceRef.current.panTo({ lat: rider.latitude, lng: rider.longitude })
        mapInstanceRef.current.setZoom(14)
        boundsSetRef.current = true
      }
    }
  }

  function getRiderStats(riderId) {
    const riderOrders = orders.filter(o => o.rider_id === riderId)
    const riderDeliveries = deliveries.filter(d => d.rider_id === riderId)
    const deliveredIds = new Set(riderDeliveries.map(d => d.customer_id))
    const completed = riderOrders.filter(o => o.status === 'completed' || deliveredIds.has(o.customer_id)).length
    const pending = riderOrders.length - completed
    const total19l = riderOrders.reduce((s, o) => s + (o.qty_19l || 0), 0)
    return { total: riderOrders.length, completed, pending, total19l, deliveredIds, riderDeliveries }
  }

  const visibleRiders = selectedRider ? riders.filter(r => r.rider_id === selectedRider) : riders
  const totalOrders = orders.length
  const totalCompleted = deliveries.filter((d, i, arr) =>
    arr.findIndex(x => x.customer_id === d.customer_id && x.rider_id === d.rider_id) === i
  ).length

  const showMap = !loading && (mapMode === 'live' ? riders.length > 0 : true)

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f4c81, #1a6bad)',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10, borderRadius: '12px 12px 0 0',
      }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: 0 }}>📡 Live Delivery Tracking</p>
          <p style={{ color: '#93c5fd', fontSize: 11, margin: '2px 0 0' }}>
            {lastUpdate ? `Updated ${timeSince(lastUpdate.toISOString())}` : 'Loading...'}
            {' · '}Auto-refresh every 15s · Realtime active
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '5px 12px', fontSize: 12, color: '#fff', fontWeight: 700 }}>
            🚴 {riders.length} Riders
          </div>
          <div style={{ background: 'rgba(52,211,153,0.25)', borderRadius: 20, padding: '5px 12px', fontSize: 12, color: '#6ee7b7', fontWeight: 700 }}>
            ✅ {totalCompleted} Done
          </div>
          <div style={{ background: 'rgba(251,191,36,0.25)', borderRadius: 20, padding: '5px 12px', fontSize: 12, color: '#fde68a', fontWeight: 700 }}>
            ⏳ {totalOrders - totalCompleted} Pending
          </div>
          <button onClick={fetchAll} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            🔄 Refresh
          </button>
          <button onClick={() => setShowPanel(p => !p)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            {showPanel ? '◀ Hide Panel' : '▶ Show Panel'}
          </button>
        </div>
      </div>

      {/* Mode switcher + Rider tabs */}
      <div style={{ background: '#1e3a5f', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => switchMode('live')} style={{
            padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
            background: mapMode === 'live' ? '#0f4c81' : 'rgba(255,255,255,0.1)',
            color: '#fff',
          }}>
            🚴 Live Tracking
          </button>
          <button onClick={() => switchMode('customers')} style={{
            padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
            background: mapMode === 'customers' ? '#1a7a4a' : 'rgba(255,255,255,0.1)',
            color: '#fff',
          }}>
            👥 Customer Map {customers.length > 0 ? `(${customers.length})` : ''}
          </button>
          {mapMode === 'customers' && (
            <button onClick={() => { boundsSetRef.current = false; fetchCustomers() }} style={{
              padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: 'rgba(255,255,255,0.1)', color: '#fff',
            }}>
              🔄
            </button>
          )}
        </div>

        {/* Rider filter tabs — only in live mode */}
        {mapMode === 'live' && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <button onClick={() => selectRider(null)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
              background: !selectedRider ? '#0f4c81' : 'rgba(255,255,255,0.1)',
              color: !selectedRider ? '#fff' : '#93c5fd',
            }}>
              🗺️ All Riders
            </button>
            {riders.map(r => {
              const stats = getRiderStats(r.rider_id)
              const color = r.riderInfo?.color || '#0f4c81'
              return (
                <button key={r.rider_id} onClick={() => selectRider(r.rider_id === selectedRider ? null : r.rider_id)} style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `2px solid ${selectedRider === r.rider_id ? color : 'transparent'}`,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                  background: selectedRider === r.rider_id ? color : 'rgba(255,255,255,0.1)',
                  color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: getRiderStatusColor(r.updated_at), display: 'inline-block', flexShrink: 0 }} />
                  🚴 {r.riderInfo?.full_name}
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
                    {stats.completed}/{stats.total}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Customer map legend */}
        {mapMode === 'customers' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0f4c81', display: 'inline-block' }} />Regular
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />Assigned today
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1a7a4a', display: 'inline-block' }} />Delivered today
            </span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', height: isMobile ? 'auto' : 580, background: 'white', borderRadius: '0 0 12px 12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', minHeight: isMobile ? 400 : 'auto' }}>
          {/* Map always rendered so it can initialize */}
          <div ref={mapDivRef} style={{ height: '100%', minHeight: isMobile ? 400 : 580, width: '100%' }} />

          {/* Overlays */}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc', zIndex: 5 }}>
              <div style={{ fontSize: 40 }}>📡</div>
              <p style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>Loading live tracking...</p>
            </div>
          )}
          {!loading && mapMode === 'live' && riders.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc', zIndex: 5 }}>
              <div style={{ fontSize: 56 }}>🚴</div>
              <p style={{ color: '#555', fontSize: 15, fontWeight: 700 }}>No active riders</p>
              <p style={{ color: '#888', fontSize: 13, textAlign: 'center', maxWidth: 260 }}>Riders appear here when they open the delivery app and allow location</p>
            </div>
          )}
          {!loading && mapMode === 'customers' && customersLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc', zIndex: 5 }}>
              <div style={{ fontSize: 40 }}>👥</div>
              <p style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>Loading customer locations...</p>
            </div>
          )}
          {mapError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#fff5f5', padding: 20, zIndex: 5 }}>
              <p style={{ fontSize: 30 }}>⚠️</p>
              <p style={{ color: '#c62828', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>Map Error: {mapError}</p>
              <button onClick={() => { setMapError(null); setMapInitTries(t => t + 1) }}
                style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                🔄 Retry
              </button>
            </div>
          )}

          {/* Live map legend */}
          {!loading && mapMode === 'live' && riders.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 10, left: 10,
              background: 'rgba(255,255,255,0.95)', borderRadius: 8,
              padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 10, fontSize: 10,
            }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a7a4a', display: 'inline-block' }} />Active</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />Recent</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c62828', display: 'inline-block' }} />Inactive</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>✅ Delivered</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>⏳ Pending</span>
              </div>
            </div>
          )}

          {/* Customer map count */}
          {!loading && mapMode === 'customers' && customers.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 10, left: 10,
              background: 'rgba(255,255,255,0.95)', borderRadius: 8,
              padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 10, fontSize: 11, fontWeight: 700, color: '#0f4c81',
            }}>
              👥 {customers.length} customers on map
            </div>
          )}
        </div>

        {/* Side Panel — live mode only */}
        {showPanel && mapMode === 'live' && (
          <div style={{
            width: isMobile ? '100%' : 300, borderLeft: '1px solid #e0e0e0',
            overflowY: 'auto', background: '#f8fafc',
            maxHeight: isMobile ? 400 : 'auto',
          }}>
            {(selectedRider ? riders.filter(r => r.rider_id === selectedRider) : riders).map(rider => {
              const stats = getRiderStats(rider.rider_id)
              const color = rider.riderInfo?.color || '#0f4c81'
              const progress = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0
              const riderOrders = orders.filter(o => o.rider_id === rider.rider_id)

              return (
                <div key={rider.rider_id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <div style={{ background: color, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {rider.riderInfo?.full_name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>🚴 {rider.riderInfo?.full_name}</p>
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, margin: 0 }}>{timeSince(rider.updated_at)}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ color: '#fff', fontWeight: 800, fontSize: 18, margin: 0, lineHeight: 1 }}>{progress}%</p>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, margin: 0 }}>{stats.completed}/{stats.total}</p>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'white', borderRadius: 3, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>✅ {stats.completed} done</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>⏳ {stats.pending} pending</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>🍶 {stats.total19l} bottles</span>
                    </div>
                  </div>

                  {(() => {
                    const nextPending = riderOrders.filter(o => !stats.deliveredIds.has(o.customer_id) && o.status !== 'completed').slice(0, 4)
                    if (nextPending.length === 0) return null
                    return (
                      <div style={{ background: '#fff8e1', borderBottom: '1px solid #fde68a', padding: '8px 14px' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#b45309', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>⏭ Next Stops</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {nextPending.map((o, i) => (
                            <div key={o.id} style={{ background: 'white', border: '1.5px solid #fde68a', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ background: '#b45309', color: 'white', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>{i + 1}</span>
                              {(o.customers?.full_name || 'Customer').slice(0, 14)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  <div>
                    {riderOrders.length === 0 ? (
                      <p style={{ padding: '12px 14px', fontSize: 12, color: '#aaa', textAlign: 'center', margin: 0 }}>No orders assigned today</p>
                    ) : (
                      riderOrders.map((order, idx) => {
                        const isDone = order.status === 'completed' || stats.deliveredIds.has(order.customer_id)
                        const delivery = stats.riderDeliveries.find(d => d.customer_id === order.customer_id)
                        return (
                          <div key={order.id} style={{
                            padding: '10px 14px', borderBottom: '1px solid #f0f0f0',
                            background: isDone ? '#f0fff4' : 'white',
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                          }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                              background: isDone ? '#1a7a4a' : color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: 10, fontWeight: 800, marginTop: 1,
                            }}>{isDone ? '✓' : idx + 1}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 1px', color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {order.customers?.full_name || 'Customer'}
                              </p>
                              {order.customers?.address && (
                                <p style={{ fontSize: 10, color: '#888', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  📍 {order.customers.address}
                                </p>
                              )}
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, color: '#555' }}>
                                  {[order.qty_19l > 0 && `19L×${order.qty_19l}`, order.qty_half_litre > 0 && `½L×${order.qty_half_litre}`].filter(Boolean).join(' · ')}
                                </span>
                                {isDone && delivery?.delivered_at && (
                                  <span style={{ fontSize: 10, color: '#1a7a4a', fontWeight: 600 }}>
                                    ✅ {new Date(delivery.delivered_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                                {!isDone && <span style={{ fontSize: 10, color: '#e65100', fontWeight: 600 }}>⏳ Pending</span>}
                              </div>
                            </div>
                            {order.customers?.latitude && (
                              <a href={`https://www.google.com/maps?q=${order.customers.latitude},${order.customers.longitude}`}
                                target="_blank" rel="noreferrer"
                                style={{ color: '#0f4c81', fontSize: 14, flexShrink: 0, textDecoration: 'none' }}>
                                📍
                              </a>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}

            {riders.length === 0 && !loading && (
              <div style={{ padding: 30, textAlign: 'center' }}>
                <p style={{ fontSize: 30, marginBottom: 8 }}>🚴</p>
                <p style={{ color: '#888', fontSize: 13 }}>No riders active</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
