'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type DeliveryType = 'immediate' | 'future';

interface SimulationParams {
  // Propiedad
  propertyValueUF: number;
  commune: string;
  ufValueCLP: number;
  ufAnnualGrowthPercent: number;

  // Entrega
  deliveryType: DeliveryType;
  constructionMonths: number;   // meses pre-escritura (solo para 'future')

  // Crédito hipotecario
  financingPercent: number;     // % banco
  annualRatePercent: number;
  loanTermYears: number;
  gracePeriodMonths: number;    // meses de gracia post-escritura

  // Estructura del pie (todos en % del valor de la propiedad)
  bonoPiePercent: number;       // % que paga el desarrollador (bono)
  // pie real cliente = max(0, (100-financingPercent) - bonoPiePercent)
  clientPieUpfrontPct: number;  // % del pie cliente pagado al contado (up front)
  // el resto del pie cliente se paga en cuotas:
  clientPieCuotasCount: number; // n° de cuotas mensuales

  // Arriendo
  monthlyRentCLP: number;
  managementFeePercent: number;

  // Análisis
  analysisYears: number;
  appreciationScenario1Percent: number;
  appreciationScenario2Percent: number;
  saleCostPercent: number;
  startMonth: number;
  startYear: number;
}

type Phase = 'pre-delivery' | 'grace' | 'active';

interface MonthlyData {
  month: number;          // 0 = promesa/escritura (upfront), 1..N = meses
  date: string;
  dateShort: string;
  ufValue: number;
  phase: Phase;

  // Ingresos
  grossRent: number;
  managementFee: number;
  netRent: number;

  // Pie
  pieCuota: number;       // cuota mensual del pie (sólo en meses 1-N)
  pieUpfront: number;     // pago al contado (sólo en mes 0)

  // Dividendo
  dividend: number;
  interest: number;
  principal: number;

  // Flujo
  netCashFlow: number;
  cumulativeCashFlow: number;

  // Balance
  outstandingBalanceUF: number;
  outstandingBalanceCLP: number;
  propertyValueCLP: number;
  equityCLP: number;
}

interface ScenarioResult {
  appreciationPercent: number;
  salePriceUF: number;
  salePriceCLP: number;
  outstandingBalanceUF: number;
  outstandingBalanceCLP: number;
  grossEquityCLP: number;
  saleCostsCLP: number;
  netEquityCLP: number;
  cumulativeCashFlow: number;
  totalReturn: number;
  totalInvested: number;
  roiPercent: number;
  annualizedRoiPercent: number;
  equityMultiple: number;
}

interface SimulationResult {
  params: SimulationParams;
  // Pie desglose
  totalPiePct: number;
  bonoPieUF: number;
  clientPieUF: number;
  clientPieUpfrontUF: number;
  clientPieCuotasUF: number;
  monthlyCuotaUF: number;
  // Hipoteca
  loanUF: number;
  monthlyPaymentUF: number;
  monthlyPaymentCLP: number;
  // Renta
  netMonthlyRentCLP: number;
  capRatePercent: number;
  // Timeline
  escrituraMonth: number;     // mes del array en que ocurre escritura (0 = mes 0 para inmediata)
  firstDividendMonth: number;
  rentStartMonth: number;
  totalTableMonths: number;
  // Datos
  monthlyData: MonthlyData[]; // incluye mes 0 (upfront)
  scenario1: ScenarioResult;
  scenario2: ScenarioResult;
  totalNegativeCashFlow: number;
  avgMonthlyCashFlow: number;
  propertyValueCLP: number;
}

// ─────────────────────────────────────────────────────────────
// MATH
// ─────────────────────────────────────────────────────────────
function calcPMT(p: number, rAnnual: number, n: number): number {
  const r = rAnnual / 100 / 12;
  if (r === 0) return p / n;
  return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcBalance(p: number, rAnnual: number, n: number, paid: number): number {
  if (paid <= 0) return p;
  if (paid >= n) return 0;
  const r = rAnnual / 100 / 12;
  if (r === 0) return p * (1 - paid / n);
  const pmt = calcPMT(p, rAnnual, n);
  return p * Math.pow(1 + r, paid) - (pmt * (Math.pow(1 + r, paid) - 1)) / r;
}

// ─────────────────────────────────────────────────────────────
// DATES
// ─────────────────────────────────────────────────────────────
const MS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ML = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function addMonths(month: number, year: number, n: number) {
  const t = year * 12 + month + n;
  return { month: t % 12, year: Math.floor(t / 12) };
}
function dateLabel(month: number, year: number, short = false) {
  return short ? `${MS[month]} '${String(year).slice(2)}` : `${ML[month]} ${year}`;
}

// ─────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────
function fCLP(v: number, compact = true): string {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v), s = v < 0 ? '-' : '';
  if (compact && abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (compact && abs >= 100_000)   return `${s}$${Math.round(abs / 1000)}k`;
  return `${s}$${Math.round(abs).toLocaleString('es-CL')}`;
}
function fCLPFull(v: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
}
function fUF(v: number, d = 2) {
  return `UF ${v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
function fPct(v: number, d = 2) {
  if (!isFinite(v)) return '∞';
  return `${v.toFixed(d).replace('.', ',')}%`;
}

// ─────────────────────────────────────────────────────────────
// SIMULATOR
// ─────────────────────────────────────────────────────────────
function runSimulation(p: SimulationParams): SimulationResult {
  const loanTermMonths  = p.loanTermYears * 12;
  const ufGrowth        = Math.pow(1 + p.ufAnnualGrowthPercent / 100, 1 / 12) - 1;

  // ── Pie desglose ──────────────────────────────────────────
  const totalPiePct       = 100 - p.financingPercent;
  const bonoPiePct        = Math.min(p.bonoPiePercent, totalPiePct);
  const clientPiePct      = Math.max(0, totalPiePct - bonoPiePct);
  const loanUF            = p.propertyValueUF * (p.financingPercent / 100);
  const bonoPieUF         = p.propertyValueUF * (bonoPiePct / 100);
  const clientPieUF       = p.propertyValueUF * (clientPiePct / 100);
  const clientPieUpfrontUF = clientPieUF * (p.clientPieUpfrontPct / 100);
  const clientPieCuotasUF  = clientPieUF - clientPieUpfrontUF;
  const monthlyCuotaUF    = p.clientPieCuotasCount > 0 ? clientPieCuotasUF / p.clientPieCuotasCount : 0;

  // ── Hipoteca ──────────────────────────────────────────────
  const monthlyPaymentUF  = calcPMT(loanUF, p.annualRatePercent, loanTermMonths);
  const monthlyPaymentCLP = monthlyPaymentUF * p.ufValueCLP;

  // ── Renta ─────────────────────────────────────────────────
  const managementRate    = p.managementFeePercent / 100;
  const netMonthlyRentCLP = p.monthlyRentCLP * (1 - managementRate);
  const propertyValueCLP  = p.propertyValueUF * p.ufValueCLP;
  const capRatePercent    = ((netMonthlyRentCLP * 12) / propertyValueCLP) * 100;

  // ── Timeline ─────────────────────────────────────────────
  // Para 'immediate': escritura = mes 0, cuotas del pie en meses 1..N
  // Para 'future':    cuotas del pie en meses 1..constructionMonths, escritura = mes constructionMonths
  const preDeliveryMonths  = p.deliveryType === 'future' ? p.constructionMonths : 0;
  const escrituraMonth     = preDeliveryMonths;                              // índice (base 0)
  const rentStartMonth     = preDeliveryMonths + 1;                          // 1-indexed dentro del array
  const firstDividendMonth = preDeliveryMonths + p.gracePeriodMonths + 1;
  const totalTableMonths   = preDeliveryMonths + p.analysisYears * 12;

  // ── Mes 0: upfront + inicio ──────────────────────────────
  const ufVal0 = p.ufValueCLP;
  const upfrontCLP = clientPieUpfrontUF * ufVal0;

  const month0: MonthlyData = {
    month: 0,
    date: dateLabel(p.startMonth, p.startYear),
    dateShort: dateLabel(p.startMonth, p.startYear, true),
    ufValue: ufVal0, phase: 'pre-delivery',
    grossRent: 0, managementFee: 0, netRent: 0,
    pieCuota: 0, pieUpfront: upfrontCLP,
    dividend: 0, interest: 0, principal: 0,
    netCashFlow: -upfrontCLP,
    cumulativeCashFlow: -upfrontCLP,
    outstandingBalanceUF: loanUF, outstandingBalanceCLP: loanUF * ufVal0,
    propertyValueCLP, equityCLP: propertyValueCLP - loanUF * ufVal0,
  };

  // ── Meses 1..totalTableMonths ─────────────────────────────
  const data: MonthlyData[] = [month0];
  let cumCashFlow     = -upfrontCLP;
  let mortgagePaid    = 0;

  for (let m = 1; m <= totalTableMonths; m++) {
    const { month: cm, year: cy } = addMonths(p.startMonth, p.startYear, m);
    const ufVal = p.ufValueCLP * Math.pow(1 + ufGrowth, m);

    // Fase
    const isPreDelivery = m <= preDeliveryMonths;
    const isGrace       = !isPreDelivery && m < firstDividendMonth;
    const phase: Phase  = isPreDelivery ? 'pre-delivery' : isGrace ? 'grace' : 'active';

    // Arriendo (disponible desde rentStartMonth)
    const grossRent     = m >= rentStartMonth ? p.monthlyRentCLP : 0;
    const managementFee = grossRent * managementRate;
    const netRent       = grossRent - managementFee;

    // Cuota pie (sólo en meses 1..clientPieCuotasCount)
    const pieCuota = m >= 1 && m <= p.clientPieCuotasCount ? monthlyCuotaUF * ufVal : 0;

    // Dividendo (sólo desde firstDividendMonth)
    let dividend = 0, interest = 0, principal = 0;
    if (m >= firstDividendMonth) {
      dividend  = monthlyPaymentUF * ufVal;
      const r   = p.annualRatePercent / 100 / 12;
      const bal = calcBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaid);
      interest  = bal * r * ufVal;
      principal = dividend - interest;
      mortgagePaid++;
    }

    const netCashFlow = netRent - pieCuota - dividend;
    cumCashFlow += netCashFlow;

    const outstandingBalanceUF  = calcBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaid);
    const outstandingBalanceCLP = outstandingBalanceUF * ufVal;
    const propValCLP            = p.propertyValueUF * ufVal;

    data.push({
      month: m, date: dateLabel(cm, cy), dateShort: dateLabel(cm, cy, true),
      ufValue: ufVal, phase,
      grossRent, managementFee, netRent,
      pieCuota, pieUpfront: 0,
      dividend, interest, principal,
      netCashFlow, cumulativeCashFlow: cumCashFlow,
      outstandingBalanceUF, outstandingBalanceCLP,
      propertyValueCLP: propValCLP,
      equityCLP: propValCLP - outstandingBalanceCLP,
    });
  }

  // ── Escenarios de venta ──────────────────────────────────
  function calcScenario(aprecPct: number): ScenarioResult {
    const last = data[data.length - 1];
    const salePriceUF       = p.propertyValueUF * (1 + aprecPct / 100);
    const salePriceCLP      = salePriceUF * last.ufValue;
    const grossEquityCLP    = salePriceCLP - last.outstandingBalanceCLP;
    const saleCostsCLP      = salePriceCLP * (p.saleCostPercent / 100);
    const netEquityCLP      = grossEquityCLP - saleCostsCLP;

    // Inversión total = pagos negativos (pie upfront + cuotas + top-ups)
    const totalInvested = data.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), 0);
    const totalReturn   = netEquityCLP + last.cumulativeCashFlow;
    const roi           = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : Infinity;
    const annRoi        = totalInvested > 0 ? (Math.pow(1 + roi / 100, 1 / p.analysisYears) - 1) * 100 : Infinity;
    const em            = totalInvested > 0 ? (totalReturn + totalInvested) / totalInvested : Infinity;

    return {
      appreciationPercent: aprecPct,
      salePriceUF, salePriceCLP,
      outstandingBalanceUF: last.outstandingBalanceUF,
      outstandingBalanceCLP: last.outstandingBalanceCLP,
      grossEquityCLP, saleCostsCLP, netEquityCLP,
      cumulativeCashFlow: last.cumulativeCashFlow,
      totalReturn, totalInvested,
      roiPercent: roi, annualizedRoiPercent: annRoi, equityMultiple: em,
    };
  }

  const totalNeg = data.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), 0);
  const avgFlow  = data.slice(1).reduce((s, d) => s + d.netCashFlow, 0) / totalTableMonths;

  return {
    params: p, totalPiePct, bonoPieUF, clientPieUF,
    clientPieUpfrontUF, clientPieCuotasUF, monthlyCuotaUF,
    loanUF, monthlyPaymentUF, monthlyPaymentCLP,
    netMonthlyRentCLP, capRatePercent,
    escrituraMonth, firstDividendMonth, rentStartMonth, totalTableMonths,
    monthlyData: data,
    scenario1: calcScenario(p.appreciationScenario1Percent),
    scenario2: calcScenario(p.appreciationScenario2Percent),
    totalNegativeCashFlow: totalNeg,
    avgMonthlyCashFlow: avgFlow,
    propertyValueCLP,
  };
}

// ─────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────
const DEFAULTS: SimulationParams = {
  propertyValueUF: 3000, commune: 'Cerrillos',
  ufValueCLP: 38500, ufAnnualGrowthPercent: 3.5,
  deliveryType: 'immediate', constructionMonths: 24,
  financingPercent: 90, annualRatePercent: 4.0, loanTermYears: 30, gracePeriodMonths: 3,
  bonoPiePercent: 10,
  clientPieUpfrontPct: 0,   // con bono pie = 10%, cliente no paga nada
  clientPieCuotasCount: 24,
  monthlyRentCLP: 450000, managementFeePercent: 7,
  analysisYears: 5,
  appreciationScenario1Percent: 30, appreciationScenario2Percent: 70,
  saleCostPercent: 2.5, startMonth: 2, startYear: 2026,
};

// ─────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #bfdbfe', borderRadius: 14 };
const INPUT_S: React.CSSProperties = {
  width: '100%', background: '#f0f7ff', border: '1px solid #bfdbfe',
  borderRadius: 8, padding: '7px 10px', fontSize: 12, color: '#0f2957', outline: 'none',
};

function KpiCard({ label, value, sub, type = 'default', icon }: {
  label: string; value: string; sub?: string;
  type?: 'default' | 'positive' | 'negative' | 'blue' | 'sky'; icon?: string;
}) {
  const clr = { default: '#0f2957', positive: '#15803d', negative: '#dc2626', blue: '#1d4ed8', sky: '#0284c7' };
  return (
    <div style={{ ...CARD, padding: '12px 14px' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}
      </p>
      <p style={{ fontSize: 17, fontWeight: 800, color: clr[type], lineHeight: 1.2 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: '#93b4d4', marginTop: 1 }}>{sub}</p>}
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#4a7abf' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

type TTP = { name: string; value: number; color: string };
function ChartTip({ active, payload, label }: { active?: boolean; payload?: TTP[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 20px #2563eb15', fontSize: 11 }}>
      <p style={{ fontWeight: 700, color: '#0f2957', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 2 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: p.color }}>{fCLP(p.value, false)}</span>
        </div>
      ))}
    </div>
  );
}

function ScenariosComparison({ R, p }: { R: SimulationResult; p: SimulationParams }) {
  const escrituraMes = addMonths(p.startMonth, p.startYear,
    p.deliveryType === 'future' ? p.constructionMonths : 0);
  const { month: sm, year: sy } = addMonths(escrituraMes.month, escrituraMes.year, p.analysisYears * 12);
  const ventaLabel = `Venta ${ML[sm]} ${sy}`;

  const s1 = R.scenario1;
  const s2 = R.scenario2;

  type RowDef = { label: string; v1: string; v2: string; bold?: boolean; section?: boolean };
  const rows: RowDef[] = [
    { label: 'Plusvalía', v1: `+${p.appreciationScenario1Percent}%`, v2: `+${p.appreciationScenario2Percent}%`, bold: true },
    { label: 'Precio de venta', v1: fUF(s1.salePriceUF, 0), v2: fUF(s2.salePriceUF, 0) },
    { label: '', v1: fCLP(s1.salePriceCLP, false), v2: fCLP(s2.salePriceCLP, false) },
    { label: 'Deuda pendiente', v1: fUF(s1.outstandingBalanceUF, 0), v2: fUF(s2.outstandingBalanceUF, 0) },
    { label: 'Equity bruto', v1: fCLP(s1.grossEquityCLP, false), v2: fCLP(s2.grossEquityCLP, false) },
    { label: `Gastos venta (${p.saleCostPercent}%)`, v1: `-${fCLP(s1.saleCostsCLP, false)}`, v2: `-${fCLP(s2.saleCostsCLP, false)}` },
    { label: 'Patrimonio neto venta', v1: fCLP(s1.netEquityCLP, false), v2: fCLP(s2.netEquityCLP, false), bold: true },
    { label: 'Flujo acumulado', v1: fCLP(s1.cumulativeCashFlow, false), v2: fCLP(s2.cumulativeCashFlow, false) },
    { label: 'Total invertido', v1: `-${fCLP(s1.totalInvested, false)}`, v2: `-${fCLP(s2.totalInvested, false)}` },
    { label: 'Retorno total neto', v1: fCLP(s1.totalReturn, false), v2: fCLP(s2.totalReturn, false), bold: true },
    { label: 'ROI total', v1: fPct(s1.roiPercent, 0), v2: fPct(s2.roiPercent, 0), bold: true },
    { label: 'ROI anualizado', v1: fPct(s1.annualizedRoiPercent, 1), v2: fPct(s2.annualizedRoiPercent, 1) },
    { label: 'Equity múltiplo', v1: `${isFinite(s1.equityMultiple) ? s1.equityMultiple.toFixed(1) : '∞'}x`, v2: `${isFinite(s2.equityMultiple) ? s2.equityMultiple.toFixed(1) : '∞'}x` },
  ];

  return (
    <div style={{ ...CARD, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#1d4ed8', borderBottom: '2px solid #1e40af' }}>
        <div style={{ padding: '10px 14px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Comparación de Escenarios</p>
          <p style={{ fontSize: 10, color: '#bfdbfe' }}>{ventaLabel}</p>
        </div>
        {[
          { label: 'Escenario Conservador', pct: p.appreciationScenario1Percent, value: fCLP(s1.netEquityCLP, false), color: '#60a5fa' },
          { label: 'Escenario Optimista',   pct: p.appreciationScenario2Percent, value: fCLP(s2.netEquityCLP, false), color: '#34d399' },
        ].map(({ label, pct, value, color }) => (
          <div key={label} style={{ padding: '10px 14px', borderLeft: '1px solid #1e40af', textAlign: 'right' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: 10, color: '#93c5fd' }}>+{pct}% plusvalía</p>
            <p style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1.2 }}>{value}</p>
            <p style={{ fontSize: 9, color: '#93c5fd' }}>patrimonio neto</p>
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          background: row.bold ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#f8fbff',
          borderBottom: '1px solid #dbeafe',
        }}>
          <div style={{ padding: '6px 14px', fontSize: 11, color: '#6b93c4', fontWeight: row.bold ? 700 : 400 }}>
            {row.label}
          </div>
          {[row.v1, row.v2].map((v, j) => {
            const isNeg = v.startsWith('-');
            const isBig = row.bold && !v.startsWith('+') && !v.startsWith('-') && !v.endsWith('x') && !v.endsWith('%');
            const color = row.label === 'Plusvalía' ? (j === 0 ? '#1d4ed8' : '#0284c7')
              : isNeg ? '#dc2626'
              : isBig ? (j === 0 ? '#1d4ed8' : '#0284c7')
              : row.bold ? '#0f2957'
              : '#334d6e';
            return (
              <div key={j} style={{
                padding: '6px 14px', fontSize: 11, fontFamily: 'monospace',
                fontWeight: row.bold ? 700 : 500,
                color, textAlign: 'right',
                borderLeft: '1px solid #dbeafe',
              }}>
                {v}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TABLA HORIZONTAL (conceptos = filas, meses = columnas)
// ─────────────────────────────────────────────────────────────
function FlowTable({ data, p, R }: { data: MonthlyData[]; p: SimulationParams; R: SimulationResult }) {
  const COL_W = 92;
  const LABEL_W = 210;

  // Colores por fase
  function colBg(d: MonthlyData) {
    if (d.month === 0) return '#faf5ff';           // promesa
    if (d.phase === 'pre-delivery') return '#fff7ed'; // construcción
    if (d.phase === 'grace')        return '#f0fdf4'; // gracia
    return '#fff';
  }
  function headerBg(d: MonthlyData) {
    if (d.month === 0) return '#7c3aed';
    if (d.phase === 'pre-delivery') return '#d97706';
    if (d.phase === 'grace')        return '#16a34a';
    return '#1d4ed8';
  }

  // Badge de fase en header
  function phaseBadge(d: MonthlyData) {
    if (d.month === 0) return 'Promesa';
    if (d.phase === 'pre-delivery') return 'Obra';
    if (d.phase === 'grace')        return 'Gracia';
    return null;
  }

  type RowDef = {
    label: string;
    type: 'section' | 'income' | 'expense' | 'subtotal' | 'result' | 'balance' | 'info';
    fn: (d: MonthlyData) => number | string | null;
  };

  const rows: RowDef[] = [
    { label: 'INGRESOS', type: 'section', fn: () => null },
    { label: 'Arriendo bruto', type: 'income', fn: d => d.grossRent },

    { label: 'GASTOS OPERACIONALES', type: 'section', fn: () => null },
    { label: `Adm. inmobiliaria (${p.managementFeePercent}%)`, type: 'expense', fn: d => -d.managementFee },
    { label: 'Arriendo neto', type: 'subtotal', fn: d => d.netRent },

    { label: 'INVERSIÓN PIE', type: 'section', fn: () => null },
    { label: 'Pie up front (contado)', type: 'expense', fn: d => d.pieUpfront > 0 ? -d.pieUpfront : null },
    { label: `Cuota pie (${p.clientPieCuotasCount} cuotas)`, type: 'expense', fn: d => d.pieCuota > 0 ? -d.pieCuota : null },

    { label: 'DIVIDENDO HIPOTECARIO', type: 'section', fn: () => null },
    { label: 'Fase', type: 'info',
      fn: d => {
        if (d.month === 0) return 'Promesa';
        if (d.phase === 'pre-delivery') return 'Construcción';
        if (d.phase === 'grace') return '⏸ Gracia';
        return null;
      }
    },
    { label: 'Interés bancario', type: 'expense', fn: d => d.interest > 0 ? -d.interest : null },
    { label: 'Amortización capital', type: 'expense', fn: d => d.principal > 0 ? -d.principal : null },
    { label: 'Dividendo total', type: 'expense', fn: d => d.dividend > 0 ? -d.dividend : null },

    { label: 'FLUJO MENSUAL', type: 'section', fn: () => null },
    { label: 'Flujo neto del mes', type: 'result', fn: d => d.netCashFlow },
    { label: 'Flujo acumulado', type: 'result', fn: d => d.cumulativeCashFlow },

    { label: 'BALANCE AL CIERRE', type: 'section', fn: () => null },
    { label: 'UF del período', type: 'balance', fn: d => d.ufValue },
    { label: 'Saldo deuda (UF)', type: 'balance', fn: d => d.outstandingBalanceUF },
    { label: 'Saldo deuda (CLP)', type: 'balance', fn: d => d.outstandingBalanceCLP },
    { label: 'Patrimonio neto', type: 'balance', fn: d => d.equityCLP },
  ];

  function formatVal(row: RowDef, raw: number | string | null, d: MonthlyData): string {
    if (raw === null) return '';
    if (typeof raw === 'string') return raw;
    const v = raw as number;
    if (row.label.includes('UF del período')) return `$${Math.round(v).toLocaleString('es-CL')}`;
    if (row.label.includes('(UF)'))           return fUF(v, 0);
    return fCLP(v);
  }

  function cellColor(row: RowDef, raw: number | string | null): string {
    if (raw === null || typeof raw === 'string') return '#6b93c4';
    const v = raw as number;
    if (row.type === 'income')   return '#15803d';
    if (row.type === 'expense')  return v === 0 ? '#cbd5e1' : '#dc2626';
    if (row.type === 'subtotal') return '#0369a1';
    if (row.type === 'result')   return v >= 0 ? '#15803d' : '#dc2626';
    if (row.type === 'balance')  return '#1d4ed8';
    return '#0f2957';
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid #bfdbfe', background: '#fff' }}>
      <div style={{ minWidth: LABEL_W + COL_W * data.length }}>
        <table className="flow-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            {/* Row 1: fase badge */}
            <tr>
              <th style={{ width: LABEL_W, minWidth: LABEL_W, background: '#1a46c8', position: 'sticky', left: 0, zIndex: 4 }} />
              {data.map(d => {
                const badge = phaseBadge(d);
                return (
                  <th key={d.month} style={{ minWidth: COL_W, background: headerBg(d), textAlign: 'center', padding: '3px 2px', borderLeft: '1px solid #ffffff20' }}>
                    {badge && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: '#ffffff30', padding: '1px 6px', borderRadius: 8 }}>
                        {badge}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
            {/* Row 2: fecha */}
            <tr>
              <th style={{
                background: '#1a46c8', color: '#fff', textAlign: 'left',
                padding: '8px 14px', fontSize: 10, fontWeight: 700,
                position: 'sticky', left: 0, zIndex: 4,
              }}>
                Concepto
              </th>
              {data.map(d => (
                <th key={d.month} style={{
                  minWidth: COL_W, textAlign: 'center', padding: '6px 4px',
                  fontSize: 10, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap',
                  background: headerBg(d), borderLeft: '1px solid #ffffff20',
                  borderBottom: '2px solid #ffffff40',
                }}>
                  {d.month === 0 ? (
                    <span>{d.dateShort}<br />
                      <span style={{ fontSize: 8, opacity: 0.8 }}>
                        {p.deliveryType === 'future' ? 'Promesa' : 'Escritura'}
                      </span>
                    </span>
                  ) : d.dateShort}
                  {d.phase === 'active' && d.month === R.firstDividendMonth && (
                    <span style={{ display: 'block', fontSize: 8, color: '#fde68a' }}>1er div.</span>
                  )}
                  {p.deliveryType === 'future' && d.month === R.escrituraMonth && d.month > 0 && (
                    <span style={{ display: 'block', fontSize: 8, color: '#fde68a' }}>Escritura</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const isSection = row.type === 'section';
              const rowBg = isSection ? '#dbeafe' : row.type === 'result' ? '#eff6ff' : row.type === 'subtotal' ? '#f0f9ff' : '#fff';
              return (
                <tr key={ri}>
                  <td style={{
                    padding: isSection ? '6px 14px' : '4px 14px',
                    fontWeight: isSection ? 700 : row.type === 'result' ? 700 : 500,
                    fontSize: isSection ? 9 : 11,
                    color: isSection ? '#1d4ed8' : '#334d6e',
                    textTransform: isSection ? 'uppercase' : 'none',
                    letterSpacing: isSection ? '0.08em' : 'normal',
                    background: rowBg,
                    borderRight: '2px solid #bfdbfe',
                    whiteSpace: 'nowrap',
                    position: 'sticky', left: 0, zIndex: 2,
                  }}>
                    {row.label}
                  </td>
                  {data.map(d => {
                    const raw = row.fn(d);
                    const display = formatVal(row, raw, d);
                    const color = cellColor(row, raw);
                    const bg = isSection ? rowBg : colBg(d);
                    return (
                      <td key={d.month} style={{
                        textAlign: 'right', padding: '4px 8px',
                        fontFamily: isSection ? 'inherit' : 'monospace',
                        fontWeight: row.type === 'result' ? 700 : 500,
                        fontSize: isSection ? 0 : 11,
                        color, background: bg, whiteSpace: 'nowrap',
                        borderLeft: '1px solid #f0f4ff',
                      }}>
                        {row.type === 'info'
                          ? (typeof raw === 'string'
                            ? <span style={{ fontSize: 9, fontFamily: 'inherit', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8' }}>{raw}</span>
                            : '')
                          : display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export default function Home() {
  const [p, setP] = useState<SimulationParams>(DEFAULTS);
  const [tab, setTab] = useState<'prop' | 'credit' | 'pie' | 'rent' | 'exit'>('credit');

  const set = useCallback(<K extends keyof SimulationParams>(k: K, v: SimulationParams[K]) =>
    setP(prev => ({ ...prev, [k]: v })), []);

  const R = useMemo(() => runSimulation(p), [p]);

  // Fechas clave
  const escrituraMes = addMonths(p.startMonth, p.startYear,
    p.deliveryType === 'future' ? p.constructionMonths : 0);
  const { month: fdm, year: fdy } = addMonths(escrituraMes.month, escrituraMes.year, p.gracePeriodMonths + 1);
  const firstDividendLabel = `${ML[fdm]} ${fdy}`;

  // Chart data (sólo post-escritura para flujo)
  const chartData = R.monthlyData.slice(R.escrituraMonth).map(d => ({
    name: d.dateShort,
    'Flujo neto': d.netCashFlow,
    'Arr. neto': d.netRent,
    'Dividendo': -d.dividend,
    'Acumulado': d.cumulativeCashFlow,
  }));

  const equityData = R.monthlyData.map(d => ({
    name: d.dateShort,
    'Propiedad': +(d.propertyValueCLP / 1_000_000).toFixed(1),
    'Deuda': +(d.outstandingBalanceCLP / 1_000_000).toFixed(1),
    'Patrimonio': +(d.equityCLP / 1_000_000).toFixed(1),
  }));

  const cuotaLabel = R.monthlyCuotaUF > 0
    ? `${fUF(R.monthlyCuotaUF)} · ${p.clientPieCuotasCount} cuotas`
    : 'Sin cuotas';

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7ff' }}>

      {/* HEADER */}
      <header style={{
        background: 'linear-gradient(135deg, #1d4ed8, #0284c7)',
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 2px 20px #1d4ed840',
      }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '10px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: '#1d4ed8' }}>P</div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1 }}>Simulador de Inversión Inmobiliaria</h1>
              <p style={{ fontSize: 10, color: '#93c5fd' }}>
                {p.commune} · {ML[p.startMonth]} {p.startYear} ·{' '}
                {p.deliveryType === 'immediate' ? 'Entrega Inmediata' : `Entrega Futura (${p.constructionMonths} meses obra)`}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
            <span style={{ color: '#bfdbfe' }}>🏦 1er dividendo: <strong style={{ color: '#fff' }}>{firstDividendLabel}</strong></span>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#ffffff25', color: '#fff', padding: '4px 12px', borderRadius: 20, border: '1px solid #ffffff40' }}>
              {fUF(p.propertyValueUF, 0)} · UF ${p.ufValueCLP.toLocaleString('es-CL')}
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '18px 16px' }}>

        {/* KPI STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          <KpiCard label="Dividendo mensual" icon="🏦" value={fCLP(R.monthlyPaymentCLP, false)}
            sub={`${fUF(R.monthlyPaymentUF)} / mes`} type="blue" />
          <KpiCard label="Arriendo neto" icon="🏠" value={fCLPFull(R.netMonthlyRentCLP)}
            sub={`Bruto ${fCLPFull(p.monthlyRentCLP)} · adm ${p.managementFeePercent}%`} type="sky" />
          <KpiCard label="Flujo mensual prom." icon={R.avgMonthlyCashFlow >= 0 ? '📈' : '📉'}
            value={fCLP(R.avgMonthlyCashFlow, false)} sub="promedio período análisis"
            type={R.avgMonthlyCashFlow >= 0 ? 'positive' : 'negative'} />
          <KpiCard label="Cap Rate" icon="💹" value={fPct(R.capRatePercent)}
            sub="Renta anual neta / valor dpto" type="blue" />
          <KpiCard label="Pie cliente total" icon="💰"
            value={R.clientPieUF === 0 ? '$0 — cubierto ✅' : fUF(R.clientPieUF, 0)}
            sub={R.clientPieUF > 0 ? `${fCLP(R.clientPieUpfrontUF * p.ufValueCLP, false)} contado + cuotas` : `Bono pie cubre el ${p.bonoPiePercent}%`}
            type={R.clientPieUF === 0 ? 'positive' : 'sky'} />
          <KpiCard label="Cuota pie / mes" icon="📅"
            value={R.monthlyCuotaUF > 0 ? fCLPFull(R.monthlyCuotaUF * p.ufValueCLP) : '$0'}
            sub={cuotaLabel} type={R.monthlyCuotaUF > 0 ? 'negative' : 'positive'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── SIDEBAR ─────────────────────────────────── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={CARD}>
              <div style={{ padding: '14px 16px 8px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Parámetros</p>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 3, background: '#eff6ff', borderRadius: 10, padding: 4 }}>
                  {([['prop','🏢 Dpto'],['credit','🏦 Crédito'],['pie','💰 Pie'],['rent','🏠 Arriendo'],['exit','📊 Salida']] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setTab(k)} style={{
                      flex: 1, fontSize: 9, fontWeight: 600, padding: '5px 3px', borderRadius: 7,
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: tab === k ? '#1d4ed8' : 'transparent',
                      color: tab === k ? '#fff' : '#6b93c4',
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>

              <div style={{ padding: '4px 16px 16px' }}>

                {/* ── TAB: PROPIEDAD ── */}
                {tab === 'prop' && <>
                  <Slider label="Valor propiedad" value={p.propertyValueUF} min={1000} max={10000} step={100}
                    display={fUF(p.propertyValueUF, 0)} onChange={v => set('propertyValueUF', v)} />
                  <Slider label="Valor UF actual (CLP)" value={p.ufValueCLP} min={35000} max={45000} step={500}
                    display={`$${p.ufValueCLP.toLocaleString('es-CL')}`} onChange={v => set('ufValueCLP', v)} />
                  <Slider label="Crecimiento UF anual (inflación)" value={p.ufAnnualGrowthPercent} min={0} max={8} step={0.5}
                    display={`${p.ufAnnualGrowthPercent}%`} onChange={v => set('ufAnnualGrowthPercent', v)} />
                  <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Comuna</p>
                  <input value={p.commune} onChange={e => set('commune', e.target.value)} style={INPUT_S} />
                </>}

                {/* ── TAB: CRÉDITO ── */}
                {tab === 'credit' && <>
                  {/* Tipo de entrega */}
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Tipo de entrega</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    {(['immediate', 'future'] as const).map(t => (
                      <button key={t} onClick={() => set('deliveryType', t)} style={{
                        flex: 1, padding: '8px 6px', borderRadius: 10, border: '2px solid',
                        borderColor: p.deliveryType === t ? '#1d4ed8' : '#bfdbfe',
                        background: p.deliveryType === t ? '#eff6ff' : '#fff',
                        cursor: 'pointer', fontSize: 11, fontWeight: 700,
                        color: p.deliveryType === t ? '#1d4ed8' : '#94a3b8',
                      }}>
                        {t === 'immediate' ? '⚡ Inmediata' : '🏗️ Futura'}
                      </button>
                    ))}
                  </div>
                  {p.deliveryType === 'immediate' && (
                    <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 11, color: '#334d6e' }}>
                      <strong style={{ color: '#1d4ed8' }}>Escritura hoy</strong> · La propiedad está lista, el período de gracia comienza de inmediato tras firmar.
                    </div>
                  )}
                  {p.deliveryType === 'future' && (
                    <>
                      <Slider label="Plazo de construcción" value={p.constructionMonths} min={6} max={48} step={1}
                        display={`${p.constructionMonths} meses → escritura ${(() => { const {month:m,year:y}=addMonths(p.startMonth,p.startYear,p.constructionMonths); return `${MS[m]} ${y}`; })()}`}
                        onChange={v => set('constructionMonths', v)} />
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 11, color: '#92400e' }}>
                        <strong>Entrega futura</strong>: las cuotas del pie se pagan durante la construcción. La renta y el dividendo comienzan al entregar.
                      </div>
                    </>
                  )}

                  {/* Crédito hipotecario */}
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Crédito hipotecario</p>
                  <Slider label="% Financiamiento banco" value={p.financingPercent} min={50} max={95} step={5}
                    display={`${p.financingPercent}% → ${fUF(R.loanUF, 0)}`} onChange={v => set('financingPercent', v)} />
                  <Slider label="Tasa de interés anual" value={p.annualRatePercent} min={2} max={12} step={0.25}
                    display={`${p.annualRatePercent.toFixed(2)}%`} onChange={v => set('annualRatePercent', v)} />
                  <Slider label="Plazo crédito" value={p.loanTermYears} min={5} max={30} step={5}
                    display={`${p.loanTermYears} años`} onChange={v => set('loanTermYears', v)} />
                  <Slider label="Período de gracia post-entrega" value={p.gracePeriodMonths} min={0} max={12} step={1}
                    display={`${p.gracePeriodMonths} meses → 1er div. ${firstDividendLabel}`}
                    onChange={v => set('gracePeriodMonths', v)} />
                </>}

                {/* ── TAB: PIE ── */}
                {tab === 'pie' && <>
                  {/* Resumen estructura */}
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 14, marginBottom: 18 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Estructura del pie</p>
                    {[
                      ['Valor dpto', `${fUF(p.propertyValueUF, 0)}`, '#0f2957'],
                      [`Banco (${p.financingPercent}%)`, `${fUF(R.loanUF, 0)}`, '#1d4ed8'],
                      [`Pie total (${R.totalPiePct}%)`, `${fUF(p.propertyValueUF * R.totalPiePct / 100, 0)}`, '#0369a1'],
                      [`Bono pie (${p.bonoPiePercent}%)`, `- ${fUF(R.bonoPieUF, 0)}`, '#15803d'],
                      ['Pie real cliente', `= ${fUF(R.clientPieUF, 0)}`, R.clientPieUF === 0 ? '#15803d' : '#dc2626'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #dbeafe' }}>
                        <span style={{ fontSize: 11, color: '#6b93c4' }}>{l}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: c }}>{v}</span>
                      </div>
                    ))}
                    {R.clientPieUF > 0 && <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #dbeafe' }}>
                        <span style={{ fontSize: 11, color: '#6b93c4' }}>Up front ({p.clientPieUpfrontPct}%)</span>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#7c3aed' }}>{fUF(R.clientPieUpfrontUF, 2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: 11, color: '#6b93c4' }}>En cuotas ({100 - p.clientPieUpfrontPct}%)</span>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#d97706' }}>{fUF(R.clientPieCuotasUF, 2)}</span>
                      </div>
                    </>}
                  </div>

                  <Slider label="Bono pie del desarrollador (% valor dpto)" value={p.bonoPiePercent} min={0} max={Math.max(0, 100 - p.financingPercent)} step={1}
                    display={`${p.bonoPiePercent}% = ${fUF(R.bonoPieUF, 0)}`}
                    onChange={v => set('bonoPiePercent', v)} />

                  {R.clientPieUF > 0 ? (<>
                    <div style={{ background: R.clientPieUF === 0 ? '#f0fdf4' : '#faf5ff', border: `1px solid ${R.clientPieUF === 0 ? '#86efac' : '#c4b5fd'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>
                        Pie real del cliente: {fPct(R.clientPieUF / p.propertyValueUF * 100, 1)} = {fUF(R.clientPieUF, 2)}
                      </p>
                      <p style={{ fontSize: 10, color: '#94a3b8' }}>
                        = {fCLP(R.clientPieUF * p.ufValueCLP, false)} al tipo de cambio actual
                      </p>
                    </div>

                    <Slider label="% del pie al contado (up front)" value={p.clientPieUpfrontPct} min={0} max={100} step={5}
                      display={`${p.clientPieUpfrontPct}% = ${fUF(R.clientPieUpfrontUF, 2)}`}
                      onChange={v => set('clientPieUpfrontPct', v)} />
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11 }}>
                      <span style={{ color: '#92400e' }}>En cuotas ({100 - p.clientPieUpfrontPct}%): </span>
                      <strong style={{ color: '#d97706' }}>{fUF(R.clientPieCuotasUF, 2)} · {fCLP(R.clientPieCuotasUF * p.ufValueCLP, false)}</strong>
                    </div>

                    <Slider label="Número de cuotas del pie" value={p.clientPieCuotasCount} min={1} max={48} step={1}
                      display={`${p.clientPieCuotasCount} cuotas → ${fUF(R.monthlyCuotaUF, 2)}/mes (${fCLPFull(R.monthlyCuotaUF * p.ufValueCLP)})`}
                      onChange={v => set('clientPieCuotasCount', v)} />
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#0369a1' }}>
                      {p.deliveryType === 'future'
                        ? `Las cuotas se pagan durante los ${p.constructionMonths} meses de construcción (antes de escritura)`
                        : `Las cuotas se pagan en los primeros ${p.clientPieCuotasCount} meses desde escritura`}
                    </div>
                  </>) : (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                      <p style={{ fontSize: 24, margin: '0 0 8px' }}>✅</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Cliente no pone pie</p>
                      <p style={{ fontSize: 11, color: '#4ade80' }}>El bono pie ({p.bonoPiePercent}%) cubre el total del pie ({R.totalPiePct}%)</p>
                    </div>
                  )}
                </>}

                {/* ── TAB: ARRIENDO ── */}
                {tab === 'rent' && <>
                  <Slider label="Arriendo mensual bruto" value={p.monthlyRentCLP} min={200000} max={2000000} step={10000}
                    display={fCLPFull(p.monthlyRentCLP)} onChange={v => set('monthlyRentCLP', v)} />
                  <Slider label="Fee de administración" value={p.managementFeePercent} min={0} max={15} step={0.5}
                    display={`${p.managementFeePercent}%`} onChange={v => set('managementFeePercent', v)} />
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 12, fontSize: 11 }}>
                    {[
                      ['Arriendo bruto', fCLPFull(p.monthlyRentCLP), '#0f2957'],
                      [`Administración (${p.managementFeePercent}%)`, `-${fCLPFull(p.monthlyRentCLP * p.managementFeePercent / 100)}`, '#dc2626'],
                      ['Arriendo neto', fCLPFull(R.netMonthlyRentCLP), '#15803d'],
                      ['Cap Rate', fPct(R.capRatePercent), '#1d4ed8'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e0f2fe' }}>
                        <span style={{ color: '#6b93c4' }}>{l}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </>}

                {/* ── TAB: SALIDA ── */}
                {tab === 'exit' && <>
                  <Slider label="Plusvalía escenario conservador" value={p.appreciationScenario1Percent} min={0} max={100} step={5}
                    display={`+${p.appreciationScenario1Percent}%`} onChange={v => set('appreciationScenario1Percent', v)} />
                  <Slider label="Plusvalía escenario optimista" value={p.appreciationScenario2Percent} min={0} max={150} step={5}
                    display={`+${p.appreciationScenario2Percent}%`} onChange={v => set('appreciationScenario2Percent', v)} />
                  <Slider label="Años de análisis (post-entrega)" value={p.analysisYears} min={3} max={10} step={1}
                    display={`${p.analysisYears} años`} onChange={v => set('analysisYears', v)} />
                  <Slider label="Gastos de venta" value={p.saleCostPercent} min={0} max={5} step={0.5}
                    display={`${p.saleCostPercent}%`} onChange={v => set('saleCostPercent', v)} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Mes escritura</p>
                      <select value={p.startMonth} onChange={e => set('startMonth', parseInt(e.target.value))} style={INPUT_S}>
                        {ML.map((m, i) => <option key={i} value={i}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Año</p>
                      <input type="number" value={p.startYear} onChange={e => set('startYear', parseInt(e.target.value) || 2026)} style={INPUT_S} />
                    </div>
                  </div>
                </>}

              </div>
            </div>

            {/* Resumen rápido */}
            <div style={{ ...CARD, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Resumen</p>
              {[
                ['Valor dpto', fUF(p.propertyValueUF, 0)],
                [`Banco (${p.financingPercent}%)`, fUF(R.loanUF, 0)],
                [`Bono pie (${p.bonoPiePercent}%)`, fUF(R.bonoPieUF, 0)],
                ['Pie cliente', R.clientPieUF === 0 ? 'UF 0 ✅' : fUF(R.clientPieUF, 2)],
                ...(R.clientPieUF > 0 ? [
                  [`↳ Up front (${p.clientPieUpfrontPct}%)`, fUF(R.clientPieUpfrontUF, 2)],
                  [`↳ Cuotas (${100-p.clientPieUpfrontPct}% en ${p.clientPieCuotasCount}c)`, fUF(R.monthlyCuotaUF, 2) + '/mes'],
                ] : []),
                ['Tasa / plazo', `${p.annualRatePercent}% / ${p.loanTermYears} años`],
                ['Dividendo', fUF(R.monthlyPaymentUF) + ' = ' + fCLP(R.monthlyPaymentCLP, false)],
                ['Arriendo neto', fCLPFull(R.netMonthlyRentCLP)],
                ['Flujo prom./mes', fCLP(R.avgMonthlyCashFlow, false)],
                ['1er dividendo', firstDividendLabel],
                ['Cap Rate', fPct(R.capRatePercent)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eff6ff' }}>
                  <span style={{ fontSize: 10, color: '#6b93c4' }}>{l}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#0f2957' }}>{v}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* ── MAIN CONTENT ──────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Flujo mensual chart */}
            <div style={CARD}>
              <div style={{ padding: '14px 18px 8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0f2957', marginBottom: 2 }}>Flujo de Caja Mensual (post-entrega)</h2>
                  <p style={{ fontSize: 10, color: '#6b93c4' }}>Verde = superávit · Rojo = déficit (top-up) · Gracia resaltada</p>
                </div>
              </div>
              <div style={{ padding: '0 12px 12px' }}>
                <ResponsiveContainer width="100%" height={230}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#93b4d4' }} interval={5} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#93b4d4' }} tickFormatter={v => `$${(Math.abs(v) / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={0} stroke="#93c5fd" strokeDasharray="4 4" />
                    <Bar dataKey="Flujo neto" fill="#10b981" radius={[2, 2, 0, 0]} opacity={0.85} />
                    <Line type="monotone" dataKey="Arr. neto" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="Dividendo" stroke="#dc2626" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mini charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={CARD}>
                <div style={{ padding: '12px 16px 6px' }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f2957', marginBottom: 1 }}>Flujo Acumulado</h3>
                  <p style={{ fontSize: 10, color: '#6b93c4' }}>Total dinero puesto/recibido (todo el período)</p>
                </div>
                <div style={{ padding: '0 10px 12px' }}>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={R.monthlyData.slice(1).map(d => ({ name: d.dateShort, 'Acumulado': d.cumulativeCashFlow }))} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gAcum" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#93b4d4' }} interval={Math.floor(R.totalTableMonths / 6)} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#93b4d4' }} tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine y={0} stroke="#93c5fd" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="Acumulado" stroke="#2563eb" fill="url(#gAcum)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={CARD}>
                <div style={{ padding: '12px 16px 6px' }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f2957', marginBottom: 1 }}>Evolución Patrimonio</h3>
                  <p style={{ fontSize: 10, color: '#6b93c4' }}>Propiedad vs deuda (M CLP)</p>
                </div>
                <div style={{ padding: '0 10px 12px' }}>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gProp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284c7" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#93b4d4' }} interval={Math.floor(R.totalTableMonths / 6)} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#93b4d4' }} tickFormatter={v => `$${v.toFixed(0)}M`} tickLine={false} axisLine={false} />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`$${Number(v).toFixed(1)} M`]}
                        contentStyle={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 11 }}
                      />
                      <Area type="monotone" dataKey="Propiedad" stroke="#0284c7" fill="url(#gProp)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="Deuda" stroke="#ef4444" fill="none" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                      <Area type="monotone" dataKey="Patrimonio" stroke="#15803d" fill="none" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#6b93c4', paddingLeft: 8 }}>
                    {[['#0284c7','Propiedad'],['#ef4444','Deuda'],['#15803d','Patrimonio']].map(([c,l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 10, height: 2, background: c, display: 'inline-block', borderRadius: 1 }}></span>{l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Escenarios */}
            <ScenariosComparison R={R} p={p} />

            {/* TABLA PRINCIPAL */}
            <div>
              <div style={{ marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f2957', marginBottom: 3 }}>
                  Flujo Detallado — Todos los Meses
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#6b93c4', marginLeft: 10 }}>
                    {R.totalTableMonths + 1} columnas · scroll horizontal →
                  </span>
                </h2>
                <div style={{ display: 'flex', gap: 14, fontSize: 10, flexWrap: 'wrap' }}>
                  {[
                    { bg: '#7c3aed', label: p.deliveryType === 'future' ? 'Promesa' : 'Escritura' },
                    ...(p.deliveryType === 'future' ? [{ bg: '#d97706', label: 'Construcción (pre-entrega)' }] : []),
                    { bg: '#16a34a', label: 'Período de gracia' },
                    { bg: '#1d4ed8', label: 'Período activo (renta + dividendo)' },
                  ].map(({ bg, label }) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#334d6e' }}>
                      <span style={{ width: 12, height: 12, background: bg, borderRadius: 3, display: 'inline-block' }}></span>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <FlowTable data={R.monthlyData} p={p} R={R} />
            </div>

            <p style={{ textAlign: 'center', fontSize: 10, color: '#bfdbfe', padding: '10px 0' }}>
              Proppi Simulador · Valores estimativos, no garantizan retorno · UF ${p.ufValueCLP.toLocaleString('es-CL')} · {p.commune} {p.startYear}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
