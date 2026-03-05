import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

function fCLP(v: number) {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v), s = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 100_000) return `${s}$${Math.round(abs / 1000)}k`;
  return `${s}$${Math.round(abs).toLocaleString('es-CL')}`;
}
function fPct(v: number) { return `${v.toFixed(1)}%`; }

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response('Error: ANTHROPIC_API_KEY no configurada', { status: 500 });
  }

  let body: { p: Record<string, unknown>; r: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response('Error: body inválido', { status: 400 });
  }

  const { p, r } = body;
  const client = new Anthropic({ apiKey });

  const totalValueUF = (p.propertyValueUF as number) + (p.parkingCount as number) * (p.parkingValueUF as number) + (p.storageCount as number) * (p.storageValueUF as number);
  const nombre = p.clientName ? (p.clientName as string).split(' ')[0] : 'ti';

  const prompt = `Eres un asesor inmobiliario amable, cercano y honesto. Acabas de preparar una simulación personalizada para ${nombre} y quieres explicarle, en palabras simples y cálidas, qué significa esta inversión para su futuro.

Escribe como si le hablaras directamente a ${nombre}. Usa "tú". Sin tecnicismos. Sin jerga financiera compleja. Como si le explicaras a un amigo/a que nunca ha invertido antes. Sé motivador/a, pero honesto/a — usa los números reales.

DATOS DE LA SIMULACIÓN:
- Proyecto: ${p.projectName || 'Propiedad'} · ${p.commune || ''}
- Valor: UF ${totalValueUF.toFixed(0)} (≈ ${fCLP(totalValueUF * (p.ufValueCLP as number))})
- Lo que pones tú al inicio: UF ${Number(r.clientPieUF).toFixed(1)} (${fCLP((r.clientPieUF as number) * (p.ufValueCLP as number))})
- Lo que pagas al banco cada mes (dividendo): ${fCLP(r.monthlyPaymentCLP as number)}
- Lo que recibes de arriendo (neto): ${fCLP(r.netMonthlyRentCLP as number)}
- Diferencia mes a mes: ${fCLP((r.netMonthlyRentCLP as number) - (r.monthlyPaymentCLP as number))}
- Tipo de entrega: ${p.deliveryType === 'future' ? `Entrega en ${p.constructionMonths} meses` : 'Entrega inmediata'}
${(p.gracePeriodMonths as number) > 0 ? `- Gracia hipotecaria: ${p.gracePeriodMonths} meses sin dividendo al inicio` : ''}
${p.guaranteedRentEnabled ? `- Arriendo garantizado: ${fCLP(p.guaranteedRentCLP as number)}/mes por ${p.guaranteedRentMonths} meses desde la entrega` : ''}

SI VENDES EN ${p.analysisYears} AÑOS:
- Escenario moderado: ganarías ${fCLP((r.scenario1 as Record<string, number>).totalReturn)} — un ${fPct((r.scenario1 as Record<string, number>).annualizedRoiPercent)} al año
- Escenario optimista: ganarías ${fCLP((r.scenario2 as Record<string, number>).totalReturn)} — un ${fPct((r.scenario2 as Record<string, number>).annualizedRoiPercent)} al año

INSTRUCCIONES DE TONO Y FORMATO:
- Escribe como si fueras el asesor enviándole un mensaje personal a ${nombre}, no un reporte
- Corto y directo: máximo 200 palabras en total
- Usa **negritas** (con doble asterisco) para resaltar los números clave y las ideas más importantes
- Sin secciones ni títulos — solo 3 párrafos fluidos y naturales
- Que suene humano, cercano, como un mensaje de WhatsApp largo o un email personal

CONCEPTO CLAVE que debes transmitir con naturalidad: aunque el dividendo sea mayor al arriendo, la diferencia no es capital perdido — cada pago al banco está amortizando la deuda, es decir, acumulando patrimonio. Cada mes que pasa, ${nombre} debe menos y es más dueño/a. El arriendo paga una parte, y lo que resta construye riqueza propia. Eso es lo que hace especial a la inversión inmobiliaria.

Escribe exactamente 3 párrafos, sin títulos:
1. Párrafo de enganche: explica la lógica de la inversión de forma simple y cercana, con los números reales. Destaca el concepto de amortización.
2. Párrafo de retorno: menciona cuánto podría crecer tu patrimonio al vender en ${p.analysisYears} años en ambos escenarios. Hazlo emocionante pero honesto.
3. Párrafo de cierre: una frase motivadora y personal que invite a dar el siguiente paso.`;

  try {
    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`\n\nError al generar análisis: ${e}`));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (e) {
    console.error('Insights API error:', e);
    return new Response(`Error al conectar con IA: ${e}`, { status: 500 });
  }
}
