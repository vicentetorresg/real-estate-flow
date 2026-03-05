import { NextRequest } from 'next/server';

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
  let body: { p: Record<string, unknown>; r: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response('Error: body inválido', { status: 400 });
  }

  const { p, r } = body;

  const totalValueUF =
    (p.propertyValueUF as number) +
    (p.parkingCount as number) * (p.parkingValueUF as number) +
    (p.storageCount as number) * (p.storageValueUF as number);

  const years             = p.analysisYears as number;
  const totalCapital      = r.totalNegativeCashFlow as number;
  const gain5pct          = totalCapital * (Math.pow(1.05, years) - 1);
  const gain3pct          = totalCapital * (Math.pow(1.03, years) - 1);
  const s1                = r.scenario1 as Record<string, number>;
  const s2                = r.scenario2 as Record<string, number>;
  const gainCons          = s1.totalReturn;
  const gainOpt           = s2.totalReturn;
  const vsBank5Cons       = gainCons - gain5pct;
  const vsBank5Opt        = gainOpt  - gain5pct;
  const diff              = (r.netMonthlyRentCLP as number) - (r.monthlyPaymentCLP as number);
  const bankLoanCLP       = (p.financingPercent as number) / 100 * totalValueUF * (p.ufValueCLP as number);
  const f1                = (p.scenario1FactorPercent as number) ?? 30;
  const f2                = (p.scenario2FactorPercent as number) ?? 70;
  const commune           = (p.commune as string) || 'la zona';

  // ── Template ─────────────────────────────────────────────────────────────
  // 3 párrafos fijos; los números se calculan directamente (sin IA).
  const text = [
    `El banco financia el **${p.financingPercent}%** (≈ **${fCLP(bankLoanCLP)}**), por lo que tu exposición total es **${fCLP(totalCapital)}** en ${years} años. ` +
    `El dividendo mensual es **${fCLP(r.monthlyPaymentCLP as number)}**; el arriendo neto aporta **${fCLP(r.netMonthlyRentCLP as number)}**, ` +
    `dejando una diferencia de **${fCLP(diff)}/mes** que no es un gasto: es amortización directa de deuda. ` +
    `Cada cuota reduce el saldo hipotecario y construye patrimonio, con independencia de la plusvalía de ${commune}.`,

    `Trabajamos con escenarios conservadores — **${f1}%** y **${f2}%** del potencial de plusvalía de la zona — y en ${years} años los números son: ` +
    `escenario moderado **${fCLP(gainCons)}** (**${fPct(s1.annualizedRoiPercent)} anual**), escenario optimista **${fCLP(gainOpt)}** (**${fPct(s2.annualizedRoiPercent)} anual**). ` +
    `El mismo capital depositado a plazo al 5% anual habría generado **${fCLP(gain5pct)}**; al 3%, apenas **${fCLP(gain3pct)}**. ` +
    `La diferencia a tu favor es **${fCLP(vsBank5Cons)}** en el escenario conservador y **${fCLP(vsBank5Opt)}** en el optimista.`,

    `Tengo los números detallados y puedo resolver cualquier duda sobre el flujo mensual o los supuestos de revalorización.`,
  ].join('\n\n');

  // ── Stream palabra a palabra (efecto de escritura) ────────────────────────
  const encoder = new TextEncoder();
  const chunks  = text.match(/\S+\s*/g) ?? [];

  const readable = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise(res => setTimeout(res, 15));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
