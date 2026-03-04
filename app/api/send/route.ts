import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase-server';

const RESEND_API_KEY = 're_jBmmbDUG_59hD9hCgpFE7E1q1uKKVeJ4o';

export async function POST(req: NextRequest) {
  const { to, clientName, clientRut, shareLink, mode, projectName, asesorName, resendOf, commune } = await req.json();
  const isStatic = mode === 'static';

  if (!to || !shareLink) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  const displayName = clientName || 'estimado/a cliente';
  const asesorFirst = asesorName ? asesorName.split(' ')[0] : null;

  const subject = asesorFirst
    ? `${asesorFirst} de Proppi te compartió tu simulación inmobiliaria`
    : `Tu simulación inmobiliaria${clientName ? ` — ${clientName}` : ''}`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f7ff;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px #1d4ed820;">
    <div style="background:linear-gradient(135deg,#1d4ed8,#0284c7);padding:28px 32px;">
      <div style="margin-bottom:12px;">
        <span style="display:inline-block;width:34px;height:34px;background:#fff;border-radius:7px;font-weight:900;font-size:17px;color:#1d4ed8;text-align:center;line-height:34px;vertical-align:middle;margin-right:10px;">P</span>
        <span style="display:inline-block;font-size:18px;font-weight:800;color:#fff;vertical-align:middle;">Proppi</span>
      </div>
      ${projectName ? `<p style="font-size:11px;color:#93c5fd;font-weight:700;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.08em;">${projectName}</p>` : ''}
      <h1 style="font-size:22px;font-weight:800;color:#fff;margin:0 0 4px;">Simulación de Inversión Inmobiliaria</h1>
      <p style="color:#bfdbfe;font-size:13px;margin:0;">Tu análisis personalizado está listo</p>
    </div>
    <div style="padding:32px;">
      <p style="font-size:15px;color:#0f2957;margin:0 0 4px;">Hola, <strong>${displayName}</strong></p>
      ${clientRut ? `<p style="font-size:12px;color:#6b93c4;margin:0 0 12px;">RUT: <strong style="color:#0f2957;">${clientRut}</strong></p>` : '<p style="margin:0 0 12px;"></p>'}
      ${asesorName ? `<p style="font-size:13px;color:#334d6e;margin:0 0 16px;"><strong style="color:#1d4ed8;">${asesorName}</strong> de Proppi preparó esta simulación especialmente para ti.</p>` : ''}
      <p style="font-size:13px;color:#334d6e;line-height:1.6;margin:0 0 16px;">
        Aquí encontrarás el análisis completo de tu inversión: flujo de caja mensual, dividendo hipotecario, arriendo neto, escenarios de plusvalía y resultado total al momento de venta.
      </p>
      ${isStatic ? '' : '<p style="font-size:12px;color:#6b93c4;margin:0 0 20px;">💡 Esta simulación es <strong>interactiva</strong>: puedes mover los parámetros y ver cómo cambian los resultados en tiempo real.</p>'}
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${shareLink}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,${isStatic ? '#0284c7' : '#7c3aed'});color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;letter-spacing:0.02em;">
          ${isStatic ? '📋 Ver mi simulación →' : '🎮 Abrir simulación interactiva →'}
        </a>
      </div>
      <div style="background:#f0f7ff;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
        <p style="font-size:11px;color:#6b93c4;margin:0 0 4px;">Link directo:</p>
        <p style="font-size:10px;color:#1d4ed8;word-break:break-all;margin:0;font-family:monospace;">${shareLink}</p>
      </div>
      <p style="font-size:11px;color:#93b4d4;line-height:1.5;margin:0;">
        Este link es único y contiene tu simulación completa. Puedes guardarlo y compartirlo cuando quieras.
        Los valores son estimativos y no garantizan retorno de inversión.
      </p>
    </div>
    <div style="background:#f8fbff;border-top:1px solid #dbeafe;padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#93b4d4;margin:0;">Proppi · Simulador Inmobiliario${asesorName ? ` · ${asesorName}` : ''}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Proppi <notificaciones@proppi.cl>',
      to: [to],
      cc: ['vicente.torres@proppi.cl'],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  // Save to DB (fire and forget — don't fail the request if DB save fails)
  try {
    const sb = getSupabase();
    await sb.from('sim_cotizaciones').insert({
      asesor_name:  asesorName  || null,
      client_name:  clientName  || null,
      client_rut:   clientRut   || null,
      client_email: to,
      project_name: projectName || null,
      commune:      commune     || null,
      mode,
      share_link:   shareLink,
      resend_of:    resendOf    || null,
    });
  } catch {}

  return NextResponse.json({ success: true });
}
