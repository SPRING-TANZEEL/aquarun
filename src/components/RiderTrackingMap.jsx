import { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Polyline, OverlayView } from '@react-google-maps/api'
import { supabase } from '../supabase'

// ── Constants ────────────────────────────────────────────────────────────────
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
const LIBRARIES = ['geometry', 'directions']
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY

const RIDER_COLORS = [
  '#0f4c81', '#1a7a4a', '#7c3aed', '#c62828', '#b45309',
  '#0891b2', '#be185d', '#047857', '#6d28d9', '#b91c1c'
]

const MAP_STYLES = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// Build road-following route using Google Directions API
async function buildRoadRoute(origin, waypoints, directionsService) {
  if (!directionsService || waypoints.length === 0) return null
  try {
    const wayptObjs = waypoints.slice(0, -1).map(p => ({
      location: new window.google.maps.LatLng(p[0], p[1]),
      stopover: false,
    }))
    const dest = waypoints[waypoints.length - 1]
    return await new Promise((resolve) => {
      directionsService.route({
        origin: new window.google.maps.LatLng(origin[0], origin[1]),
        destination: new window.google.maps.LatLng(dest[0], dest[1]),
        waypoints: wayptObjs,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      }, (result, status) => {
        if (status === 'OK') resolve(result)
        else resolve(null)
      })
    })
  } catch {
    return null
  }
}

// Decode polyline path from Directions result into array of {lat,lng}
function decodeDirectionsPath(result) {
  if (!result?.routes?.[0]) return []
  const path = []
  result.routes[0].legs.forEach(leg => {
    leg.steps.forEach(step => {
      step.path.forEach(p => path.push({ lat: p.lat(), lng: p.lng() }))
    })
  })
  return path
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function RiderTrackingMap({ tenantId }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
    version: 'weekly',
  })

  const [riders, setRiders]               = useState([])
  const [orders, setOrders]               = useState([])
  const [deliveries, setDeliveries]       = useState([])
  const [loading, setLoading]             = useState(true)
  const [lastUpdate, setLastUpdate]       = useState(null)
  const [selectedRider, setSelectedRider] = useState(null)
  const [activeInfoWindow, setActiveInfoWindow] = useState(null) // rider_id
  const [routePaths, setRoutePaths]       = useState({}) // rider_id → [{lat,lng}]
  const [isMobile, setIsMobile]           = useState(window.innerWidth < 768)
  const [showPanel, setShowPanel]         = useState(true)
  const [mapCenter, setMapCenter]         = useState({ lat: 31.5204, lng: 74.3587 }) // Lahore default
  const [mapZoom, setMapZoom]             = useState(12)
  const [boundsSet, setBoundsSet]         = useState(false)

  const mapRef              = useRef(null)
  const directionsServiceRef = useRef(null)
  const realtimeChannelRef  = useRef(null)

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
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

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
    }
    const channel = supabase
      .channel(`rider_locations_${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rider_locations',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        fetchAll()
      })
      .subscribe()

    realtimeChannelRef.current = channel
    return () => supabase.removeChannel(channel)
  }, [tenantId, fetchAll])

  // ── Build road routes when riders/orders change ───────────────────────────
  useEffect(() => {
    if (!isLoaded || !directionsServiceRef.current || riders.length === 0) return

    const visibleRiders = selectedRider
      ? riders.filter(r => r.rider_id === selectedRider)
      : riders

    visibleRiders.forEach(async (rider) => {
      const riderOrders = orders.filter(o => o.rider_id === rider.rider_id)
      const waypoints = riderOrders
        .filter(o => o.customers?.latitude && o.customers?.longitude)
        .map(o => [o.customers.latitude, o.customers.longitude])

      if (waypoints.length < 1) return

      const origin = [rider.latitude, rider.longitude]
      const result = await buildRoadRoute(origin, waypoints, directionsServiceRef.current)
      if (result) {
        const path = decodeDirectionsPath(result)
        setRoutePaths(prev => ({ ...prev, [rider.rider_id]: path }))
      } else {
        // Fallback: straight lines if Directions fails
        const fallback = [
          { lat: rider.latitude, lng: rider.longitude },
          ...waypoints.map(([lat, lng]) => ({ lat, lng }))
        ]
        setRoutePaths(prev => ({ ...prev, [rider.rider_id]: fallback }))
      }
    })
  }, [riders, orders, selectedRider, isLoaded])

  // ── Fit map bounds on first load ──────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || boundsSet || riders.length === 0) return
    const bounds = new window.google.maps.LatLngBounds()
    riders.forEach(r => bounds.extend({ lat: r.latitude, lng: r.longitude }))
    orders.forEach(o => {
      if (o.customers?.latitude) bounds.extend({ lat: o.customers.latitude, lng: o.customers.longitude })
    })
    mapRef.current.fitBounds(bounds, { padding: 60 })
    setBoundsSet(true)
  }, [riders, orders, boundsSet])

  // ── Select rider & zoom ───────────────────────────────────────────────────
  function selectRider(riderId) {
    setSelectedRider(riderId)
    setActiveInfoWindow(null)
    setBoundsSet(false) // re-fit bounds for new selection

    if (riderId && mapRef.current) {
      const rider = riders.find(r => r.rider_id === riderId)
      if (rider) {
        mapRef.current.panTo({ lat: rider.latitude, lng: rider.longitude })
        mapRef.current.setZoom(15)
        setBoundsSet(true)
      }
    }
  }

  // ── Per-rider stats ───────────────────────────────────────────────────────
  function getRiderStats(riderId) {
    const riderOrders = orders.filter(o => o.rider_id === riderId)
    const riderDeliveries = deliveries.filter(d => d.rider_id === riderId)
    const deliveredIds = new Set(riderDeliveries.map(d => d.customer_id))
    const completed = riderOrders.filter(o => o.status === 'completed' || deliveredIds.has(o.customer_id)).length
    const pending = riderOrders.length - completed
    const total19l = riderOrders.reduce((s, o) => s + (o.qty_19l || 0), 0)
    return { total: riderOrders.length, completed, pending, total19l, deliveredIds, riderDeliveries }
  }

  // ── Custom rider pin as SVG overlay ──────────────────────────────────────
  function RiderPin({ rider }) {
    const color = rider.riderInfo?.color || '#0f4c81'
    const statusColor = getRiderStatusColor(rider.updated_at)
    const name = rider.riderInfo?.full_name || 'Rider'
    const initial = name[0]?.toUpperCase() || '?'
    const stats = getRiderStats(rider.rider_id)
    const progress = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0
    const isSelected = activeInfoWindow === rider.rider_id

    return (
      <OverlayView
        position={{ lat: rider.latitude, lng: rider.longitude }}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -h })}
      >
        <div
          onClick={() => setActiveInfoWindow(isSelected ? null : rider.rider_id)}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}
        >
          {/* Bubble */}
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: color, border: '3px solid white',
            boxShadow: `0 4px 12px rgba(0,0,0,0.4)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 900, fontSize: 18,
            fontFamily: 'system-ui,sans-serif', position: 'relative',
            transition: 'transform 0.2s',
            transform: isSelected ? 'scale(1.15)' : 'scale(1)',
          }}>
            {initial}
            {/* Status dot */}
            <div style={{
              position: 'absolute', top: -2, right: -2,
              width: 13, height: 13, borderRadius: '50%',
              background: statusColor, border: '2px solid white',
            }} />
          </div>
          {/* Name tag */}
          <div style={{
            background: color, color: 'white',
            fontSize: 10, fontWeight: 700,
            padding: '2px 7px', borderRadius: 4,
            marginTop: 2, whiteSpace: 'nowrap',
            fontFamily: 'system-ui,sans-serif',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}>
            🚴 {name}
          </div>
          {/* Arrow */}
          <div style={{
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `6px solid ${color}`,
          }} />

          {/* InfoWindow popup */}
          {isSelected && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%',
              transform: 'translateX(-50%) translateY(-8px)',
              background: 'white', borderRadius: 10,
              padding: 14, minWidth: 210,
              boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
              fontFamily: 'system-ui,sans-serif',
              zIndex: 9999,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 15 }}>{initial}</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1a1a2e' }}>🚴 {name}</p>
                  <p style={{ fontSize: 10, color: '#888', margin: 0 }}>Updated: {timeSince(rider.updated_at)}</p>
                </div>
              </div>
              <div style={{ background: '#f0f9ff', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: '#0f4c81', fontWeight: 700, margin: '0 0 4px' }}>📊 {stats.completed}/{stats.total} orders ({progress}%)</p>
                <div style={{ height: 6, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#1a7a4a' : '#0f4c81', borderRadius: 3 }} />
                </div>
              </div>
              <a
                href={`https://www.google.com/maps?q=${rider.latitude},${rider.longitude}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'block', padding: '6px', background: '#0f4c81', color: 'white', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}
              >
                📍 Open in Google Maps
              </a>
            </div>
          )}
        </div>
      </OverlayView>
    )
  }

  // ── Custom stop pin ────────────────────────────────────────────────────────
  function StopPin({ order, rider, index }) {
    const riderDeliveries = deliveries.filter(d => d.rider_id === rider.rider_id)
    const deliveredIds = new Set(riderDeliveries.map(d => d.customer_id))
    const isDone = order.status === 'completed' || deliveredIds.has(order.customer_id)
    const color = rider.riderInfo?.color || '#0f4c81'
    const name = order.customers?.full_name || 'Customer'
    const deliveryTime = riderDeliveries.find(d => d.customer_id === order.customer_id)?.delivered_at
    const [open, setOpen] = useState(false)

    if (!order.customers?.latitude || !order.customers?.longitude) return null

    return (
      <OverlayView
        position={{ lat: order.customers.latitude, lng: order.customers.longitude }}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -h })}
      >
        <div
          onClick={() => setOpen(o => !o)}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}
        >
          <div style={{
            background: isDone ? '#1a7a4a' : color,
            color: 'white', border: '2px solid white',
            borderRadius: 6, padding: '2px 7px',
            fontSize: 10, fontWeight: 700,
            fontFamily: 'system-ui,sans-serif',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {isDone ? '✅' : `⏳${index + 1}`} {name.length > 12 ? name.slice(0, 12) + '…' : name}
          </div>
          <div style={{
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `6px solid ${isDone ? '#1a7a4a' : color}`,
          }} />

          {open && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%',
              transform: 'translateX(-50%) translateY(-6px)',
              background: 'white', borderRadius: 10, padding: 12, minWidth: 190,
              boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
              fontFamily: 'system-ui,sans-serif', zIndex: 9999,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{isDone ? '✅' : '⏳'}</span>
                <strong style={{ fontSize: 13, color: '#1a1a2e' }}>{name}</strong>
              </div>
              {order.customers?.address && (
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>📍 {order.customers.address}</p>
              )}
              <p style={{ fontSize: 11, color: '#555', margin: '0 0 4px' }}>
                🍶 {[order.qty_19l > 0 && `19L×${order.qty_19l}`, order.qty_half_litre > 0 && `½L×${order.qty_half_litre}`].filter(Boolean).join(' · ')}
              </p>
              <p style={{ fontSize: 11, margin: '0 0 6px', fontWeight: 700, color: isDone ? '#1a7a4a' : color }}>
                {isDone
                  ? `✅ Delivered${deliveryTime ? ` at ${new Date(deliveryTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                  : '⏳ Pending'}
              </p>
              <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>🚴 {rider.riderInfo?.full_name}</p>
            </div>
          )}
        </div>
      </OverlayView>
    )
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const visibleRiders = selectedRider ? riders.filter(r => r.rider_id === selectedRider) : riders
  const totalOrders = orders.length
  const totalCompleted = deliveries.filter((d, i, arr) =>
    arr.findIndex(x => x.customer_id === d.customer_id && x.rider_id === d.rider_id) === i
  ).length

  // ── Render guard ──────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui,sans-serif' }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>⚠️</p>
        <p style={{ color: '#c62828', fontWeight: 700 }}>Google Maps failed to load</p>
        <p style={{ color: '#888', fontSize: 13 }}>Check your VITE_GOOGLE_MAPS_KEY in .env</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui,sans-serif' }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>🗺️</p>
        <p style={{ color: '#888', fontSize: 14 }}>Loading Google Maps...</p>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
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

      {/* Rider filter tabs */}
      <div style={{ background: '#1e3a5f', padding: '10px 16px', display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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

      {/* Main content */}
      <div style={{ display: 'flex', height: isMobile ? 'auto' : 580, background: 'white', borderRadius: '0 0 12px 12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', minHeight: isMobile ? 350 : 'auto' }}>
          {loading ? (
            <div style={{ height: '100%', minHeight: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: 40 }}>📡</div>
              <p style={{ color: '#888', fontSize: 14, fontWeight: 600 }}>Loading live tracking...</p>
            </div>
          ) : riders.length === 0 ? (
            <div style={{ height: '100%', minHeight: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: 56 }}>🚴</div>
              <p style={{ color: '#555', fontSize: 15, fontWeight: 700 }}>No active riders</p>
              <p style={{ color: '#888', fontSize: 13, textAlign: 'center', maxWidth: 260 }}>Riders appear here when they open the delivery app and allow location</p>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ height: '100%', width: '100%' }}
              center={mapCenter}
              zoom={mapZoom}
              options={{
                styles: MAP_STYLES,
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_CENTER },
                clickableIcons: false,
              }}
              onLoad={map => {
                mapRef.current = map
                directionsServiceRef.current = new window.google.maps.DirectionsService()
              }}
              onUnmount={() => { mapRef.current = null }}
              onClick={() => setActiveInfoWindow(null)}
            >
              {/* Road-following route lines per rider */}
              {visibleRiders.map(rider => {
                const path = routePaths[rider.rider_id]
                if (!path || path.length < 2) return null
                return (
                  <Polyline
                    key={`route-${rider.rider_id}`}
                    path={path}
                    options={{
                      strokeColor: rider.riderInfo?.color || '#0f4c81',
                      strokeWeight: 4,
                      strokeOpacity: 0.7,
                      geodesic: true,
                    }}
                  />
                )
              })}

              {/* Delivery stop pins */}
              {visibleRiders.map(rider =>
                orders
                  .filter(o => o.rider_id === rider.rider_id)
                  .map((order, idx) => (
                    <StopPin key={`stop-${order.id}`} order={order} rider={rider} index={idx} />
                  ))
              )}

              {/* Rider pins */}
              {visibleRiders.map(rider => (
                <RiderPin key={`rider-${rider.rider_id}`} rider={rider} />
              ))}
            </GoogleMap>
          )}

          {/* Map legend */}
          {!loading && riders.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 10, left: 10,
              background: 'rgba(255,255,255,0.95)', borderRadius: 8,
              padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 10, fontSize: 10,
            }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a7a4a', display: 'inline-block' }} />Active
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />Recent
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c62828', display: 'inline-block' }} />Inactive
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>✅ Delivered</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>⏳ Pending</span>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel — unchanged from original */}
        {showPanel && (
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

                  {/* Rider header */}
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
                    {/* Progress bar */}
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'white', borderRadius: 3, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>✅ {stats.completed} done</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>⏳ {stats.pending} pending</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>🍶 {stats.total19l} bottles</span>
                    </div>
                  </div>

                  {/* Next stops highlight */}
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

                  {/* Order list */}
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
                                {!isDone && (
                                  <span style={{ fontSize: 10, color: '#e65100', fontWeight: 600 }}>⏳ Pending</span>
                                )}
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
