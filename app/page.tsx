'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
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
  totalPositiveCashFlows: number;
  roiPercent: number;
  annualizedRoiPercent: number;
  equityMultiple: number;
  irrPercent: number;
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
// FINANCIAL MATH
// ─────────────────────────────────────────────────────────────
function calcMonthlyPaymentUF(principalUF: number, annualRatePercent: number, termMonths: number): number {
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return principalUF / termMonths;
  return (principalUF * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function calcOutstandingBalance(
  principalUF: number,
  annualRatePercent: number,
  termMonths: number,
  paymentsMade: number
): number {
  if (paymentsMade <= 0) return principalUF;
  if (paymentsMade >= termMonths) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return principalUF * (1 - paymentsMade / termMonths);
  const pmt = calcMonthlyPaymentUF(principalUF, annualRatePercent, termMonths);
  return principalUF * Math.pow(1 + r, paymentsMade) - (pmt * (Math.pow(1 + r, paymentsMade) - 1)) / r;
}

function calcIRR(cashFlows: number[]): number | null {
  let rate = 0.01;
  for (let iter = 0; iter < 500; iter++) {
    let npv = 0;
    let dNpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const f = Math.pow(1 + rate, t);
      npv += cashFlows[t] / f;
      if (t > 0) dNpv -= (t * cashFlows[t]) / (f * (1 + rate));
    }
    if (Math.abs(dNpv) < 1e-10) break;
    const newRate = rate - npv / dNpv;
    if (Math.abs(newRate - rate) < 1e-8) {
      return newRate * 12 * 100;
    }
    rate = Math.max(-0.99, Math.min(10, newRate));
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_LONG = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function addMonths(month: number, year: number, n: number): { month: number; year: number } {
  const total = year * 12 + month + n;
  return { month: total % 12, year: Math.floor(total / 12) };
}

// ─────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────
function fCLP(v: number): string {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  return `${sign}$${Math.round(abs).toLocaleString('es-CL')}`;
}

function fCLPFull(v: number): string {
  if (!isFinite(v)) return '-';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(v);
}

function fUF(v: number, decimals = 2): string {
  if (!isFinite(v)) return '-';
  return `UF ${v.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fPct(v: number, decimals = 2): string {
  if (!isFinite(v)) return '∞';
  return `${v.toFixed(decimals).replace('.', ',')}%`;
}

// ─────────────────────────────────────────────────────────────
// SIMULATOR CORE
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
    const { month: calMonth, year: calYear } = addMonths(p.startMonth, p.startYear, m);
    const dateShort = `${MONTHS_SHORT[calMonth]} '${String(calYear).slice(2)}`;
    const date = `${MONTHS_LONG[calMonth]} ${calYear}`;
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
      const currentBalanceUF = calcOutstandingBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaymentsMade);
      interest = currentBalanceUF * r * ufVal;
      principal = dividend - interest;
      mortgagePaymentsMade++;
    }

    const netCashFlow = netRent - dividend;
    cumulativeCashFlow += netCashFlow;

    const outstandingBalanceUF = calcOutstandingBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaymentsMade);
    const outstandingBalanceCLP = outstandingBalanceUF * ufVal;
    const propValCLP = p.propertyValueUF * ufVal;
    const equityCLP = propValCLP - outstandingBalanceCLP;

    monthlyData.push({
      month: m, date, dateShort, ufValue: ufVal,
      grossRent, managementFee, netRent,
      dividend, dividendUF, interest, principal,
      netCashFlow, cumulativeCashFlow,
      outstandingBalanceUF, outstandingBalanceCLP,
      propertyValueCLP: propValCLP, equityCLP, isGracePeriod,
    });
  }

  function calcScenario(appreciationPercent: number): ScenarioResult {
    const last = monthlyData[monthlyData.length - 1];
    const finalUF = last.ufValue;

    const salePriceUF = p.propertyValueUF * (1 + appreciationPercent / 100);
    const salePriceCLP = salePriceUF * finalUF;
    const outstandingBalanceUF = last.outstandingBalanceUF;
    const outstandingBalanceCLP = last.outstandingBalanceCLP;
    const grossEquityCLP = salePriceCLP - outstandingBalanceCLP;
    const saleCostsCLP = salePriceCLP * (p.saleCostPercent / 100);
    const netEquityCLP = grossEquityCLP - saleCostsCLP;
    const cumCashFlow = last.cumulativeCashFlow;

    const totalNegativeCashFlows = monthlyData.reduce(
      (s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0),
      clientPieUF * p.ufValueCLP
    );
    const totalPositiveCashFlows = monthlyData.reduce(
      (s, d) => s + (d.netCashFlow > 0 ? d.netCashFlow : 0), 0
    );

    const totalReturn = netEquityCLP + cumCashFlow;
    const roiPercent = totalNegativeCashFlows > 0 ? (totalReturn / totalNegativeCashFlows) * 100 : Infinity;
    const annualizedRoiPercent =
      totalNegativeCashFlows > 0 ? (Math.pow(1 + roiPercent / 100, 1 / p.analysisYears) - 1) * 100 : Infinity;
    const equityMultiple =
      totalNegativeCashFlows > 0 ? (totalReturn + totalNegativeCashFlows) / totalNegativeCashFlows : Infinity;

    let irrPercent = annualizedRoiPercent;
    try {
      const seed = Math.max(clientPieUF * p.ufValueCLP, totalNegativeCashFlows / totalMonths);
      const irrFlows: number[] = [-seed];
      for (let i = 0; i < totalMonths - 1; i++) irrFlows.push(monthlyData[i].netCashFlow);
      irrFlows.push(monthlyData[totalMonths - 1].netCashFlow + netEquityCLP);
      const irr = calcIRR(irrFlows);
      if (irr !== null) irrPercent = irr;
    } catch { /* keep default */ }

    return {
      appreciationPercent, salePriceUF, salePriceCLP,
      outstandingBalanceUF, outstandingBalanceCLP,
      grossEquityCLP, saleCostsCLP, netEquityCLP,
      cumulativeCashFlow: cumCashFlow, totalReturn,
      totalNegativeCashFlows, totalPositiveCashFlows,
      roiPercent, annualizedRoiPercent, equityMultiple, irrPercent,
    };
  }

  const scenario1 = calcScenario(p.appreciationScenario1Percent);
  const scenario2 = calcScenario(p.appreciationScenario2Percent);
  const totalNegativeCashFlow = monthlyData.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), 0);
  const avgMonthlyCashFlow = monthlyData.reduce((s, d) => s + d.netCashFlow, 0) / totalMonths;

  return {
    params: p, loanUF, downPaymentUF, bonoPieUF, clientPieUF,
    monthlyPaymentUF, monthlyPaymentCLP, netMonthlyRentCLP,
    capRatePercent, monthlyData, scenario1, scenario2,
    totalNegativeCashFlow, avgMonthlyCashFlow, propertyValueCLP,
  };
}

// ─────────────────────────────────────────────────────────────
// DEFAULTS — Cerrillos, Marzo 2026
// ─────────────────────────────────────────────────────────────
const DEFAULTS: SimulationParams = {
  propertyValueUF: 3000,
  financingPercent: 90,
  bonoPiePercent: 10,
  annualRatePercent: 4.0,
  loanTermYears: 30,
  gracePeriodMonths: 3,   // first dividend July 2026
  monthlyRentCLP: 450000,
  managementFeePercent: 7,
  ufValueCLP: 38500,
  ufAnnualGrowthPercent: 3.5,
  analysisYears: 5,
  appreciationScenario1Percent: 30,
  appreciationScenario2Percent: 70,
  saleCostPercent: 2.5,
  startMonth: 2, // March
  startYear: 2026,
  commune: 'Cerrillos',
};

// ─────────────────────────────────────────────────────────────
// SMALL UI COMPONENTS
// ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'white', icon }: {
  label: string; value: string; sub?: string;
  color?: 'white' | 'green' | 'red' | 'amber' | 'blue'; icon?: string;
}) {
  const cls = { white: 'text-white', green: 'text-emerald-400', red: 'text-red-400', amber: 'text-amber-400', blue: 'text-blue-400' };
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
        {icon && <span className="mr-1">{icon}</span>}{label}
      </p>
      <p className={`text-lg font-bold leading-tight ${cls[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] text-slate-400">{label}</span>
        <span className="text-[11px] font-bold text-amber-400">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  );
}

type TooltipPayload = { name: string; value: number; color: string };
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl text-xs">
      <p className="font-bold text-slate-300 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-6 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-bold" style={{ color: p.color }}>{fCLP(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ScenarioCard({ scenario, label, accent, params }: {
  scenario: ScenarioResult; label: string; accent: 'amber' | 'emerald'; params: SimulationParams;
}) {
  const t = accent === 'amber'
    ? { text: 'text-amber-400', border: 'border-amber-500/40', badge: 'bg-amber-900/40 text-amber-300 border-amber-500/30' }
    : { text: 'text-emerald-400', border: 'border-emerald-500/40', badge: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30' };

  const { month: sm, year: sy } = addMonths(params.startMonth, params.startYear, params.analysisYears * 12);

  const Row = ({ l, v, hi }: { l: string; v: string; hi?: boolean }) => (
    <div className="flex justify-between py-1.5 border-b border-slate-700/40">
      <span className="text-[11px] text-slate-500">{l}</span>
      <span className={`text-[11px] font-mono font-bold ${hi ? t.text : 'text-slate-300'}`}>{v}</span>
    </div>
  );

  return (
    <div className={`bg-slate-800 border ${t.border} rounded-xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-bold ${t.text}`}>{label}</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${t.badge}`}>
          +{scenario.appreciationPercent}% plusvalía
        </span>
      </div>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest">Venta {MONTHS_LONG[sm]} {sy}</p>
      <p className={`text-3xl font-black ${t.text} my-1`}>{fCLP(scenario.netEquityCLP)}</p>
      <p className="text-[11px] text-slate-500 mb-4">Patrimonio neto al vender</p>

      <div>
        <Row l="Precio venta" v={`${fUF(scenario.salePriceUF, 0)} · ${fCLP(scenario.salePriceCLP)}`} />
        <Row l="Deuda pendiente" v={`${fUF(scenario.outstandingBalanceUF, 0)} · ${fCLP(scenario.outstandingBalanceCLP)}`} />
        <Row l="Equity bruto" v={fCLP(scenario.grossEquityCLP)} />
        <Row l={`Gastos venta (${params.saleCostPercent}%)`} v={`-${fCLP(scenario.saleCostsCLP)}`} />
        <Row l="Patrimonio neto venta" v={fCLP(scenario.netEquityCLP)} hi />
        <Row l="Flujo acumulado 5 años" v={fCLP(scenario.cumulativeCashFlow)} />
        <Row l="Total top-ups (inversión)" v={`-${fCLP(scenario.totalNegativeCashFlows)}`} />
        <Row l="Retorno total neto" v={fCLP(scenario.totalReturn)} hi />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        {[
          { lbl: 'ROI Total', val: fPct(scenario.roiPercent, 0), sub: '5 años' },
          { lbl: 'ROI Anual', val: fPct(scenario.annualizedRoiPercent, 1), sub: 'anualizado' },
          { lbl: 'Equity ×', val: `${isFinite(scenario.equityMultiple) ? scenario.equityMultiple.toFixed(1) : '∞'}x`, sub: 'múltiplo' },
        ].map(({ lbl, val, sub }) => (
          <div key={lbl} className="bg-slate-900/60 rounded-lg p-2.5 text-center">
            <p className="text-[9px] uppercase text-slate-500 tracking-wider">{lbl}</p>
            <p className={`text-sm font-black ${t.text}`}>{val}</p>
            <p className="text-[9px] text-slate-600">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function Home() {
  const [p, setP] = useState<SimulationParams>(DEFAULTS);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<'prop' | 'credit' | 'rent' | 'exit'>('prop');

  const set = useCallback(<K extends keyof SimulationParams>(k: K, v: SimulationParams[K]) => {
    setP(prev => ({ ...prev, [k]: v }));
  }, []);

  const R = useMemo(() => runSimulation(p), [p]);

  const { month: graceEndMonth, year: graceEndYear } = addMonths(p.startMonth, p.startYear, p.gracePeriodMonths + 1);
  const firstDividendLabel = `${MONTHS_LONG[graceEndMonth]} ${graceEndYear}`;

  const chartData = R.monthlyData.map(d => ({
    name: d.dateShort,
    'Flujo neto': d.netCashFlow,
    'Arr. neto': d.netRent,
    'Dividendo': -d.dividend,
    'Acumulado': d.cumulativeCashFlow,
  }));

  const equityData = R.monthlyData.map(d => ({
    name: d.dateShort,
    'Propiedad': Math.round(d.propertyValueCLP / 1_000_000 * 10) / 10,
    'Deuda': Math.round(d.outstandingBalanceCLP / 1_000_000 * 10) / 10,
    'Patrimonio': Math.round(d.equityCLP / 1_000_000 * 10) / 10,
  }));

  const tableRows = showAll ? R.monthlyData : R.monthlyData.slice(0, 12);
  const totalMonths = p.analysisYears * 12;

  return (
    <div className="min-h-screen" style={{ background: '#0f172a', color: '#f1f5f9' }}>

      {/* ── HEADER ───────────────────────────────────────── */}
      <header style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }} className="sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm"
              style={{ background: '#f59e0b', color: '#0f172a' }}>P</div>
            <div>
              <h1 className="text-sm font-bold leading-none" style={{ color: '#f1f5f9' }}>
                Simulador de Inversión Inmobiliaria
              </h1>
              <p className="text-[11px]" style={{ color: '#64748b' }}>
                {p.commune} · {MONTHS_LONG[p.startMonth]} {p.startYear} · {p.analysisYears} años
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span style={{ color: '#64748b' }}>
              🏦 Primer dividendo: <strong style={{ color: '#f59e0b' }}>{firstDividendLabel}</strong>
            </span>
            <span className="px-3 py-1 rounded-full font-bold border"
              style={{ background: '#451a0380', borderColor: '#92400e60', color: '#fcd34d' }}>
              {fUF(p.propertyValueUF, 0)} · UF ${p.ufValueCLP.toLocaleString('es-CL')} CLP
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-5">

        {/* ── KPI STRIP ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <KpiCard label="Dividendo mensual" icon="🏦"
            value={fCLP(R.monthlyPaymentCLP)}
            sub={`${fUF(R.monthlyPaymentUF)} / mes`}
            color="amber" />
          <KpiCard label="Arriendo neto" icon="🏠"
            value={fCLP(R.netMonthlyRentCLP)}
            sub={`Bruto ${fCLPFull(p.monthlyRentCLP)}, adm ${p.managementFeePercent}%`}
            color="blue" />
          <KpiCard label="Flujo mensual" icon={R.avgMonthlyCashFlow >= 0 ? '📈' : '📉'}
            value={fCLP(R.avgMonthlyCashFlow)}
            sub="promedio mensual 5 años"
            color={R.avgMonthlyCashFlow >= 0 ? 'green' : 'red'} />
          <KpiCard label="Cap Rate" icon="💹"
            value={fPct(R.capRatePercent)}
            sub="Renta anual neta / valor dpto"
            color="blue" />
          <KpiCard label="Bono Pie" icon="🎁"
            value={fUF(R.bonoPieUF, 0)}
            sub={`= ${fCLP(R.bonoPieUF * p.ufValueCLP)} · Pie cliente: ${R.clientPieUF === 0 ? '$0 ✅' : fUF(R.clientPieUF)}`}
            color="amber" />
          <KpiCard label="Crédito bancario" icon="🏛️"
            value={fUF(R.loanUF, 0)}
            sub={`${p.financingPercent}% · ${p.annualRatePercent}% / ${p.loanTermYears} años`}
            color="white" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">

          {/* ── INPUTS SIDEBAR ───────────────────────────── */}
          <aside className="space-y-4">
            <div className="rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #334155' }}>
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Parámetros</p>
                <div className="flex gap-1 rounded-lg p-1" style={{ background: '#0f172a' }}>
                  {([['prop', 'Propiedad'], ['credit', 'Crédito'], ['rent', 'Arriendo'], ['exit', 'Salida']] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setTab(k)}
                      className="flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-all"
                      style={tab === k
                        ? { background: '#f59e0b', color: '#0f172a' }
                        : { color: '#64748b' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-4 pb-5">
                {tab === 'prop' && <>
                  <Slider label="Valor propiedad" value={p.propertyValueUF} min={1000} max={10000} step={100}
                    display={fUF(p.propertyValueUF, 0)} onChange={v => set('propertyValueUF', v)} />
                  <Slider label="Valor UF actual" value={p.ufValueCLP} min={35000} max={45000} step={500}
                    display={`$${p.ufValueCLP.toLocaleString('es-CL')}`} onChange={v => set('ufValueCLP', v)} />
                  <Slider label="Crecimiento UF anual (inflación)" value={p.ufAnnualGrowthPercent} min={0} max={8} step={0.5}
                    display={`${p.ufAnnualGrowthPercent}%`} onChange={v => set('ufAnnualGrowthPercent', v)} />
                  <div className="mt-2">
                    <p className="text-[11px] text-slate-400 mb-1">Comuna</p>
                    <input value={p.commune} onChange={e => set('commune', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none border focus:border-amber-500 transition-colors"
                      style={{ background: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                  </div>
                </>}

                {tab === 'credit' && <>
                  <Slider label="Financiamiento banco" value={p.financingPercent} min={50} max={95} step={5}
                    display={`${p.financingPercent}%`} onChange={v => set('financingPercent', v)} />
                  <Slider label="Bono pie" value={p.bonoPiePercent} min={0} max={30} step={5}
                    display={`${p.bonoPiePercent}%`} onChange={v => set('bonoPiePercent', v)} />
                  <div className="rounded-lg p-3 mb-3 text-[11px]"
                    style={{ background: '#f59e0b15', border: '1px solid #f59e0b30' }}>
                    <p className="font-bold mb-1" style={{ color: '#fcd34d' }}>Estructura de Pie</p>
                    <div className="space-y-0.5" style={{ color: '#94a3b8' }}>
                      <p>Pie total: <strong style={{ color: '#f1f5f9' }}>{100 - p.financingPercent}%</strong> = {fUF(R.downPaymentUF, 0)}</p>
                      <p>Bono pie: <strong style={{ color: '#f59e0b' }}>{p.bonoPiePercent}%</strong> = {fUF(R.bonoPieUF, 0)}</p>
                      <p>Pie cliente: <strong style={{ color: R.clientPieUF === 0 ? '#34d399' : '#f87171' }}>
                        {R.clientPieUF === 0 ? '$0 — cubierto por bono ✅' : fUF(R.clientPieUF, 2)}
                      </strong></p>
                    </div>
                  </div>
                  <Slider label="Tasa de interés anual" value={p.annualRatePercent} min={2} max={10} step={0.25}
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
                  <div className="rounded-lg p-3 text-[11px]" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                    {[
                      ['Arriendo bruto', fCLPFull(p.monthlyRentCLP), '#94a3b8'],
                      [`Administración (${p.managementFeePercent}%)`, `-${fCLPFull(p.monthlyRentCLP * p.managementFeePercent / 100)}`, '#f87171'],
                      ['Arriendo neto / mes', fCLPFull(R.netMonthlyRentCLP), '#34d399'],
                      ['Cap Rate', fPct(R.capRatePercent), '#60a5fa'],
                    ].map(([l, v, c]) => (
                      <div key={l} className="flex justify-between py-1 border-b" style={{ borderColor: '#1e293b' }}>
                        <span style={{ color: '#64748b' }}>{l}</span>
                        <span className="font-mono font-bold" style={{ color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </>}

                {tab === 'exit' && <>
                  <Slider label="Plusvalía escenario conservador" value={p.appreciationScenario1Percent} min={0} max={100} step={5}
                    display={`+${p.appreciationScenario1Percent}%`} onChange={v => set('appreciationScenario1Percent', v)} />
                  <Slider label="Plusvalía escenario optimista" value={p.appreciationScenario2Percent} min={0} max={150} step={5}
                    display={`+${p.appreciationScenario2Percent}%`} onChange={v => set('appreciationScenario2Percent', v)} />
                  <Slider label="Años de análisis" value={p.analysisYears} min={3} max={10} step={1}
                    display={`${p.analysisYears} años`} onChange={v => set('analysisYears', v)} />
                  <Slider label="Gastos de venta" value={p.saleCostPercent} min={0} max={5} step={0.5}
                    display={`${p.saleCostPercent}%`} onChange={v => set('saleCostPercent', v)} />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1">Mes escritura</p>
                      <select value={p.startMonth} onChange={e => set('startMonth', parseInt(e.target.value))}
                        className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }}>
                        {MONTHS_LONG.map((m, i) => <option key={i} value={i}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1">Año escritura</p>
                      <input type="number" value={p.startYear} onChange={e => set('startYear', parseInt(e.target.value) || 2026)}
                        className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9' }} />
                    </div>
                  </div>
                </>}
              </div>
            </div>

            {/* Resumen crédito */}
            <div className="rounded-xl p-4" style={{ background: '#1e293b', border: '1px solid #334155' }}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Resumen Crédito</p>
              {[
                ['Valor propiedad', fUF(p.propertyValueUF, 0)],
                ['Monto crédito', fUF(R.loanUF, 0)],
                ['Dividendo (UF)', fUF(R.monthlyPaymentUF)],
                ['Dividendo (CLP)', fCLPFull(R.monthlyPaymentCLP)],
                ['Arr. neto / mes', fCLPFull(R.netMonthlyRentCLP)],
                ['Flujo mensual', fCLP(R.avgMonthlyCashFlow)],
                ['Primer dividendo', firstDividendLabel],
                ['Cap Rate', fPct(R.capRatePercent)],
                ['Total top-ups 5 años', fCLP(R.totalNegativeCashFlow)],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1.5 border-b" style={{ borderColor: '#0f172a' }}>
                  <span className="text-[11px]" style={{ color: '#64748b' }}>{l}</span>
                  <span className="text-[11px] font-mono font-bold" style={{ color: '#cbd5e1' }}>{v}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* ── MAIN CHARTS + SCENARIOS + TABLE ──────────── */}
          <div className="space-y-5">

            {/* Cash flow bar chart */}
            <div className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #334155' }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white">Flujo de Caja Mensual</h2>
                  <p className="text-[11px]" style={{ color: '#64748b' }}>
                    Verde = período de gracia (sin dividendo) · Barras = flujo neto mensual
                  </p>
                </div>
                <div className="flex gap-3 text-[10px]" style={{ color: '#64748b' }}>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-2 rounded-sm" style={{ background: '#3b82f6', opacity: 0.7 }}></span>Arr. neto
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-2 rounded-sm" style={{ background: '#f59e0b', opacity: 0.7 }}></span>Dividendo
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#475569' }} interval={5} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#475569' }}
                    tickFormatter={v => `$${(Math.abs(v) / 1000).toFixed(0)}k`}
                    tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                  <Bar dataKey="Flujo neto" fill="#10b981" radius={[2, 2, 0, 0]} opacity={0.85}
                    // recharts doesn't support conditional fill natively without custom cells
                  />
                  <Line type="monotone" dataKey="Arr. neto" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
                  <Line type="monotone" dataKey="Dividendo" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Two mini charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Cumulative flow */}
              <div className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #334155' }}>
                <h2 className="text-sm font-bold text-white mb-0.5">Flujo Acumulado</h2>
                <p className="text-[11px] mb-4" style={{ color: '#64748b' }}>Dinero neto del inversionista</p>
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#475569' }} interval={9} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#475569' }}
                      tickFormatter={v => `$${(v / 1_000_000).toFixed(1)}M`} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="Acumulado" stroke="#f59e0b" fill="url(#gFlow)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex justify-between mt-2">
                  <div>
                    <p className="text-[10px]" style={{ color: '#64748b' }}>Total top-ups</p>
                    <p className="text-sm font-bold" style={{ color: '#f87171' }}>{fCLP(R.totalNegativeCashFlow)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px]" style={{ color: '#64748b' }}>Flujo final</p>
                    <p className="text-sm font-bold" style={{
                      color: (R.monthlyData.at(-1)?.cumulativeCashFlow ?? 0) >= 0 ? '#34d399' : '#94a3b8'
                    }}>{fCLP(R.monthlyData.at(-1)?.cumulativeCashFlow ?? 0)}</p>
                  </div>
                </div>
              </div>

              {/* Equity chart */}
              <div className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #334155' }}>
                <h2 className="text-sm font-bold text-white mb-0.5">Evolución Patrimonio</h2>
                <p className="text-[11px] mb-4" style={{ color: '#64748b' }}>Valor dpto vs deuda (millones CLP)</p>
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gProp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gDebt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#475569' }} interval={9} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#475569' }}
                      tickFormatter={v => `$${v.toFixed(0)}M`} tickLine={false} axisLine={false} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [`$${Number(v).toFixed(1)} M`]}
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Area type="monotone" dataKey="Propiedad" stroke="#3b82f6" fill="url(#gProp)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="Deuda" stroke="#ef4444" fill="url(#gDebt)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="Patrimonio" stroke="#10b981" fill="none" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-[10px]" style={{ color: '#64748b' }}>
                  {[['#3b82f6', 'Valor dpto'], ['#ef4444', 'Deuda'], ['#10b981', 'Patrimonio']].map(([c, l]) => (
                    <span key={l} className="flex items-center gap-1">
                      <span className="inline-block w-3 h-1 rounded" style={{ background: c }}></span>{l}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Scenario cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ScenarioCard scenario={R.scenario1} label="Escenario Conservador" accent="amber" params={p} />
              <ScenarioCard scenario={R.scenario2} label="Escenario Optimista" accent="emerald" params={p} />
            </div>

            {/* Detailed table */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #334155' }}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #334155' }}>
                <div>
                  <h2 className="text-sm font-bold text-white">Flujo de Caja Detallado</h2>
                  <p className="text-[11px]" style={{ color: '#64748b' }}>
                    {totalMonths} meses · {MONTHS_LONG[p.startMonth]} {p.startYear}
                    {' → '}
                    {(() => { const { month: m, year: y } = addMonths(p.startMonth, p.startYear, totalMonths); return `${MONTHS_LONG[m]} ${y}`; })()}
                  </p>
                </div>
                <button onClick={() => setShowAll(!showAll)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: '#334155', color: '#cbd5e1' }}>
                  {showAll ? 'Ver primeros 12' : `Ver todos (${totalMonths})`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#0f172a50', borderBottom: '1px solid #334155' }}>
                      {['#', 'Fecha', 'Arr. Bruto', 'Adm.', 'Arr. Neto', 'Dividendo', 'Flujo Neto', 'Flujo Acum.', 'Saldo Deuda (UF)', 'Patrimonio'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: '#475569', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, idx) => (
                      <tr key={row.month}
                        style={{
                          borderBottom: '1px solid #1e293b33',
                          background: row.isGracePeriod ? '#05966920' : idx % 2 === 0 ? 'transparent' : '#0f172a20',
                        }}>
                        <td className="px-3 py-2 font-mono" style={{ color: '#475569' }}>{row.month}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: '#94a3b8' }}>
                          {row.dateShort}
                          {row.isGracePeriod && (
                            <span className="ml-1 text-[9px] px-1 py-0.5 rounded font-bold"
                              style={{ background: '#05966930', color: '#34d399' }}>GRACIA</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono" style={{ color: '#64748b' }}>{fCLP(row.grossRent)}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: '#f87171' }}>-{fCLP(row.managementFee)}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: '#60a5fa' }}>{fCLP(row.netRent)}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: '#f59e0b' }}>
                          {row.dividend === 0 ? <span style={{ color: '#334155' }}>—</span> : `-${fCLP(row.dividend)}`}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold"
                          style={{ color: row.netCashFlow >= 0 ? '#34d399' : '#f87171' }}>
                          {fCLP(row.netCashFlow)}
                        </td>
                        <td className="px-3 py-2 font-mono"
                          style={{ color: row.cumulativeCashFlow >= 0 ? '#34d399' : '#94a3b8' }}>
                          {fCLP(row.cumulativeCashFlow)}
                        </td>
                        <td className="px-3 py-2 font-mono" style={{ color: '#64748b' }}>
                          {fUF(row.outstandingBalanceUF, 0)}
                        </td>
                        <td className="px-3 py-2 font-mono" style={{ color: '#cbd5e1' }}>
                          {fCLP(row.equityCLP)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!showAll && (
                <div className="px-5 py-3 text-center">
                  <button onClick={() => setShowAll(true)}
                    className="text-xs transition-colors" style={{ color: '#f59e0b' }}>
                    + Ver {totalMonths - 12} meses restantes →
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <p className="text-center text-[11px] py-3" style={{ color: '#334155' }}>
              Proppi Simulador · Valores estimativos, no constituyen garantía de retorno ·
              UF ${p.ufValueCLP.toLocaleString('es-CL')} CLP · {p.commune}, {p.startYear}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
