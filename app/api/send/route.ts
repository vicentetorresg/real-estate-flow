import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase-server';
import { getCommuneInfo, type CommuneInfo } from '@/lib/commune-info';

const RESEND_API_KEY = 're_jBmmbDUG_59hD9hCgpFE7E1q1uKKVeJ4o';

export async function POST(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const { to, clientName, clientRut, shareLink, mode, projectName, asesorName, asesorEmail, resendOf, commune, insights } = await req.json();
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

  const insightsHtml = insights ? (() => {
    const lines = insights.split('\n').map((line: string) => {
      if (line.startsWith('## ')) return `<div style="font-size:13px;font-weight:700;color:#0f2957;margin-top:14px;margin-bottom:4px;border-left:3px solid #7c3aed;padding-left:10px;">${line.slice(3)}</div>`;
      if (!line.trim()) return '<div style="height:4px;"></div>';
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return `<p style="font-size:12px;color:#334d6e;line-height:1.7;margin:0;text-align:justify;">${html}</p>`;
    }).join('');
    return `<div style="background:linear-gradient(135deg,#f5f3ff,#eff6ff);border-radius:14px;padding:22px 24px;margin-bottom:28px;border:1px solid #ddd6fe;"><p style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px;">Análisis personalizado de tu inversión</p>${lines}</div>`;
  })() : '';

  const communeInfo = getCommuneInfo(commune);

  function buildCommuneStudyHtml(info: CommuneInfo): string {
    const lines = info.study.split('\n').map((line: string) => {
      if (line.startsWith('## ')) return `<p style="font-size:13px;font-weight:700;color:#0f2957;margin:14px 0 4px;border-left:3px solid #1d4ed8;padding-left:10px;">${line.slice(3)}</p>`;
      if (!line.trim()) return '';
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0f2957;">$1</strong>');
      return `<p style="font-size:13px;color:#334d6e;line-height:1.75;margin:0 0 6px;text-align:justify;">${html}</p>`;
    }).filter(Boolean).join('');
    return `
      <div style="background:#f8fbff;border-radius:14px;padding:22px 26px;margin-bottom:28px;border:1px solid #bfdbfe;">
        <p style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">
          📍 ¿Por qué ${info.displayName}?
        </p>
        ${lines}
      </div>`;
  }

  function buildCommuneReservaHtml(info: CommuneInfo): string {
    const t = info.transferData;
    const liStyle = 'font-size:13px;color:#334d6e;line-height:1.9;';
    const indDocs = info.docsIndependiente.map(d => `<li style="${liStyle}">${d}</li>`).join('');
    const depDocs = info.docsDependiente.map(d => `<li style="${liStyle}">${d}</li>`).join('');
    return `
      <div style="margin-bottom:28px;">
        <p style="font-size:14px;font-weight:700;color:#0f2957;margin:0 0 10px;">📋 Reserva y Documentación</p>
        <p style="font-size:13px;color:#334d6e;line-height:1.75;margin:0 0 20px;text-align:justify;">
          La reserva tiene un valor de <strong style="color:#0f2957;">${info.reservaAmount} por unidad</strong>.
          Con esto logramos bloquear la unidad por un plazo máximo de 10 días, congelando el valor de la propiedad y el bono pie.
          <strong style="color:#0f2957;">Con la reserva, iniciaremos de inmediato la gestión de tu aprobación bancaria.</strong>
          Esta reserva es reembolsable frente a todo evento, con un plazo máximo de devolución de 48 horas.
        </p>

        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
          <div style="flex:1;min-width:220px;background:#f8fbff;border-radius:12px;padding:16px 18px;border:1px solid #dbeafe;">
            <p style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.07em;margin:0 0 10px;">Trabajador Dependiente</p>
            <ul style="margin:0;padding-left:18px;">${depDocs}</ul>
          </div>
          <div style="flex:1;min-width:220px;background:#f8fbff;border-radius:12px;padding:16px 18px;border:1px solid #dbeafe;">
            <p style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.07em;margin:0 0 10px;">Trabajador Independiente</p>
            <ul style="margin:0;padding-left:18px;">${indDocs}</ul>
          </div>
        </div>

        <div style="background:linear-gradient(135deg,#1d4ed8,#0284c7);border-radius:12px;padding:18px 22px;">
          <p style="font-size:11px;font-weight:700;color:#93c5fd;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Datos de Transferencia</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${[
              ['Razón social', t.razonSocial],
              ['RUT', t.rut],
              ['Banco', t.banco],
              ['Tipo de cuenta', t.tipoCuenta],
              ['Número de cuenta', t.numeroCuenta],
              ['Email', t.email],
            ].map(([lbl, val]) => `
              <tr>
                <td style="color:#93c5fd;padding:3px 12px 3px 0;white-space:nowrap;">${lbl}</td>
                <td style="color:#fff;font-weight:600;">${typeof val === 'string' && val.includes('@') ? `<a href="mailto:${val}" style="color:#fff;font-weight:600;text-decoration:none;">${val}</a>` : val}</td>
              </tr>`).join('')}
          </table>
        </div>
      </div>`;
  }

  const communeStudyHtml  = communeInfo ? buildCommuneStudyHtml(communeInfo)  : '';
  const communeReservaHtml = communeInfo ? buildCommuneReservaHtml(communeInfo) : '';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f7ff;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px #1d4ed825;">

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

      <p style="font-size:14px;color:#334d6e;line-height:1.7;margin:0 0 16px;text-align:justify;">
        ${asesorName
          ? `<strong style="color:#1d4ed8;">${asesorName}</strong> del equipo Proppi preparó este plan exclusivamente para ti.`
          : 'El equipo de Proppi preparó este plan exclusivamente para ti.'
        }
        Queremos que puedas tomar tu decisión de inversión inmobiliaria de forma <strong style="color:#0f2957;">completamente informada</strong>, con todos los números sobre la mesa.
      </p>

      <p style="font-size:14px;color:#334d6e;line-height:1.7;margin:0 0 24px;text-align:justify;">
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

      ${insightsHtml}

      ${communeStudyHtml}

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:30px;">
        <a href="${shareLink}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,${isStatic ? '#0284c7' : '#7c3aed'});color:#fff;text-decoration:none;padding:16px 40px;border-radius:14px;font-size:15px;font-weight:800;letter-spacing:0.01em;box-shadow:0 4px 20px #1d4ed830;">
          ${isStatic ? 'Ver mi plan de inversión →' : 'Abrir mi simulación →'}
        </a>
        <p style="font-size:11px;color:#94a3b8;margin:12px 0 0;">Link único y personal — solo tú tienes acceso</p>
      </div>

      ${communeReservaHtml}

      <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
        <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:0;text-align:justify;">
          ¿Tienes preguntas? Responde este correo o contáctate directamente con${asesorName ? ` <strong style="color:#334d6e;">${asesorName}</strong>` : ' tu asesor Proppi'}. Estamos para ayudarte a dar el próximo paso.<br/><br/>
          <em>Los valores son estimativos y no garantizan retorno de inversión.</em>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fbff;border-top:1px solid #dbeafe;padding:16px 36px;">
      ${asesorName ? `
      <p style="font-size:12px;font-weight:700;color:#0f2957;margin:0 0 1px;">${asesorName}</p>
      <p style="font-size:11px;color:#6b93c4;margin:0 0 1px;">Asesor Inmobiliario</p>
      <p style="font-size:11px;color:#94a3b8;margin:0;">Proppi Inversiones Inmobiliarias</p>
      ` : `<p style="font-size:11px;color:#94a3b8;margin:0;font-weight:600;">Proppi Inversiones Inmobiliarias</p>`}
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
      cc: Array.from(new Set(['vicente.torres@proppi.cl', ...(asesorEmail && asesorEmail !== 'vicente.torres@proppi.cl' ? [asesorEmail] : [])])).filter(Boolean),
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
