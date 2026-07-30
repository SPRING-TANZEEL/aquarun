import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

export default function RiderTrackingMap({ tenantId }) {
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    // Fix Leaflet z-index issue with sidebars
    if (!document.getElementById('leaflet-zfix')) {
      const style = document.createElement('style')
      style.id = 'leaflet-zfix'
      style.textContent = '.leaflet-pane { z-index: 1 !important; } .leaflet-top, .leaflet-bottom { z-index: 2 !important; }'
      document.head.appendChild(style)
    }
    return () => {}
  }, [])

  useEffect(() => {
    fetchRiderLocations()
    const interval = setInterval(fetchRiderLocations, 10000)
    return () => clearInterval(interval)
  }, [tenantId])

  useEffect(() => {
    if (!mapRef.current) return
    if (riders.length > 0 && !mapInstanceRef.current) {
      initMap()
    } else if (mapInstanceRef.current && riders.length > 0) {
      updateMarkers()
    } else if (mapInstanceRef.current && riders.length === 0) {
      // Clear all markers when no riders
      Object.values(markersRef.current).forEach(({ marker }) => marker.remove())
      markersRef.current = {}
    }
  }, [riders])

  async function fetchRiderLocations() {
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: locations } = await supabase
        .from('rider_locations')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('updated_at', twoHoursAgo)
        .eq('is_active', true)

      if (!locations || locations.length === 0) { setRiders([]); setLoading(false); setLastUpdate(new Date()); return }

      // Fetch rider names separately
      const riderIds = locations.map(l => l.rider_id)
      const { data: riderData } = await supabase
        .from('riders')
        .select('id, full_name, is_active')
        .in('id', riderIds)

      const riderMap = {}
      riderData?.forEach(r => { riderMap[r.id] = r })

      const enriched = locations.map(l => ({
        ...l,
        riders: riderMap[l.rider_id] || { full_name: 'Unknown' }
      }))
      setRiders(enriched)
      setLastUpdate(new Date())
      setLoading(false)
    } catch (err) {
      console.error('Tracking fetch error:', err)
      setLoading(false)
    }
  }

  function getMarkerColor(updatedAt) {
    const mins = (Date.now() - new Date(updatedAt)) / 60000
    if (mins < 5) return '#1a7a4a'   // green — very recent
    if (mins < 15) return '#f59e0b'  // yellow — 5-15 mins
    return '#c62828'                  // red — old
  }

  function createMarkerIcon(L, name, updatedAt) {
    const color = getMarkerColor(updatedAt)
    const initial = name?.[0]?.toUpperCase() || '?'
    const html = `
      <div style="
        width:36px;height:36px;border-radius:50%;
        background:${color};
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:800;font-size:14px;
        font-family:system-ui,sans-serif;
      ">${initial}</div>
      <div style="
        position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:8px solid ${color};
      "></div>
    `
    return L.divIcon({
      html: `<div style="position:relative;width:36px;">${html}</div>`,
      className: '',
      iconSize: [36, 44],
      iconAnchor: [18, 44],
      popupAnchor: [0, -44]
    })
  }

  function timeSince(dateStr) {
    const mins = Math.floor((Date.now() - new Date(dateStr)) / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins} min ago`
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
  }

  async function initMap() {
    const L = await import('leaflet')
    if (mapInstanceRef.current || !mapRef.current || riders.length === 0) return

    const center = [riders[0].latitude, riders[0].longitude]
    const map = L.default.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    })

    L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapInstanceRef.current = map

    riders.forEach(r => {
      const marker = L.default.marker(
        [r.latitude, r.longitude],
        { icon: createMarkerIcon(L.default, r.riders?.full_name, r.updated_at) }
      )
      .addTo(map)
      .bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:160px;">
          <p style="font-weight:700;font-size:14px;margin:0 0 4px;color:#1a1a2e">
            🚴 ${r.riders?.full_name || 'Unknown'}
          </p>
          <p style="font-size:12px;color:#555;margin:0 0 2px">
            📍 ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}
          </p>
          <p style="font-size:11px;color:#888;margin:0">
            🕐 ${timeSince(r.updated_at)}
          </p>
          <a href="https://www.google.com/maps?q=${r.latitude},${r.longitude}" 
            target="_blank"
            style="display:inline-block;margin-top:8px;padding:4px 10px;background:#0f4c81;color:white;border-radius:4px;font-size:11px;text-decoration:none;font-weight:600">
            Open in Google Maps
          </a>
        </div>
      `)
      markersRef.current[r.rider_id] = { marker, L: L.default }
    })

    if (riders.length > 1) {
      const bounds = L.default.latLngBounds(riders.map(r => [r.latitude, r.longitude]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }

  async function updateMarkers() {
    const L = await import('leaflet')
    const map = mapInstanceRef.current
    if (!map) return

    riders.forEach(r => {
      const existing = markersRef.current[r.rider_id]
      if (existing) {
        existing.marker.setLatLng([r.latitude, r.longitude])
        existing.marker.setIcon(createMarkerIcon(L.default, r.riders?.full_name, r.updated_at))
        existing.marker.setPopupContent(`
          <div style="font-family:system-ui,sans-serif;min-width:160px;">
            <p style="font-weight:700;font-size:14px;margin:0 0 4px;color:#1a1a2e">
              🚴 ${r.riders?.full_name || 'Unknown'}
            </p>
            <p style="font-size:12px;color:#555;margin:0 0 2px">
              📍 ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}
            </p>
            <p style="font-size:11px;color:#888;margin:0">
              🕐 ${timeSince(r.updated_at)}
            </p>
            <a href="https://www.google.com/maps?q=${r.latitude},${r.longitude}" 
              target="_blank"
              style="display:inline-block;margin-top:8px;padding:4px 10px;background:#0f4c81;color:white;border-radius:4px;font-size:11px;text-decoration:none;font-weight:600">
              Open in Google Maps
            </a>
          </div>
        `)
      } else {
        const marker = L.default.marker(
          [r.latitude, r.longitude],
          { icon: createMarkerIcon(L.default, r.riders?.full_name, r.updated_at) }
        )
        .addTo(map)
        .bindPopup(`<div>${r.riders?.full_name}</div>`)
        markersRef.current[r.rider_id] = { marker, L: L.default }
      }
    })
  }

  // Legend color meaning
  const legend = [
    { color: '#1a7a4a', label: 'Active (< 5 min)' },
    { color: '#f59e0b', label: 'Recent (5-15 min)' },
    { color: '#c62828', label: 'Inactive (> 15 min)' },
  ]

  return (
    <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e0e0e0' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg, #0f4c81, #1a6bad)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📡 Live Rider Tracking</p>
          <p style={{ color: '#93c5fd', fontSize: 11, margin: '2px 0 0' }}>
            {lastUpdate ? `Last updated: ${timeSince(lastUpdate.toISOString())}` : 'Loading...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
            {riders.length} rider{riders.length !== 1 ? 's' : ''} active
          </span>
          <button onClick={fetchRiderLocations} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Rider list */}
      {riders.length > 0 && (
        <div style={{ padding: '10px 18px', background: '#f8fafc', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {riders.map(r => {
            const color = getMarkerColor(r.updated_at)
            const mins = Math.floor((Date.now() - new Date(r.updated_at)) / 60000)
            return (
              <div key={r.rider_id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: `1.5px solid ${color}22`, borderRadius: 8, padding: '6px 12px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1a1a2e' }}>🚴 {r.riders?.full_name || 'Unknown'}</p>
                  <p style={{ fontSize: 10, color: '#888', margin: 0 }}>{mins < 1 ? 'Just now' : `${mins}m ago`}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Map */}
      {loading ? (
        <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc' }}>
          <div style={{ fontSize: 32 }}>📡</div>
          <p style={{ color: '#888', fontSize: 14 }}>Loading rider locations...</p>
        </div>
      ) : riders.length === 0 ? (
        <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc' }}>
          <div style={{ fontSize: 48 }}>🚴</div>
          <p style={{ color: '#555', fontSize: 15, fontWeight: 600 }}>No active riders</p>
          <p style={{ color: '#888', fontSize: 13 }}>Riders will appear here when they are on delivery</p>
        </div>
      ) : (
        <div ref={mapRef} style={{ height: 450, width: '100%', zIndex: 0, position: 'relative' }} />
      )}

      {/* Legend */}
      <div style={{ padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #e0e0e0', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>LEGEND:</span>
        {legend.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
            <span style={{ fontSize: 11, color: '#555' }}>{l.label}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>Updates every 30 seconds • Click pin for details</span>
      </div>
    </div>
  )
}
