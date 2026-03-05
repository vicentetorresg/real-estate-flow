'use client';

import React, { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────
interface MapEl {
  id: string;
  type: 'pin' | 'line';
  label: string;
  color: string;
  icon: string;          // emoji (pins only)
  coords: [number, number][];
}

type Mode = 'pin' | 'line' | 'delete';

const STORAGE_KEY = 'mapa_proppi_v1';
const SANTIAGO: [number, number] = [-33.452, -70.655];

const LINE_COLORS = [
  { hex: '#ef4444', name: 'Rojo' },
  { hex: '#f97316', name: 'Naranja' },
  { hex: '#eab308', name: 'Amarillo' },
  { hex: '#22c55e', name: 'Verde' },
  { hex: '#3b82f6', name: 'Azul' },
  { hex: '#8b5cf6', name: 'Morado' },
  { hex: '#ec4899', name: 'Rosa' },
  { hex: '#1d4ed8', name: 'Azul oscuro' },
  { hex: '#6b7280', name: 'Gris' },
  { hex: '#000000', name: 'Negro' },
];

const ICONS = ['📍','🏢','🏠','🏥','🏫','🛒','🚉','🚇','⭐','🏗️','🌳','🏦','🎯','⚠️','🔵','🔴','🟢','🟡'];

// ─── Helpers ──────────────────────────────────────────────────
function loadEls(): MapEl[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

// ─── Component ───────────────────────────────────────────────
export default function MapaInteractivo({ onClose }: { onClose: () => void }) {
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const leafletRef  = useRef<{ map: any; L: any } | null>(null);
  const layersRef   = useRef(new Map<string, any>());
  const lineRef     = useRef<{ pts: [number, number][]; temp: any | null }>({ pts: [], temp: null });

  const [mode, setMode]           = useState<Mode>('pin');
  const [color, setColor]         = useState('#ef4444');
  const [icon, setIcon]           = useState('📍');
  const [label, setLabel]         = useState('');
  const [els, setEls]             = useState<MapEl[]>([]);
  const [lineCount, setLineCount] = useState(0); // UI only, tracks points in progress
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching]     = useState(false);
  const [searchErr, setSearchErr]     = useState('');

  // Refs for stable access inside Leaflet event handlers
  const stateRef = useRef({ mode, color, icon, label });
  useEffect(() => { stateRef.current = { mode, color, icon, label }; }, [mode, color, icon, label]);

  // Persist whenever elements change
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(els)); }, [els]);

  // ── Init Leaflet ────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || leafletRef.current) return;

    // Inject Leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then((Lmod) => {
      const L: any = (Lmod as any).default ?? Lmod;
      if (!mapDivRef.current || leafletRef.current) return;

      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapDivRef.current!, {
        center: SANTIAGO,
        zoom: 11,
        doubleClickZoom: false,
      });

      // OSM tiles — show comunas, calles, metro, etc.
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      leafletRef.current = { map, L };

      // Render previously saved elements
      const saved = loadEls();
      setEls(saved);
      saved.forEach(el => addLayer(L, map, el));

      // ── Click: add pin or line point ──────────────────────
      map.on('click', (e: any) => {
        const { mode, color, icon, label } = stateRef.current;
        const pt: [number, number] = [e.latlng.lat, e.latlng.lng];

        if (mode === 'pin') {
          const el: MapEl = {
            id: Date.now().toString(),
            type: 'pin', label, color, icon, coords: [pt],
          };
          addLayer(L, map, el);
          setEls(prev => [...prev, el]);

        } else if (mode === 'line') {
          const line = lineRef.current;
          line.pts = [...line.pts, pt];
          setLineCount(line.pts.length);

          // Update temp dashed preview
          if (line.temp) line.temp.remove();
          if (line.pts.length >= 2) {
            line.temp = L.polyline(line.pts, {
              color, weight: 4, dashArray: '8 5', opacity: 0.65,
            }).addTo(map);
          }
        }
      });

      // ── Double-click: finish line ──────────────────────────
      map.on('dblclick', (e: any) => {
        const { mode, color, label } = stateRef.current;
        if (mode !== 'line') return;

        const line = lineRef.current;
        const pts  = [...line.pts];
        line.pts   = [];
        setLineCount(0);
        if (line.temp) { line.temp.remove(); line.temp = null; }
        if (pts.length < 2) return;

        const el: MapEl = {
          id: Date.now().toString(),
          type: 'line', label, color, icon: '', coords: pts,
        };
        addLayer(L, map, el);
        setEls(prev => [...prev, el]);
      });
    });

    return () => {
      if (leafletRef.current) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
      layersRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Add a Leaflet layer for an element ──────────────────────
  function addLayer(L: any, map: any, el: MapEl) {
    let layer: any;

    if (el.type === 'pin') {
      const divIcon = L.divIcon({
        html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))">${el.icon || '📍'}</div>`,
        className: '',
        iconSize:   [28, 28],
        iconAnchor: [14, 26],
        tooltipAnchor: [0, -28],
      });
      layer = L.marker(el.coords[0], { icon: divIcon });
      if (el.label) {
        layer.bindTooltip(el.label, {
          permanent: true, direction: 'top',
          className: 'proppi-map-label',
        });
      }
    } else {
      layer = L.polyline(el.coords, { color: el.color || '#ef4444', weight: 5, opacity: 0.9 });
      if (el.label) layer.bindTooltip(el.label, { permanent: true, sticky: false, className: 'proppi-map-label' });
    }

    layer.on('click', (e: any) => {
      if (stateRef.current.mode !== 'delete') return;
      L.DomEvent.stopPropagation(e);
      layer.remove();
      layersRef.current.delete(el.id);
      setEls(prev => {
        const next = prev.filter(x => x.id !== el.id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    });

    layer.addTo(map);
    layersRef.current.set(el.id, layer);
  }

  // ── Delete element from sidebar ────────────────────────────
  function deleteEl(id: string) {
    const layer = layersRef.current.get(id);
    if (layer) { layer.remove(); layersRef.current.delete(id); }
    setEls(prev => prev.filter(x => x.id !== id));
  }

  // ── Address search (Nominatim) ──────────────────────────────
  async function searchAddress() {
    if (!searchQuery.trim() || !leafletRef.current) return;
    setSearching(true);
    setSearchErr('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&countrycodes=cl`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon } = data[0];
        leafletRef.current.map.flyTo([parseFloat(lat), parseFloat(lon)], 17);
      } else {
        setSearchErr('Dirección no encontrada');
      }
    } catch {
      setSearchErr('Error al buscar');
    }
    setSearching(false);
  }

  // ── Cancel line in progress ────────────────────────────────
  function cancelLine() {
    const line = lineRef.current;
    if (line.temp) { line.temp.remove(); line.temp = null; }
    line.pts = [];
    setLineCount(0);
  }

  // ── Change mode ────────────────────────────────────────────
  function changeMode(m: Mode) {
    if (m !== 'line') cancelLine();
    setMode(m);
  }

  // ─── UI ──────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', flexDirection: 'column', background: '#fff',
    }}>
      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1d4ed8, #0284c7)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>🗺️ Mapa Interactivo — Santiago</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#bfdbfe' }}>OpenStreetMap · {els.length} elemento(s) guardado(s)</span>
        <button onClick={onClose} style={{
          background: '#ffffff25', border: '1px solid #ffffff40', color: '#fff',
          borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
        }}>✕ Cerrar</button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: 230, background: '#f8fbff', borderRight: '1px solid #bfdbfe',
          overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0,
        }}>

          {/* Address search */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Buscar dirección</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchErr(''); }}
                onKeyDown={e => e.key === 'Enter' && searchAddress()}
                placeholder="Ej: Av. Providencia 1234"
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 11, outline: 'none', background: '#fff' }}
              />
              <button
                onClick={searchAddress}
                disabled={searching}
                style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, flexShrink: 0 }}
              >
                {searching ? '…' : '🔍'}
              </button>
            </div>
            {searchErr && <p style={{ fontSize: 10, color: '#dc2626', marginTop: 4 }}>{searchErr}</p>}
          </div>

          {/* Mode */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Modo</p>
            {([['pin', '📍 Agregar pin', '#15803d'], ['line', '〰️ Dibujar línea', '#1d4ed8'], ['delete', '🗑️ Eliminar', '#dc2626']] as const).map(([m, lbl, activeColor]) => (
              <button key={m} onClick={() => changeMode(m)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', borderRadius: 8, marginBottom: 4,
                border: mode === m ? `2px solid ${activeColor}` : '2px solid transparent',
                cursor: 'pointer', fontWeight: 600, fontSize: 12,
                background: mode === m ? activeColor : '#e8f0fe',
                color: mode === m ? '#fff' : '#1d4ed8',
              }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Options for pin/line mode */}
          {mode !== 'delete' && (
            <>
              {/* Label */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Etiqueta</p>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="Nombre (opcional)"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 12, outline: 'none', background: '#fff' }}
                />
              </div>

              {/* Color */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Color</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {LINE_COLORS.map(({ hex, name }) => (
                    <button
                      key={hex}
                      title={name}
                      onClick={() => setColor(hex)}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', background: hex, cursor: 'pointer',
                        border: color === hex ? '3px solid #1d4ed8' : '2px solid #fff',
                        boxShadow: color === hex ? '0 0 0 2px #1d4ed8' : '0 1px 3px #0003',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Icon selector (pins only) */}
              {mode === 'pin' && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Ícono</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {ICONS.map(ic => (
                      <button
                        key={ic}
                        onClick={() => setIcon(ic)}
                        title={ic}
                        style={{
                          fontSize: 18, padding: '4px 5px', borderRadius: 7, cursor: 'pointer',
                          border: icon === ic ? '2px solid #1d4ed8' : '2px solid transparent',
                          background: icon === ic ? '#eff6ff' : 'transparent',
                        }}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Line in progress feedback */}
              {mode === 'line' && lineCount > 0 && (
                <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#854d0e', marginBottom: 2 }}>Dibujando línea</p>
                  <p style={{ fontSize: 11, color: '#713f12', marginBottom: 8 }}>{lineCount} punto(s) — doble clic para terminar</p>
                  <button onClick={cancelLine} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#fde047', color: '#713f12', cursor: 'pointer', fontWeight: 600 }}>
                    Cancelar
                  </button>
                </div>
              )}
            </>
          )}

          {/* Elements list */}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Elementos ({els.length})
            </p>
            {els.length === 0 && (
              <p style={{ fontSize: 11, color: '#93b4d4', lineHeight: 1.5 }}>
                Sin elementos aún.<br />Haz clic en el mapa para agregar.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {els.map(el => (
                <div key={el.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderRadius: 8, background: '#eff6ff', border: '1px solid #dbeafe',
                }}>
                  {el.type === 'pin'
                    ? <span style={{ fontSize: 16, flexShrink: 0 }}>{el.icon}</span>
                    : <span style={{ display: 'inline-block', width: 18, height: 4, borderRadius: 2, background: el.color, flexShrink: 0 }} />
                  }
                  <span style={{
                    flex: 1, fontSize: 11, color: '#1d4ed8', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {el.label || (el.type === 'pin' ? 'Pin' : 'Línea')}
                  </span>
                  <button
                    onClick={() => deleteEl(el.id)}
                    style={{ fontSize: 11, padding: '2px 6px', borderRadius: 5, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', flexShrink: 0 }}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Map ── */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Instruction banner */}
          {mode === 'line' && lineCount === 0 && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, background: '#1d4ed8', color: '#fff',
              padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 8px #0003',
            }}>
              Clic para agregar puntos · Doble clic para terminar la línea
            </div>
          )}
          {mode === 'line' && lineCount > 0 && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, background: '#854d0e', color: '#fff',
              padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 8px #0003',
            }}>
              {lineCount} punto(s) · Doble clic para terminar
            </div>
          )}
          {mode === 'delete' && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, background: '#dc2626', color: '#fff',
              padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 8px #0003',
            }}>
              Clic sobre un elemento para eliminarlo
            </div>
          )}
          <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}
