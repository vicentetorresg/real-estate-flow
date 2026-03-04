import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Proppi — Simulador de Inversión Inmobiliaria';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginBottom: 40,
        }}>
          <div style={{
            width: 80,
            height: 80,
            background: 'white',
            borderRadius: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 52,
            fontWeight: 900,
            color: '#1d4ed8',
          }}>P</div>
          <span style={{ fontSize: 52, fontWeight: 800, color: 'white' }}>Proppi</span>
        </div>

        {/* Title */}
        <div style={{
          fontSize: 54,
          fontWeight: 800,
          color: 'white',
          textAlign: 'center',
          lineHeight: 1.2,
          marginBottom: 20,
          padding: '0 80px',
        }}>
          Simulador de Inversión Inmobiliaria
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 26,
          color: '#bfdbfe',
          textAlign: 'center',
          padding: '0 120px',
        }}>
          Flujo de caja · Cap Rate · ROI · Plusvalía · Escenarios de venta
        </div>

        {/* Bottom badge */}
        <div style={{
          position: 'absolute',
          bottom: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 50,
          padding: '10px 28px',
        }}>
          <span style={{ color: '#e0f2fe', fontSize: 20 }}>Herramienta profesional para asesores inmobiliarios</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
