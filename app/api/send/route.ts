import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase-server';

const RESEND_API_KEY = 're_jBmmbDUG_59hD9hCgpFE7E1q1uKKVeJ4o';

export async function POST(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const { to, clientName, clientRut, shareLink, mode, projectName, asesorName, resendOf, commune } = await req.json();
  const isStatic = mode === 'static';

  if (!to || !shareLink) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  const firstName   = clientName ? clientName.split(' ')[0] : null;
  const displayName = firstName  || 'estimado/a';
  const asesorFirst = asesorName ? asesorName.split(' ')[0] : null;

  const subject = clientName
    ? `${clientName}, aquí está tu plan de inversión inmobiliaria personalizado`
    : asesorFirst
      ? `${asesorFirst} de Proppi te compartió tu simulación inmobiliaria`
      : 'Tu plan de inversión inmobiliaria personalizado — Proppi';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f7ff;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px #1d4ed825;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1d4ed8,#0284c7);padding:32px 36px 28px;">
      <div style="margin-bottom:16px;">
        <img src="${origin}/logo2.png" alt="Proppi" width="36" height="36" style="display:inline-block;vertical-align:middle;margin-right:10px;border-radius:8px;background:#fff;" />
        <span style="display:inline-block;font-size:17px;font-weight:800;color:#fff;vertical-align:middle;letter-spacing:-0.3px;">Proppi</span>
      </div>
      ${projectName ? `<p style="font-size:11px;color:#93c5fd;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.1em;">${projectName}</p>` : ''}
      <h1 style="font-size:24px;font-weight:900;color:#fff;margin:0 0 6px;line-height:1.2;">Tu plan de inversión<br/>inmobiliaria está listo</h1>
      <p style="color:#bfdbfe;font-size:13px;margin:0;">Preparado especialmente para ti · Proppi</p>
    </div>

    <!-- Body -->
    <div style="padding:36px;">

      <p style="font-size:17px;font-weight:700;color:#0f2957;margin:0 0 6px;">
        Hola, ${displayName} 👋
      </p>
      ${clientRut ? `<p style="font-size:11px;color:#94a3b8;margin:0 0 20px;">RUT ${clientRut}</p>` : '<div style="margin-bottom:20px;"></div>'}

      <p style="font-size:14px;color:#334d6e;line-height:1.7;margin:0 0 16px;">
        ${asesorName
          ? `<strong style="color:#1d4ed8;">${asesorName}</strong> del equipo Proppi preparó este plan exclusivamente para ti.`
          : 'El equipo de Proppi preparó este plan exclusivamente para ti.'
        }
        Queremos que puedas tomar tu decisión de inversión inmobiliaria de forma <strong style="color:#0f2957;">completamente informada</strong>, con todos los números sobre la mesa.
      </p>

      <p style="font-size:14px;color:#334d6e;line-height:1.7;margin:0 0 24px;">
        En este análisis encontrarás el flujo mes a mes, cuánto pagarás de dividendo, cuánto recibirás de arriendo, y cuál sería tu ganancia real al momento de vender — en dos escenarios distintos. Sin letra chica.
      </p>

      <!-- Highlights -->
      <div style="display:flex;gap:10px;margin-bottom:28px;">
        <div style="flex:1;background:#eff6ff;border-radius:10px;padding:14px 16px;text-align:center;">
          <p style="font-size:20px;margin:0 0 4px;">📊</p>
          <p style="font-size:11px;font-weight:700;color:#1d4ed8;margin:0;">Flujo mes a mes</p>
        </div>
        <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:14px 16px;text-align:center;">
          <p style="font-size:20px;margin:0 0 4px;">🏠</p>
          <p style="font-size:11px;font-weight:700;color:#15803d;margin:0;">Arriendo neto</p>
        </div>
        <div style="flex:1;background:#f5f3ff;border-radius:10px;padding:14px 16px;text-align:center;">
          <p style="font-size:20px;margin:0 0 4px;">📈</p>
          <p style="font-size:11px;font-weight:700;color:#7c3aed;margin:0;">Plusvalía proyectada</p>
        </div>
      </div>

      ${!isStatic ? '<p style="font-size:12px;background:#f5f3ff;color:#7c3aed;border-radius:8px;padding:10px 14px;margin:0 0 24px;">💡 Tu simulación es <strong>interactiva</strong> — puedes mover los parámetros (tasa, arriendo, plazo) y ver cómo cambian los números en tiempo real.</p>' : ''}

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:30px;">
        <a href="${shareLink}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,${isStatic ? '#0284c7' : '#7c3aed'});color:#fff;text-decoration:none;padding:16px 40px;border-radius:14px;font-size:15px;font-weight:800;letter-spacing:0.01em;box-shadow:0 4px 20px #1d4ed830;">
          ${isStatic ? 'Ver mi plan de inversión →' : 'Abrir mi simulación →'}
        </a>
        <p style="font-size:11px;color:#94a3b8;margin:12px 0 0;">Link único y personal — solo tú tienes acceso</p>
      </div>

      <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
        <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:0;">
          ¿Tienes preguntas? Responde este correo o contáctate directamente con${asesorName ? ` <strong style="color:#334d6e;">${asesorName}</strong>` : ' tu asesor Proppi'}. Estamos para ayudarte a dar el próximo paso.<br/><br/>
          <em>Los valores son estimativos y no garantizan retorno de inversión.</em>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fbff;border-top:1px solid #dbeafe;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;font-weight:600;">Proppi · Inversión Inmobiliaria</p>
      ${asesorName ? `<p style="font-size:11px;color:#6b93c4;margin:0;">${asesorName}</p>` : ''}
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
