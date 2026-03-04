'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ─── Auth ────────────────────────────────────────────────────
const USERS: Record<string, { role: 'admin' | 'asesor' }> = {
  'proppi:20262026': { role: 'asesor' },
  'admin:admin':     { role: 'admin'  },
};
const SESSION_KEY = 'cotiz_session';
const store = typeof window !== 'undefined' ? window.localStorage : null;

// ─── Types ───────────────────────────────────────────────────
interface Cotizacion {
  id: string;
  created_at: string;
  asesor_name: string | null;
  client_name: string | null;
  client_rut:  string | null;
  client_email: string;
  project_name: string | null;
  commune: string | null;
  mode: 'static' | 'dynamic';
  share_link: string;
  resend_of: string | null;
}

const ASESORES = ['Diego Sánchez', 'Cristóbal Sepúlveda', 'Matías Bertelsen'];

// ─── Utils ───────────────────────────────────────────────────
function fDate(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function fDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}
function startOfDay(d: Date) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d: Date)   { const r = new Date(d); r.setHours(23,59,59,999); return r; }

type Period = 'week' | 'month' | 'all' | 'custom';
function periodRange(period: Period, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // monday=0
    const monday = new Date(now); monday.setDate(now.getDate() - day);
    return { from: startOfDay(monday).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: startOfDay(first).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (period === 'custom') {
    return {
      from: customFrom ? new Date(customFrom + 'T00:00:00').toISOString() : undefined,
      to:   customTo   ? new Date(customTo + 'T23:59:59').toISOString()   : undefined,
    };
  }
  return {};
}

// ─── Styles ──────────────────────────────────────────────────
const CARD: React.CSSProperties  = { background: '#fff', border: '1px solid #bfdbfe', borderRadius: 14 };
const BTN: React.CSSProperties   = { border: 'none', cursor: 'pointer', borderRadius: 8, fontWeight: 600, fontSize: 12 };
const INPUT_S: React.CSSProperties = {
  background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8,
  padding: '8px 10px', fontSize: 12, color: '#0f2957', outline: 'none', width: '100%',
};

// ─── Resend Modal ────────────────────────────────────────────
function ResendModal({ cotiz, onClose, onSent }: {
  cotiz: Cotizacion;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail]       = useState(cotiz.client_email);
  const [clientName, setClientName] = useState(cotiz.client_name || '');
  const [clientRut, setClientRut]   = useState(cotiz.client_rut || '');
  const [asesor, setAsesor]     = useState(cotiz.asesor_name || '');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');

  const handle = async () => {
    if (!email) return;
    setSending(true); setError('');
    try {
      const r = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          clientName:  clientName || undefined,
          clientRut:   clientRut || undefined,
          shareLink:   cotiz.share_link,
          mode:        cotiz.mode,
          projectName: cotiz.project_name,
          asesorName:  asesor || undefined,
          resendOf:    cotiz.id,
        }),
      });
      if (!r.ok) throw new Error();
      onSent();
    } catch { setError('No se pudo enviar. Intenta de nuevo.'); }
    finally { setSending(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000070', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...CARD, width: '100%', maxWidth: 420, padding: 28, boxShadow: '0 24px 80px #0004' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f2957', margin: 0 }}>📧 Reenviar cotización</h3>
          <button onClick={onClose} style={{ ...BTN, background: '#f0f7ff', color: '#6b93c4', padding: '4px 10px' }}>✕</button>
        </div>

        {cotiz.project_name && <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 14 }}>Proyecto: {cotiz.project_name}</p>}

        <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>Nombre del cliente:</p>
        <input
          value={clientName} onChange={e => setClientName(e.target.value)}
          style={{ ...INPUT_S, marginBottom: 10 }}
          placeholder="Nombre Apellido"
        />
        <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>RUT:</p>
        <input
          value={clientRut} onChange={e => setClientRut(e.target.value)}
          style={{ ...INPUT_S, marginBottom: 14 }}
          placeholder="12.345.678-9"
        />

        <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>Asesor que envía:</p>
        <select value={asesor} onChange={e => setAsesor(e.target.value)} style={{ ...INPUT_S, marginBottom: 14 }}>
          <option value="">— Seleccionar asesor —</option>
          {ASESORES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>Email destino:</p>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          style={{ ...INPUT_S, marginBottom: 18 }}
          placeholder="email@cliente.com"
        />

        <div style={{ background: '#f0f7ff', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 11, color: '#4a7abf' }}>
          Modo: <strong>{cotiz.mode === 'static' ? '📋 Solo visualización' : '🎮 Interactiva'}</strong> · Link original conservado
        </div>

        <button onClick={handle} disabled={!email || sending} style={{
          ...BTN, width: '100%', padding: '12px 0',
          background: email && !sending ? 'linear-gradient(135deg,#1d4ed8,#7c3aed)' : '#c4b5fd',
          color: '#fff', fontSize: 13,
        }}>
          {sending ? '⏳ Enviando...' : '📧 Reenviar'}
        </button>
        {error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 8, textAlign: 'center' }}>{error}</p>}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────
export default function CotizacionesPage() {
  const [role, setRole]     = useState<'admin' | 'asesor' | null>(null);
  const [user, setUser]     = useState('');
  const [pass, setPass]     = useState('');
  const [loginErr, setLoginErr] = useState('');

  const [data, setData]     = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState('');
  const [period, setPeriod] = useState<Period>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [asesorFilter, setAsesorFilter] = useState('');

  const [resending, setResending]   = useState<Cotizacion | null>(null);
  const [sentId, setSentId]         = useState<string | null>(null);
  const [copiedId, setCopiedId]     = useState<string | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (s) { const { role: r } = JSON.parse(s); if (r) setRole(r); }
    } catch {}
  }, []);

  const login = () => {
    const key = `${user.trim().toLowerCase()}:${pass.trim()}`;
    const found = USERS[key];
    if (found) {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ role: found.role })); } catch {}
      if (found.role === 'asesor') {
        window.location.href = '/';
        return;
      }
      setRole(found.role);
      setLoginErr('');
    } else {
      setLoginErr('Usuario o contraseña incorrectos.');
    }
  };

  const logout = () => {
    setRole(null); setUser(''); setPass('');
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  };

  const fetchData = useCallback(async () => {
    if (!role) return;
    setLoading(true);
    setDbError('');
    try {
      const range = periodRange(period, customFrom, customTo);
      const params = new URLSearchParams();
      if (asesorFilter) params.set('asesor', asesorFilter);
      if (range.from)   params.set('from', range.from);
      if (range.to)     params.set('to', range.to);
      const r = await fetch(`/api/cotizaciones?${params}`);
      const d = await r.json();
      if (!r.ok) { setDbError(d?.error || 'Error al cargar datos.'); setData([]); }
      else setData(Array.isArray(d) ? d : []);
    } catch {
      setDbError('connection_failed');
      setData([]);
    } finally { setLoading(false); }
  }, [role, period, customFrom, customTo, asesorFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyLink = (c: Cotizacion) => {
    navigator.clipboard.writeText(c.share_link);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Stats
  const countByAsesor = ASESORES.map(a => ({
    name: a,
    count: data.filter(d => d.asesor_name === a).length,
  }));
  const noAsesor = data.filter(d => !d.asesor_name).length;

  // ─── Login ───────────────────────────────────────────────
  if (!role) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ ...CARD, width: '100%', maxWidth: 380, padding: 36, boxShadow: '0 8px 40px #1d4ed815' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#1d4ed8,#0284c7)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff' }}>P</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#0f2957' }}>Proppi</span>
            </div>
            <h1 style={{ fontSize: 16, fontWeight: 800, color: '#0f2957', margin: 0 }}>Portal de Asesores</h1>
            <p style={{ fontSize: 12, color: '#6b93c4', marginTop: 4 }}>Acceso interno Proppi</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>Usuario</p>
            <input
              value={user} onChange={e => setUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              style={INPUT_S} placeholder="proppi o admin"
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>Contraseña</p>
            <input
              type="password" value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              style={INPUT_S} placeholder="••••••••"
            />
          </div>
          {loginErr && <p style={{ fontSize: 11, color: '#dc2626', marginBottom: 12, textAlign: 'center' }}>{loginErr}</p>}
          <button onClick={login} style={{ ...BTN, width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#1d4ed8,#0284c7)', color: '#fff', fontSize: 13 }}>
            Ingresar →
          </button>
        </div>
      </div>
    );
  }

  // ─── Shared table component ─────────────────────────────
  const tableContent = (
    <div style={{ ...CARD, overflow: 'hidden' }}>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b93c4', fontSize: 13 }}>Cargando...</div>
      ) : dbError ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          {role === 'admin' ? (
            <>
              <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 6 }}>⚠️ Tabla no configurada</p>
              <p style={{ fontSize: 11, color: '#6b93c4', lineHeight: 1.6 }}>
                La tabla <code>sim_cotizaciones</code> no existe en Supabase.<br />
                Ejecuta el SQL de configuración inicial para activar el historial.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#6b93c4' }}>Sin cotizaciones registradas aún.</p>
          )}
        </div>
      ) : data.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b93c4', fontSize: 13 }}>
          No hay cotizaciones en este período.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#eff6ff', borderBottom: '2px solid #bfdbfe' }}>
                {(role === 'admin'
                  ? ['ID', 'Fecha', 'Asesor', 'Cliente', 'Email', 'Proyecto', 'Comuna', 'Modo', 'Acciones']
                  : ['ID', 'Fecha', 'Cliente', 'Email', 'Proyecto', 'Comuna', 'Acciones']
                ).map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f4ff', background: i % 2 === 0 ? '#fff' : '#fafcff' }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6b93c4', background: '#f0f7ff', padding: '2px 6px', borderRadius: 4 }}>
                      {c.id.slice(0, 8)}
                    </span>
                    {c.resend_of && <span style={{ display: 'block', fontSize: 9, color: '#f59e0b', fontWeight: 700, marginTop: 2 }}>↩ reenvío</span>}
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#334d6e', fontSize: 11 }}>
                    {fDateShort(c.created_at)}
                  </td>
                  {role === 'admin' && (
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#0f2957' }}>
                      {c.asesor_name || <span style={{ color: '#94a3b8', fontWeight: 400 }}>—</span>}
                    </td>
                  )}
                  <td style={{ padding: '10px 14px' }}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#0f2957' }}>{c.client_name || '—'}</p>
                    {c.client_rut && <p style={{ margin: 0, fontSize: 10, color: '#6b93c4' }}>{c.client_rut}</p>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                    {c.client_email}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334d6e' }}>
                    {c.project_name || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334d6e' }}>
                    {c.commune || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  {role === 'admin' && (
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                        background: c.mode === 'static' ? '#eff6ff' : '#f5f3ff',
                        color: c.mode === 'static' ? '#1d4ed8' : '#7c3aed',
                      }}>
                        {c.mode === 'static' ? '📋 Visual' : '🎮 Interactiva'}
                      </span>
                    </td>
                  )}
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                      <button onClick={() => copyLink(c)} style={{
                        ...BTN, padding: '5px 10px', fontSize: 11,
                        background: copiedId === c.id ? '#f0fdf4' : '#f0f7ff',
                        color: copiedId === c.id ? '#15803d' : '#1d4ed8',
                        border: `1px solid ${copiedId === c.id ? '#bbf7d0' : '#bfdbfe'}`,
                      }}>
                        {copiedId === c.id ? '✓ Copiado' : '🔗 Copiar'}
                      </button>
                      <button onClick={() => setResending(c)} style={{
                        ...BTN, padding: '5px 10px', fontSize: 11,
                        background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe',
                      }}>
                        📧 Reenviar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ─── Header shared ───────────────────────────────────────
  const header = (
    <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#0284c7)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#1d4ed8' }}>P</div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>
            {role === 'admin' ? 'Proppi · Dashboard Admin' : 'Proppi · Mis Cotizaciones'}
          </p>
          <p style={{ fontSize: 10, color: '#bfdbfe', margin: 0 }}>
            {role === 'admin' ? '🔑 Admin' : '👤 Asesor'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/" style={{ ...BTN, padding: '6px 14px', background: '#ffffff20', color: '#fff', textDecoration: 'none' }}>
          ← Simulador
        </a>
        <button onClick={logout} style={{ ...BTN, padding: '6px 14px', background: '#ffffff20', color: '#fff' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  // ─── Asesor view ─────────────────────────────────────────
  if (role === 'asesor') {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f7ff', fontFamily: 'system-ui,sans-serif', color: '#0f2957' }}>
        {header}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#6b93c4', margin: 0 }}>
              Todas las cotizaciones enviadas — {data.length} registros
            </p>
            <button onClick={fetchData} style={{ ...BTN, padding: '6px 14px', background: '#fff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              {loading ? '⏳' : '↻ Actualizar'}
            </button>
          </div>
          {tableContent}
          <p style={{ fontSize: 10, color: '#93b4d4', textAlign: 'center', marginTop: 12 }}>
            Mostrando hasta 200 cotizaciones más recientes
          </p>
        </div>
        {resending && (
          <ResendModal cotiz={resending} onClose={() => setResending(null)}
            onSent={() => { setResending(null); setSentId(resending.id); setTimeout(() => { setSentId(null); fetchData(); }, 2000); }} />
        )}
        {sentId && (
          <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#15803d', color: '#fff', padding: '10px 24px', borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px #0004', zIndex: 300 }}>
            ✓ Cotización reenviada correctamente
          </div>
        )}
      </div>
    );
  }

  // ─── Admin view ──────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f0f7ff', fontFamily: 'system-ui,sans-serif', color: '#0f2957' }}>
      {header}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ ...CARD, padding: '14px 18px' }}>
            <p style={{ fontSize: 10, color: '#6b93c4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>Total período</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#1d4ed8', margin: 0 }}>{data.length}</p>
            <p style={{ fontSize: 10, color: '#93b4d4', margin: '2px 0 0' }}>cotizaciones enviadas</p>
          </div>
          {countByAsesor.map(({ name, count }) => (
            <div key={name} style={{ ...CARD, padding: '14px 18px' }}>
              <p style={{ fontSize: 10, color: '#6b93c4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>{name.split(' ')[0]}</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: count > 0 ? '#0f2957' : '#c4d4e8', margin: 0 }}>{count}</p>
              <p style={{ fontSize: 9, color: '#93b4d4', margin: '2px 0 0' }}>{name.split(' ').slice(1).join(' ')}</p>
            </div>
          ))}
          {noAsesor > 0 && (
            <div style={{ ...CARD, padding: '14px 18px' }}>
              <p style={{ fontSize: 10, color: '#6b93c4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>Sin asesor</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: '#94a3b8', margin: 0 }}>{noAsesor}</p>
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{ ...CARD, padding: '14px 18px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#6b93c4', margin: 0 }}>Período:</p>
          {(['week', 'month', 'all', 'custom'] as Period[]).map(pp => (
            <button key={pp} onClick={() => setPeriod(pp)} style={{
              ...BTN, padding: '5px 12px',
              background: period === pp ? '#1d4ed8' : '#f0f7ff',
              color: period === pp ? '#fff' : '#4a7abf',
              border: `1px solid ${period === pp ? '#1d4ed8' : '#bfdbfe'}`,
            }}>
              {pp === 'week' ? 'Esta semana' : pp === 'month' ? 'Este mes' : pp === 'all' ? 'Todo' : 'Personalizado'}
            </button>
          ))}
          {period === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...INPUT_S, width: 140 }} />
              <span style={{ fontSize: 11, color: '#6b93c4' }}>a</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...INPUT_S, width: 140 }} />
            </>
          )}
          <div style={{ width: 1, height: 24, background: '#dbeafe', marginLeft: 4 }} />
          <select value={asesorFilter} onChange={e => setAsesorFilter(e.target.value)} style={{ ...INPUT_S, width: 'auto' }}>
            <option value="">Todos los asesores</option>
            {ASESORES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={fetchData} style={{ ...BTN, padding: '5px 14px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', marginLeft: 'auto' }}>
            {loading ? '⏳' : '↻ Actualizar'}
          </button>
        </div>

        {tableContent}
        <p style={{ fontSize: 10, color: '#93b4d4', textAlign: 'center', marginTop: 12 }}>
          Mostrando hasta 200 cotizaciones más recientes
        </p>
      </div>

      {resending && (
        <ResendModal cotiz={resending} onClose={() => setResending(null)}
          onSent={() => { setResending(null); setSentId(resending.id); setTimeout(() => { setSentId(null); fetchData(); }, 2000); }} />
      )}
      {sentId && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#15803d', color: '#fff', padding: '10px 24px', borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px #0004', zIndex: 300 }}>
          ✓ Cotización reenviada correctamente
        </div>
      )}
    </div>
  );
}
