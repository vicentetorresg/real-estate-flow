'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface SimulationParams {
  propertyValueUF: number;
  financingPercent: number;
  bonoPiePercent: number;
  annualRatePercent: number;
  loanTermYears: number;
  gracePeriodMonths: number;
  monthlyRentCLP: number;
  managementFeePercent: number;
  ufValueCLP: number;
  ufAnnualGrowthPercent: number;
  analysisYears: number;
  appreciationScenario1Percent: number;
  appreciationScenario2Percent: number;
  saleCostPercent: number;
  startMonth: number;
  startYear: number;
  commune: string;
}

interface MonthlyData {
  month: number;
  date: string;
  dateShort: string;
  ufValue: number;
  grossRent: number;
  managementFee: number;
  netRent: number;
  dividend: number;
  dividendUF: number;
  interest: number;
  principal: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  outstandingBalanceUF: number;
  outstandingBalanceCLP: number;
  propertyValueCLP: number;
  equityCLP: number;
  isGracePeriod: boolean;
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
  totalNegativeCashFlows: number;
  roiPercent: number;
  annualizedRoiPercent: number;
  equityMultiple: number;
}

interface SimulationResult {
  params: SimulationParams;
  loanUF: number;
  downPaymentUF: number;
  bonoPieUF: number;
  clientPieUF: number;
  monthlyPaymentUF: number;
  monthlyPaymentCLP: number;
  netMonthlyRentCLP: number;
  capRatePercent: number;
  monthlyData: MonthlyData[];
  scenario1: ScenarioResult;
  scenario2: ScenarioResult;
  totalNegativeCashFlow: number;
  avgMonthlyCashFlow: number;
  propertyValueCLP: number;
}

// ─────────────────────────────────────────────────────────────
// MATH
// ─────────────────────────────────────────────────────────────
function calcMonthlyPaymentUF(p: number, r_annual: number, n: number): number {
  const r = r_annual / 100 / 12;
  if (r === 0) return p / n;
  return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcOutstandingBalance(p: number, r_annual: number, n: number, paid: number): number {
  if (paid <= 0) return p;
  if (paid >= n) return 0;
  const r = r_annual / 100 / 12;
  if (r === 0) return p * (1 - paid / n);
  const pmt = calcMonthlyPaymentUF(p, r_annual, n);
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

// ─────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────
function fCLP(v: number, compact = true): string {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (compact && abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (compact && abs >= 100_000) return `${s}$${Math.round(abs / 1000)}k`;
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
  const totalMonths = p.analysisYears * 12;
  const loanTermMonths = p.loanTermYears * 12;

  const loanUF = p.propertyValueUF * (p.financingPercent / 100);
  const downPaymentUF = p.propertyValueUF * ((100 - p.financingPercent) / 100);
  const bonoPieUF = p.propertyValueUF * (p.bonoPiePercent / 100);
  const clientPieUF = Math.max(0, downPaymentUF - bonoPieUF);

  const monthlyPaymentUF = calcMonthlyPaymentUF(loanUF, p.annualRatePercent, loanTermMonths);
  const monthlyPaymentCLP = monthlyPaymentUF * p.ufValueCLP;
  const managementRate = p.managementFeePercent / 100;
  const netMonthlyRentCLP = p.monthlyRentCLP * (1 - managementRate);
  const propertyValueCLP = p.propertyValueUF * p.ufValueCLP;
  const capRatePercent = ((netMonthlyRentCLP * 12) / propertyValueCLP) * 100;
  const ufMonthlyGrowth = Math.pow(1 + p.ufAnnualGrowthPercent / 100, 1 / 12) - 1;

  const monthlyData: MonthlyData[] = [];
  let cumulativeCashFlow = 0;
  let mortgagePaymentsMade = 0;

  for (let m = 1; m <= totalMonths; m++) {
    const { month: cm, year: cy } = addMonths(p.startMonth, p.startYear, m);
    const ufVal = p.ufValueCLP * Math.pow(1 + ufMonthlyGrowth, m);
    const grossRent = p.monthlyRentCLP;
    const managementFee = grossRent * managementRate;
    const netRent = grossRent - managementFee;
    const isGracePeriod = m <= p.gracePeriodMonths;
    let dividend = 0, dividendUF = 0, interest = 0, principal = 0;

    if (!isGracePeriod) {
      dividendUF = monthlyPaymentUF;
      dividend = dividendUF * ufVal;
      const r = p.annualRatePercent / 100 / 12;
      const bal = calcOutstandingBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaymentsMade);
      interest = bal * r * ufVal;
      principal = dividend - interest;
      mortgagePaymentsMade++;
    }

    const netCashFlow = netRent - dividend;
    cumulativeCashFlow += netCashFlow;
    const outstandingBalanceUF = calcOutstandingBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaymentsMade);
    const outstandingBalanceCLP = outstandingBalanceUF * ufVal;
    const propValCLP = p.propertyValueUF * ufVal;

    monthlyData.push({
      month: m,
      date: `${ML[cm]} ${cy}`,
      dateShort: `${MS[cm]} '${String(cy).slice(2)}`,
      ufValue: ufVal,
      grossRent, managementFee, netRent,
      dividend, dividendUF, interest, principal,
      netCashFlow, cumulativeCashFlow,
      outstandingBalanceUF, outstandingBalanceCLP,
      propertyValueCLP: propValCLP,
      equityCLP: propValCLP - outstandingBalanceCLP,
      isGracePeriod,
    });
  }

  function calcScenario(aprecPct: number): ScenarioResult {
    const last = monthlyData[monthlyData.length - 1];
    const salePriceUF = p.propertyValueUF * (1 + aprecPct / 100);
    const salePriceCLP = salePriceUF * last.ufValue;
    const grossEquityCLP = salePriceCLP - last.outstandingBalanceCLP;
    const saleCostsCLP = salePriceCLP * (p.saleCostPercent / 100);
    const netEquityCLP = grossEquityCLP - saleCostsCLP;
    const totalNeg = monthlyData.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), clientPieUF * p.ufValueCLP);
    const totalReturn = netEquityCLP + last.cumulativeCashFlow;
    const roi = totalNeg > 0 ? (totalReturn / totalNeg) * 100 : Infinity;
    return {
      appreciationPercent: aprecPct,
      salePriceUF, salePriceCLP,
      outstandingBalanceUF: last.outstandingBalanceUF,
      outstandingBalanceCLP: last.outstandingBalanceCLP,
      grossEquityCLP, saleCostsCLP, netEquityCLP,
      cumulativeCashFlow: last.cumulativeCashFlow,
      totalReturn, totalNegativeCashFlows: totalNeg,
      roiPercent: roi,
      annualizedRoiPercent: totalNeg > 0 ? (Math.pow(1 + roi / 100, 1 / p.analysisYears) - 1) * 100 : Infinity,
      equityMultiple: totalNeg > 0 ? (totalReturn + totalNeg) / totalNeg : Infinity,
    };
  }

  return {
    params: p, loanUF, downPaymentUF, bonoPieUF, clientPieUF,
    monthlyPaymentUF, monthlyPaymentCLP, netMonthlyRentCLP,
    capRatePercent, monthlyData,
    scenario1: calcScenario(p.appreciationScenario1Percent),
    scenario2: calcScenario(p.appreciationScenario2Percent),
    totalNegativeCashFlow: monthlyData.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), 0),
    avgMonthlyCashFlow: monthlyData.reduce((s, d) => s + d.netCashFlow, 0) / (p.analysisYears * 12),
    propertyValueCLP,
  };
}

// ─────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────
const DEFAULTS: SimulationParams = {
  propertyValueUF: 3000, financingPercent: 90, bonoPiePercent: 10,
  annualRatePercent: 4.0, loanTermYears: 30, gracePeriodMonths: 3,
  monthlyRentCLP: 450000, managementFeePercent: 7,
  ufValueCLP: 38500, ufAnnualGrowthPercent: 3.5,
  analysisYears: 5,
  appreciationScenario1Percent: 30, appreciationScenario2Percent: 70,
  saleCostPercent: 2.5, startMonth: 2, startYear: 2026, commune: 'Cerrillos',
};

// ─────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, type = 'default', icon }: {
  label: string; value: string; sub?: string;
  type?: 'default' | 'positive' | 'negative' | 'blue' | 'sky'; icon?: string;
}) {
  const styles: Record<string, string> = {
    default: '#0f2957',
    positive: '#15803d',
    negative: '#dc2626',
    blue: '#1d4ed8',
    sky: '#0284c7',
  };
  return (
    <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}
      </p>
      <p style={{ fontSize: 18, fontWeight: 800, color: styles[type], lineHeight: 1.2 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: '#93b4d4', marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
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

function ScenarioCard({ sc, label, pct, color, params }: {
  sc: ScenarioResult; label: string; pct: number; color: 'blue' | 'sky'; params: SimulationParams;
}) {
  const c = color === 'blue'
    ? { bg: '#eff6ff', border: '#93c5fd', accent: '#1d4ed8', badge: '#dbeafe', badgeText: '#1e40af' }
    : { bg: '#f0f9ff', border: '#7dd3fc', accent: '#0284c7', badge: '#e0f2fe', badgeText: '#0369a1' };
  const { month: sm, year: sy } = addMonths(params.startMonth, params.startYear, params.analysisYears * 12);
  const Row = ({ l, v, bold }: { l: string; v: string; bold?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #dbeafe' }}>
      <span style={{ fontSize: 11, color: '#6b93c4' }}>{l}</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: bold ? 700 : 600, color: bold ? c.accent : '#0f2957' }}>{v}</span>
    </div>
  );
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.accent }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, background: c.badge, color: c.badgeText, padding: '3px 10px', borderRadius: 20 }}>
          +{pct}% plusvalía
        </span>
      </div>
      <p style={{ fontSize: 10, color: '#93b4d4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Venta {ML[sm]} {sy}</p>
      <p style={{ fontSize: 28, fontWeight: 900, color: c.accent, margin: '4px 0 2px' }}>{fCLP(sc.netEquityCLP, false)}</p>
      <p style={{ fontSize: 11, color: '#93b4d4', marginBottom: 14 }}>Patrimonio neto al vender</p>
      <Row l="Precio de venta" v={`${fUF(sc.salePriceUF, 0)}`} />
      <Row l="Deuda pendiente" v={`-${fUF(sc.outstandingBalanceUF, 0)}`} />
      <Row l="Equity bruto" v={fCLP(sc.grossEquityCLP, false)} />
      <Row l={`Gastos venta (${params.saleCostPercent}%)`} v={`-${fCLP(sc.saleCostsCLP, false)}`} />
      <Row l="Patrimonio neto venta" v={fCLP(sc.netEquityCLP, false)} bold />
      <Row l="Flujo acumulado 5 años" v={fCLP(sc.cumulativeCashFlow, false)} />
      <Row l="Total top-ups (inversión)" v={`-${fCLP(sc.totalNegativeCashFlows, false)}`} />
      <Row l="Retorno total neto" v={fCLP(sc.totalReturn, false)} bold />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
        {[
          { l: 'ROI Total', v: fPct(sc.roiPercent, 0), s: '5 años' },
          { l: 'ROI Anual', v: fPct(sc.annualizedRoiPercent, 1), s: 'anualizado' },
          { l: 'Equity ×', v: `${isFinite(sc.equityMultiple) ? sc.equityMultiple.toFixed(1) : '∞'}x`, s: 'múltiplo' },
        ].map(({ l, v, s }) => (
          <div key={l} style={{ background: '#fff', borderRadius: 10, padding: '10px 8px', textAlign: 'center', border: `1px solid ${c.border}` }}>
            <p style={{ fontSize: 9, color: '#93b4d4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{l}</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: c.accent }}>{v}</p>
            <p style={{ fontSize: 9, color: '#b3cfe8' }}>{s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CASH FLOW TABLE  (rows = concepts, columns = months)
// ─────────────────────────────────────────────────────────────
function FlowTable({ data, p }: { data: MonthlyData[]; p: SimulationParams }) {
  const COL_W = 96;
  const LABEL_W = 200;

  type RowDef = {
    label: string;
    key: keyof MonthlyData | null;
    fn?: (d: MonthlyData) => number;
    type: 'section' | 'income' | 'expense' | 'subtotal' | 'result' | 'balance' | 'label';
    prefix?: string;
  };

  const rows: RowDef[] = [
    { label: 'INGRESOS', key: null, type: 'section' },
    { label: 'Arriendo bruto', key: 'grossRent', type: 'income', prefix: '+' },

    { label: 'GASTOS OPERACIONALES', key: null, type: 'section' },
    { label: `Adm. inmobiliaria (${p.managementFeePercent}%)`, fn: d => -d.managementFee, key: null, type: 'expense', prefix: '-' },

    { label: 'Arriendo neto', key: 'netRent', type: 'subtotal' },

    { label: 'SERVICIO DEUDA BANCARIA', key: null, type: 'section' },
    { label: 'Período de gracia', key: null, type: 'label' },
    { label: 'Interés bancario', fn: d => -d.interest, key: null, type: 'expense', prefix: '-' },
    { label: 'Amortización capital', fn: d => -d.principal, key: null, type: 'expense', prefix: '-' },
    { label: 'Dividendo total', fn: d => -d.dividend, key: null, type: 'expense', prefix: '-' },

    { label: 'FLUJO NETO MENSUAL', key: 'netCashFlow', type: 'result' },
    { label: 'Flujo acumulado', key: 'cumulativeCashFlow', type: 'result' },

    { label: 'BALANCE', key: null, type: 'section' },
    { label: 'Saldo deuda (UF)', fn: d => d.outstandingBalanceUF, key: null, type: 'balance' },
    { label: 'Saldo deuda (CLP)', key: 'outstandingBalanceCLP', type: 'balance' },
    { label: 'Patrimonio neto', key: 'equityCLP', type: 'balance' },
  ];

  const getValue = (row: RowDef, d: MonthlyData): number | null => {
    if (row.type === 'section' || row.type === 'label') return null;
    if (row.fn) return row.fn(d);
    if (row.key) return d[row.key] as number;
    return null;
  };

  const cellColor = (row: RowDef, v: number | null) => {
    if (v === null) return 'transparent';
    if (row.type === 'section') return 'transparent';
    if (row.type === 'income') return '#15803d';
    if (row.type === 'expense') return v === 0 ? '#94a3b8' : '#dc2626';
    if (row.type === 'subtotal') return '#0369a1';
    if (row.type === 'result') return v >= 0 ? '#15803d' : '#dc2626';
    if (row.type === 'balance') return '#1d4ed8';
    return '#0f2957';
  };

  const formatCell = (row: RowDef, v: number | null, d: MonthlyData): string => {
    if (v === null) {
      if (row.label === 'Período de gracia') return d.isGracePeriod ? '✓ Gracia' : '';
      return '';
    }
    if (row.type === 'balance' && row.label.includes('UF')) return fUF(v, 0);
    return fCLP(v);
  };

  const rowBg = (row: RowDef) => {
    if (row.type === 'section') return '#dbeafe';
    if (row.type === 'result') return '#eff6ff';
    if (row.type === 'subtotal') return '#f0f9ff';
    if (row.type === 'label') return '#f8fbff';
    return '#fff';
  };

  return (
    <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid #bfdbfe', background: '#fff' }}>
      <div style={{ minWidth: LABEL_W + COL_W * data.length }}>
        <table className="flow-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'linear-gradient(135deg,#1d4ed8,#0284c7)' }}>
              <th style={{ width: LABEL_W, minWidth: LABEL_W, textAlign: 'left', padding: '10px 14px', color: '#fff', fontWeight: 700, fontSize: 10, background: '#1a46c8', position: 'sticky', left: 0, zIndex: 3 }}>
                Concepto
              </th>
              {data.map(d => (
                <th key={d.month} style={{
                  minWidth: COL_W, textAlign: 'center', padding: '8px 4px',
                  color: d.isGracePeriod ? '#bfdbfe' : '#fff',
                  fontWeight: d.isGracePeriod ? 500 : 600,
                  fontSize: 10,
                  background: d.isGracePeriod ? '#2563eb90' : 'transparent',
                  whiteSpace: 'nowrap',
                }}>
                  {d.dateShort}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const bg = rowBg(row);
              const isSection = row.type === 'section';
              return (
                <tr key={ri} style={{ background: bg }}>
                  <td style={{
                    padding: isSection ? '7px 14px' : '5px 14px',
                    fontWeight: isSection ? 700 : row.type === 'result' ? 700 : 500,
                    fontSize: isSection ? 9 : 11,
                    color: isSection ? '#1d4ed8' : row.type === 'result' ? '#0f2957' : '#334d6e',
                    textTransform: isSection ? 'uppercase' : 'none',
                    letterSpacing: isSection ? '0.08em' : 'normal',
                    background: bg,
                    borderRight: '2px solid #bfdbfe',
                    whiteSpace: 'nowrap',
                  }}>
                    {row.label}
                  </td>
                  {data.map(d => {
                    const v = getValue(row, d);
                    const display = formatCell(row, v, d);
                    const color = cellColor(row, v);
                    const isGrace = d.isGracePeriod;
                    return (
                      <td key={d.month} style={{
                        textAlign: 'right',
                        padding: '5px 8px',
                        fontFamily: isSection || row.type === 'label' ? 'inherit' : 'monospace',
                        fontWeight: row.type === 'result' ? 700 : 500,
                        color,
                        background: isGrace ? '#f0fff8' : bg,
                        fontSize: isSection ? 0 : 11,
                        whiteSpace: 'nowrap',
                        borderLeft: '1px solid #f0f4ff',
                      }}>
                        {row.type === 'label'
                          ? (d.isGracePeriod
                            ? <span style={{ fontSize: 9, color: '#059669', fontWeight: 600, background: '#d1fae5', padding: '1px 5px', borderRadius: 4 }}>GRACIA</span>
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
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function Home() {
  const [p, setP] = useState<SimulationParams>(DEFAULTS);
  const [tab, setTab] = useState<'prop' | 'credit' | 'rent' | 'exit'>('prop');

  const set = useCallback(<K extends keyof SimulationParams>(k: K, v: SimulationParams[K]) => {
    setP(prev => ({ ...prev, [k]: v }));
  }, []);

  const R = useMemo(() => runSimulation(p), [p]);

  const { month: gm, year: gy } = addMonths(p.startMonth, p.startYear, p.gracePeriodMonths + 1);
  const firstDividendLabel = `${ML[gm]} ${gy}`;

  const chartData = R.monthlyData.map(d => ({
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

  const PANEL = { background: '#fff', border: '1px solid #bfdbfe', borderRadius: 14 };
  const INPUT_STYLE = {
    width: '100%', background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8,
    padding: '7px 10px', fontSize: 12, color: '#0f2957', outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7ff' }}>

      {/* ── HEADER ──────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)',
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 2px 20px #1d4ed840',
      }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '12px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, background: '#fff', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: '#1d4ed8' }}>P</div>
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>Simulador de Inversión Inmobiliaria</h1>
              <p style={{ fontSize: 11, color: '#93c5fd' }}>{p.commune} · {ML[p.startMonth]} {p.startYear} · {p.analysisYears} años de análisis</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#bfdbfe' }}>
              🏦 Primer dividendo: <strong style={{ color: '#fff' }}>{firstDividendLabel}</strong>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, background: '#ffffff25', color: '#fff', padding: '5px 14px', borderRadius: 20, border: '1px solid #ffffff40' }}>
              {fUF(p.propertyValueUF, 0)} · UF ${p.ufValueCLP.toLocaleString('es-CL')} CLP
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── KPI STRIP ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Dividendo mensual" icon="🏦" value={fCLP(R.monthlyPaymentCLP, false)}
            sub={`${fUF(R.monthlyPaymentUF)} / mes`} type="blue" />
          <KpiCard label="Arriendo neto" icon="🏠" value={fCLPFull(R.netMonthlyRentCLP)}
            sub={`Bruto ${fCLPFull(p.monthlyRentCLP)} · adm ${p.managementFeePercent}%`} type="sky" />
          <KpiCard label="Flujo mensual prom." icon={R.avgMonthlyCashFlow >= 0 ? '📈' : '📉'}
            value={fCLP(R.avgMonthlyCashFlow, false)} sub="promedio 5 años"
            type={R.avgMonthlyCashFlow >= 0 ? 'positive' : 'negative'} />
          <KpiCard label="Cap Rate" icon="💹" value={fPct(R.capRatePercent)}
            sub="Renta anual neta / valor dpto" type="blue" />
          <KpiCard label="Bono Pie" icon="🎁" value={fUF(R.bonoPieUF, 0)}
            sub={`= ${fCLP(R.bonoPieUF * p.ufValueCLP, false)} · Cliente: ${R.clientPieUF === 0 ? '$0 ✅' : fUF(R.clientPieUF)}`} type="sky" />
          <KpiCard label="Crédito bancario" icon="🏛️" value={fUF(R.loanUF, 0)}
            sub={`${p.financingPercent}% · ${p.annualRatePercent}% / ${p.loanTermYears} años`} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>

          {/* ── SIDEBAR INPUTS ──────────────────────────── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={PANEL}>
              <div style={{ padding: '16px 16px 8px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Parámetros</p>
                <div style={{ display: 'flex', gap: 4, background: '#eff6ff', borderRadius: 10, padding: 4 }}>
                  {([['prop','Propiedad'],['credit','Crédito'],['rent','Arriendo'],['exit','Salida']] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setTab(k)} style={{
                      flex: 1, fontSize: 10, fontWeight: 600, padding: '6px 4px', borderRadius: 7, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: tab === k ? '#1d4ed8' : 'transparent',
                      color: tab === k ? '#fff' : '#6b93c4',
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>

              <div style={{ padding: '8px 16px 16px' }}>
                {tab === 'prop' && <>
                  <Slider label="Valor propiedad" value={p.propertyValueUF} min={1000} max={10000} step={100}
                    display={fUF(p.propertyValueUF, 0)} onChange={v => set('propertyValueUF', v)} />
                  <Slider label="Valor UF actual" value={p.ufValueCLP} min={35000} max={45000} step={500}
                    display={`$${p.ufValueCLP.toLocaleString('es-CL')}`} onChange={v => set('ufValueCLP', v)} />
                  <Slider label="Crecimiento UF anual" value={p.ufAnnualGrowthPercent} min={0} max={8} step={0.5}
                    display={`${p.ufAnnualGrowthPercent}%`} onChange={v => set('ufAnnualGrowthPercent', v)} />
                  <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Comuna</p>
                  <input value={p.commune} onChange={e => set('commune', e.target.value)} style={INPUT_STYLE} />
                </>}

                {tab === 'credit' && <>
                  <Slider label="Financiamiento banco" value={p.financingPercent} min={50} max={95} step={5}
                    display={`${p.financingPercent}%`} onChange={v => set('financingPercent', v)} />
                  <Slider label="Bono pie" value={p.bonoPiePercent} min={0} max={30} step={5}
                    display={`${p.bonoPiePercent}%`} onChange={v => set('bonoPiePercent', v)} />
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 11, color: '#334d6e' }}>
                    <p style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>Estructura Pie</p>
                    <div>Pie total: <strong>{100 - p.financingPercent}%</strong> = {fUF(R.downPaymentUF, 0)}</div>
                    <div>Bono pie: <strong style={{ color: '#0284c7' }}>{p.bonoPiePercent}%</strong> = {fUF(R.bonoPieUF, 0)}</div>
                    <div>Cliente paga: <strong style={{ color: R.clientPieUF === 0 ? '#15803d' : '#dc2626' }}>
                      {R.clientPieUF === 0 ? '$0 — cubierto ✅' : fUF(R.clientPieUF, 2)}
                    </strong></div>
                  </div>
                  <Slider label="Tasa interés anual" value={p.annualRatePercent} min={2} max={10} step={0.25}
                    display={`${p.annualRatePercent.toFixed(2)}%`} onChange={v => set('annualRatePercent', v)} />
                  <Slider label="Plazo crédito" value={p.loanTermYears} min={10} max={30} step={5}
                    display={`${p.loanTermYears} años`} onChange={v => set('loanTermYears', v)} />
                  <Slider label="Período de gracia" value={p.gracePeriodMonths} min={0} max={12} step={1}
                    display={`${p.gracePeriodMonths} meses → 1er div: ${firstDividendLabel}`}
                    onChange={v => set('gracePeriodMonths', v)} />
                </>}

                {tab === 'rent' && <>
                  <Slider label="Arriendo mensual bruto" value={p.monthlyRentCLP} min={200000} max={2000000} step={10000}
                    display={fCLPFull(p.monthlyRentCLP)} onChange={v => set('monthlyRentCLP', v)} />
                  <Slider label="Fee administración" value={p.managementFeePercent} min={0} max={15} step={0.5}
                    display={`${p.managementFeePercent}%`} onChange={v => set('managementFeePercent', v)} />
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 12, fontSize: 11 }}>
                    {[
                      ['Arriendo bruto', fCLPFull(p.monthlyRentCLP), '#0f2957'],
                      [`Adm. (${p.managementFeePercent}%)`, `-${fCLPFull(p.monthlyRentCLP * p.managementFeePercent / 100)}`, '#dc2626'],
                      ['Arriendo neto', fCLPFull(R.netMonthlyRentCLP), '#15803d'],
                      ['Cap Rate', fPct(R.capRatePercent), '#1d4ed8'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #e0f2fe' }}>
                        <span style={{ color: '#6b93c4' }}>{l}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </>}

                {tab === 'exit' && <>
                  <Slider label="Plusvalía escenario 1" value={p.appreciationScenario1Percent} min={0} max={100} step={5}
                    display={`+${p.appreciationScenario1Percent}%`} onChange={v => set('appreciationScenario1Percent', v)} />
                  <Slider label="Plusvalía escenario 2" value={p.appreciationScenario2Percent} min={0} max={150} step={5}
                    display={`+${p.appreciationScenario2Percent}%`} onChange={v => set('appreciationScenario2Percent', v)} />
                  <Slider label="Años de análisis" value={p.analysisYears} min={3} max={10} step={1}
                    display={`${p.analysisYears} años`} onChange={v => set('analysisYears', v)} />
                  <Slider label="Gastos de venta" value={p.saleCostPercent} min={0} max={5} step={0.5}
                    display={`${p.saleCostPercent}%`} onChange={v => set('saleCostPercent', v)} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Mes escritura</p>
                      <select value={p.startMonth} onChange={e => set('startMonth', parseInt(e.target.value))} style={INPUT_STYLE}>
                        {ML.map((m, i) => <option key={i} value={i}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Año</p>
                      <input type="number" value={p.startYear} onChange={e => set('startYear', parseInt(e.target.value) || 2026)} style={INPUT_STYLE} />
                    </div>
                  </div>
                </>}
              </div>
            </div>

            {/* Resumen */}
            <div style={{ ...PANEL, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Resumen Crédito</p>
              {[
                ['Valor propiedad', fUF(p.propertyValueUF, 0)],
                ['Monto crédito', fUF(R.loanUF, 0)],
                ['Dividendo (UF)', fUF(R.monthlyPaymentUF)],
                ['Dividendo (CLP)', fCLPFull(R.monthlyPaymentCLP)],
                ['Arriendo neto', fCLPFull(R.netMonthlyRentCLP)],
                ['Flujo prom./mes', fCLP(R.avgMonthlyCashFlow, false)],
                ['Primer dividendo', firstDividendLabel],
                ['Cap Rate', fPct(R.capRatePercent)],
                ['Total top-ups', fCLP(R.totalNegativeCashFlow, false)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eff6ff' }}>
                  <span style={{ fontSize: 11, color: '#6b93c4' }}>{l}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#0f2957' }}>{v}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* ── MAIN CONTENT ─────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Cash flow bar chart */}
            <div style={PANEL}>
              <div style={{ padding: '16px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f2957', marginBottom: 2 }}>Flujo de Caja Mensual</h2>
                  <p style={{ fontSize: 11, color: '#6b93c4' }}>Verde = ingreso · Rojo = egreso · Período de gracia resaltado</p>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#6b93c4' }}>
                  {[['#2563eb','Arr. neto'], ['#0369a1','Dividendo']].map(([c, l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 12, height: 3, background: c, display: 'inline-block', borderRadius: 2 }}></span>{l}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ padding: '0 16px 16px' }}>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#93b4d4' }} interval={5} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#93b4d4' }} tickFormatter={v => `$${(Math.abs(v) / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={0} stroke="#93c5fd" strokeDasharray="4 4" />
                    <Bar dataKey="Flujo neto" fill="#10b981" radius={[2, 2, 0, 0]} opacity={0.85} />
                    <Line type="monotone" dataKey="Arr. neto" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="Dividendo" stroke="#0369a1" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mini charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={PANEL}>
                <div style={{ padding: '14px 18px 6px' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f2957', marginBottom: 2 }}>Flujo Acumulado</h3>
                  <p style={{ fontSize: 10, color: '#6b93c4' }}>Dinero total puesto / recibido</p>
                </div>
                <div style={{ padding: '0 12px 12px' }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gAcum" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#93b4d4' }} interval={9} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#93b4d4' }} tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine y={0} stroke="#93c5fd" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="Acumulado" stroke="#2563eb" fill="url(#gAcum)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={PANEL}>
                <div style={{ padding: '14px 18px 6px' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f2957', marginBottom: 2 }}>Evolución Patrimonio</h3>
                  <p style={{ fontSize: 10, color: '#6b93c4' }}>Valor dpto vs deuda (millones CLP)</p>
                </div>
                <div style={{ padding: '0 12px 12px' }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gProp2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284c7" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#93b4d4' }} interval={9} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#93b4d4' }} tickFormatter={v => `$${v.toFixed(0)}M`} tickLine={false} axisLine={false} />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`$${Number(v).toFixed(1)} M`]}
                        contentStyle={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 11 }}
                      />
                      <Area type="monotone" dataKey="Propiedad" stroke="#0284c7" fill="url(#gProp2)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="Deuda" stroke="#ef4444" fill="none" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                      <Area type="monotone" dataKey="Patrimonio" stroke="#15803d" fill="none" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#6b93c4', paddingTop: 4, paddingLeft: 8 }}>
                    {[['#0284c7','Propiedad'], ['#ef4444','Deuda'], ['#15803d','Patrimonio']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 12, height: 2, background: c, display: 'inline-block', borderRadius: 1 }}></span>{l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scenarios */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <ScenarioCard sc={R.scenario1} label="Escenario Conservador" pct={p.appreciationScenario1Percent} color="blue" params={p} />
              <ScenarioCard sc={R.scenario2} label="Escenario Optimista" pct={p.appreciationScenario2Percent} color="sky" params={p} />
            </div>

            {/* ── THE BIG TABLE ──────────────────────────── */}
            <div>
              <div style={{ marginBottom: 10 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2957' }}>Flujo de Caja Detallado — Todos los Meses</h2>
                <p style={{ fontSize: 11, color: '#6b93c4' }}>
                  {p.analysisYears * 12} meses · {ML[p.startMonth]} {p.startYear}
                  {' → '}
                  {(() => { const { month: m, year: y } = addMonths(p.startMonth, p.startYear, p.analysisYears * 12); return `${ML[m]} ${y}`; })()}
                  {' · '}
                  <span style={{ color: '#059669', fontWeight: 600 }}>Verde = período de gracia (sin dividendo)</span>
                  {' · '}
                  <span style={{ color: '#6b93c4' }}>Scroll horizontal →</span>
                </p>
              </div>
              <FlowTable data={R.monthlyData} p={p} />
            </div>

            <p style={{ textAlign: 'center', fontSize: 11, color: '#bfdbfe', padding: '12px 0' }}>
              Proppi Simulador · Valores estimativos, no garantizan retorno ·
              UF ${p.ufValueCLP.toLocaleString('es-CL')} CLP · {p.commune} {p.startYear}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
