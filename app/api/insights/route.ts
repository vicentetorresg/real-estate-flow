import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fCLP(v: number) {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v), s = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 100_000) return `${s}$${Math.round(abs / 1000)}k`;
  return `${s}$${Math.round(abs).toLocaleString('es-CL')}`;
}
function fPct(v: number) { return `${v.toFixed(1)}%`; }

export async function POST(req: NextRequest) {
  const { p, r } = await req.json();

  const totalValueUF = p.propertyValueUF + p.parkingCount * p.parkingValueUF + p.storageCount * p.storageValueUF;
  const nombre = p.clientName ? p.clientName.split(' ')[0] : 'ti';

  const prompt = `Eres un asesor inmobiliario amable, cercano y honesto. Acabas de preparar una simulación personalizada para ${nombre} y quieres explicarle, en palabras simples y cálidas, qué significa esta inversión para su futuro.

Escribe como si le hablaras directamente a ${nombre}. Usa "tú". Sin tecnicismos. Sin jerga financiera compleja. Como si le explicaras a un amigo/a que nunca ha invertido antes. Sé motivador/a, pero honesto/a — usa los números reales.

DATOS DE LA SIMULACIÓN:
- Proyecto: ${p.projectName || 'Propiedad'} · ${p.commune || ''}
- Valor: UF ${totalValueUF.toFixed(0)} (≈ ${fCLP(totalValueUF * p.ufValueCLP)})
- Lo que pones tú al inicio: UF ${Number(r.clientPieUF).toFixed(1)} (${fCLP(r.clientPieUF * p.ufValueCLP)})
- Lo que pagas al banco cada mes (dividendo): ${fCLP(r.monthlyPaymentCLP)}
- Lo que recibes de arriendo (neto): ${fCLP(r.netMonthlyRentCLP)}
- Diferencia mes a mes: ${fCLP(r.netMonthlyRentCLP - r.monthlyPaymentCLP)}
- Tipo de entrega: ${p.deliveryType === 'future' ? `Entrega en ${p.constructionMonths} meses` : 'Entrega inmediata'}
${p.gracePeriodMonths > 0 ? `- Gracia hipotecaria: ${p.gracePeriodMonths} meses sin dividendo al inicio` : ''}
${p.guaranteedRentEnabled ? `- Arriendo garantizado: ${fCLP(p.guaranteedRentCLP)}/mes por ${p.guaranteedRentMonths} meses desde la entrega` : ''}

SI VENDES EN ${p.analysisYears} AÑOS:
- Escenario moderado: ganarías ${fCLP(r.scenario1.totalReturn)} — un ${fPct(r.scenario1.annualizedRoiPercent)} al año
- Escenario optimista: ganarías ${fCLP(r.scenario2.totalReturn)} — un ${fPct(r.scenario2.annualizedRoiPercent)} al año

Escribe el análisis con estas secciones (usa ## para los títulos, sin asteriscos ni bullet points — solo texto fluido):

## ¿Por qué esta inversión tiene sentido para ti?
Explícale a ${nombre} en 2-3 oraciones simples por qué esto es una oportunidad real. Menciona que el arriendo ayuda a pagar parte del dividendo, y que con el tiempo la propiedad vale más.

## ¿Qué pasa cada mes?
Explica en lenguaje cotidiano cuánto paga y cuánto recibe. Cuál es la diferencia real. Si hay período de gracia o arriendo garantizado, explica cómo eso ayuda al inicio.

## ¿Cuánto puede crecer tu patrimonio?
Explica los dos escenarios de manera simple. Compara el retorno con algo que ${nombre} entienda, como tener el dinero en el banco. Hazlo motivador pero realista.

## Lo mejor de esta oportunidad
3 puntos concretos y positivos, escritos de forma cercana. Sin bullets — escríbelos como párrafos cortos separados.

## El próximo paso es tuyo
Cierra con 2-3 oraciones cálidas y motivadoras. Invita a ${nombre} a resolver sus dudas con el asesor y a dar el siguiente paso con confianza.`;

  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
