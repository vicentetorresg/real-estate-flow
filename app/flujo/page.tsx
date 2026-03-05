'use client';

import React, { useState, useEffect, useMemo } from 'react';

// ─── Types ───────────────────────────────────────────────────
type DeliveryType = 'immediate' | 'future';
type Phase = 'pre-delivery' | 'grace' | 'guaranteed' | 'active';

interface SimulationParams {
  propertyValueUF: number; commune: string; ufValueCLP: number; ufAnnualGrowthPercent: number;
  deliveryType: DeliveryType; constructionMonths: number;
  financingPercent: number; annualRatePercent: number; loanTermYears: number;
  gracePeriodMonths: number; operationalCostsCLP: number;
  bonoPiePercent: number; clientPieUpfrontPct: number; clientPieCuotasCount: number;
  monthlyRentCLP: number; managementFeePercent: number;
  analysisYears: number; baseAnnualAppreciationPercent: number;
  scenario1FactorPercent: number; scenario2FactorPercent: number;
  saleCostPercent: number; startMonth: number; startYear: number;
  projectName: string; clientName: string; clientRut: string; clientEmail: string;
  parkingCount: number; parkingValueUF: number; parkingBonoPie: boolean;
  storageCount: number; storageValueUF: number; storageBonoPie: boolean;
  guaranteedRentEnabled: boolean; guaranteedRentMonths: number; guaranteedRentCLP: number;
  guaranteedRentNoAdmin: boolean; guaranteedRentUFAdjusted: boolean;
  vacancyDays: number; commonChargesCLP: number; reserveFundUF: number; rentAnnualExtraPercent: number;
}

interface MonthlyData {
  month: number; date: string; dateShort: string; ufValue: number; phase: Phase;
  grossRent: number; managementFee: number; netRent: number;
  pieCuota: number; pieUpfront: number; operationalCosts: number;
  corretaje: number; vacancyLoss: number; commonCharges: number; reserveFund: number;
  dividend: number; interest: number; principal: number;
  netCashFlow: number; cumulativeCashFlow: number;
  outstandingBalanceUF: number; outstandingBalanceCLP: number;
  propertyValueCLP: number; equityCLP: number;
}

interface ScenarioResult {
  appreciationPercent: number; salePriceUF: number; salePriceCLP: number;
  outstandingBalanceUF: number; outstandingBalanceCLP: number;
  grossEquityCLP: number; saleCostsCLP: number; netEquityCLP: number;
  cumulativeCashFlow: number; totalReturn: number; totalInvested: number;
  roiPercent: number; annualizedRoiPercent: number; equityMultiple: number;
}

interface SimulationResult {
  params: SimulationParams; totalPiePct: number; bonoPieUF: number; clientPieUF: number;
  clientPieUpfrontUF: number; clientPieCuotasUF: number; monthlyCuotaUF: number;
  loanUF: number; monthlyPaymentUF: number; monthlyPaymentCLP: number;
  netMonthlyRentCLP: number; capRatePercent: number;
  escrituraMonth: number; firstDividendMonth: number; rentStartMonth: number;
  totalTableMonths: number; guaranteedRentStartMonth: number; guaranteedRentEndMonth: number;
  monthlyData: MonthlyData[]; scenario1: ScenarioResult; scenario2: ScenarioResult;
  effectiveAnnual1: number; effectiveAnnual2: number;
  totalApprec1: number; totalApprec2: number;
  totalNegativeCashFlow: number; avgMonthlyCashFlow: number;
  propertyValueCLP: number; totalValueUF: number;
  totalNetRentReceived: number; totalDividendsPaid: number; bonoPieUFTotal: number;
}

// ─── Math ────────────────────────────────────────────────────
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

// ─── Dates ───────────────────────────────────────────────────
const MS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ML = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function addMonths(month: number, year: number, n: number) {
  const t = year * 12 + month + n;
  return { month: t % 12, year: Math.floor(t / 12) };
}
function dateLabel(month: number, year: number, short = false) {
  return short ? `${MS[month]} '${String(year).slice(2)}` : `${ML[month]} ${year}`;
}

// ─── Formatters ──────────────────────────────────────────────
function fCLP(v: number, compact = true): string {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v), s = v < 0 ? '-' : '';
  if (compact && abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (compact && abs >= 100_000)   return `${s}$${Math.round(abs / 1000)}k`;
  return `${s}$${Math.round(abs).toLocaleString('es-CL')}`;
}
function fUF(v: number, d = 2) {
  return `UF ${v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
function fPct(v: number, d = 2) {
  if (!isFinite(v)) return '∞';
  return `${v.toFixed(d).replace('.', ',')}%`;
}
const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #bfdbfe', borderRadius: 14 };

// ─── Simulation ──────────────────────────────────────────────
function runSimulation(p: SimulationParams): SimulationResult {
  const loanTermMonths  = p.loanTermYears * 12;
  const ufGrowth        = Math.pow(1 + p.ufAnnualGrowthPercent / 100, 1 / 12) - 1;
  const parkingTotalUF  = p.parkingCount * p.parkingValueUF;
  const storageTotalUF  = p.storageCount * p.storageValueUF;
  const totalValueUF    = p.propertyValueUF + parkingTotalUF + storageTotalUF;
  const piePct          = (100 - p.financingPercent) / 100;
  const totalPiePct     = 100 - p.financingPercent;
  const bonoPieDptoPct  = Math.min(p.bonoPiePercent, totalPiePct);
  const bonoPieDptoUF   = p.propertyValueUF * (bonoPieDptoPct / 100);
  const dptoPieUF       = p.propertyValueUF * piePct;
  const dptoClientPieUF = Math.max(0, dptoPieUF - bonoPieDptoUF);
  const parkingPieUF    = parkingTotalUF * piePct;
  const bonoPieParkingUF = p.parkingBonoPie ? parkingTotalUF * (bonoPieDptoPct / 100) : 0;
  const parkingClientPieUF = parkingPieUF - bonoPieParkingUF;
  const storagePieUF    = storageTotalUF * piePct;
  const bonoPieStorageUF = p.storageBonoPie ? storageTotalUF * (bonoPieDptoPct / 100) : 0;
  const storageClientPieUF = storagePieUF - bonoPieStorageUF;
  const loanUF          = totalValueUF * (p.financingPercent / 100);
  const bonoPieUF       = bonoPieDptoUF + bonoPieParkingUF + bonoPieStorageUF;
  const clientPieUF     = dptoClientPieUF + parkingClientPieUF + storageClientPieUF;
  const clientPieUpfrontUF = clientPieUF * (p.clientPieUpfrontPct / 100);
  const clientPieCuotasUF  = clientPieUF - clientPieUpfrontUF;
  const monthlyCuotaUF  = p.clientPieCuotasCount > 0 ? clientPieCuotasUF / p.clientPieCuotasCount : 0;
  const monthlyPaymentUF  = calcPMT(loanUF, p.annualRatePercent, loanTermMonths);
  const monthlyPaymentCLP = monthlyPaymentUF * p.ufValueCLP;
  const managementRate  = p.managementFeePercent / 100;
  const netMonthlyRentCLP = p.monthlyRentCLP * (1 - managementRate);
  const propertyValueCLP  = totalValueUF * p.ufValueCLP;
  const capRatePercent  = ((netMonthlyRentCLP * 12) / propertyValueCLP) * 100;
  // vacancyRate reemplazado por lógica concentrada
  const preDeliveryMonths  = p.deliveryType === 'future' ? p.constructionMonths : 0;
  const escrituraMonth     = preDeliveryMonths;
  const rentStartMonth     = preDeliveryMonths + 1;
  const firstDividendMonth = preDeliveryMonths + p.gracePeriodMonths + 1;
  const totalTableMonths   = preDeliveryMonths + p.analysisYears * 12;
  const ufVal0 = p.ufValueCLP;
  const pieUpfront0 = clientPieUpfrontUF * ufVal0;
  const reserveFundCLP0 = preDeliveryMonths === 0 ? p.reserveFundUF * ufVal0 : 0;
  const upfrontCLP = pieUpfront0 + p.operationalCostsCLP + reserveFundCLP0;
  const month0: MonthlyData = {
    month: 0, date: dateLabel(p.startMonth, p.startYear), dateShort: dateLabel(p.startMonth, p.startYear, true),
    ufValue: ufVal0, phase: 'pre-delivery',
    grossRent: 0, managementFee: 0, netRent: 0,
    pieCuota: 0, pieUpfront: pieUpfront0, operationalCosts: p.operationalCostsCLP,
    corretaje: 0, vacancyLoss: 0, commonCharges: 0, reserveFund: reserveFundCLP0,
    dividend: 0, interest: 0, principal: 0,
    netCashFlow: -upfrontCLP, cumulativeCashFlow: -upfrontCLP,
    outstandingBalanceUF: loanUF, outstandingBalanceCLP: loanUF * ufVal0,
    propertyValueCLP, equityCLP: propertyValueCLP - loanUF * ufVal0,
  };
  const data: MonthlyData[] = [month0];
  let cumCashFlow = -upfrontCLP, mortgagePaid = 0;
  const gRentStart_outer = p.guaranteedRentEnabled ? escrituraMonth + 2 : 9999;
  const gRentEnd_outer   = p.guaranteedRentEnabled ? gRentStart_outer + p.guaranteedRentMonths - 1 : -1;
  const corretajeMonth   = p.guaranteedRentEnabled ? gRentEnd_outer + 1 : rentStartMonth;
  const reserveFundMonth = preDeliveryMonths > 0 ? preDeliveryMonths : -1;
  for (let m = 1; m <= totalTableMonths; m++) {
    const { month: cm, year: cy } = addMonths(p.startMonth, p.startYear, m);
    const ufVal = p.ufValueCLP * Math.pow(1 + ufGrowth, m);
    const isPreDelivery = m <= preDeliveryMonths;
    const isGrace       = !isPreDelivery && m < firstDividendMonth;
    const isGuaranteedPhase = !isPreDelivery && !isGrace && p.guaranteedRentEnabled
      && m >= (escrituraMonth + 2) && m <= (escrituraMonth + 2 + p.guaranteedRentMonths - 1);
    const phase: Phase = isPreDelivery ? 'pre-delivery' : isGrace ? 'grace' : isGuaranteedPhase ? 'guaranteed' : 'active';
    const gRentStart = p.guaranteedRentEnabled ? escrituraMonth + 2 : 9999;
    const gRentEnd   = p.guaranteedRentEnabled ? gRentStart + p.guaranteedRentMonths - 1 : -1;
    const isGuaranteed = p.guaranteedRentEnabled && m >= gRentStart && m <= gRentEnd;
    const marketRentStart = p.guaranteedRentEnabled ? gRentEnd + 1 : rentStartMonth;
    let grossRent = 0, managementFee = 0, netRent = 0;
    if (isGuaranteed) {
      const yearsFromGStart = Math.floor((m - gRentStart) / 12);
      grossRent = p.guaranteedRentUFAdjusted && yearsFromGStart > 0
        ? p.guaranteedRentCLP * Math.pow(1 + p.ufAnnualGrowthPercent / 100, yearsFromGStart)
        : p.guaranteedRentCLP;
      managementFee = p.guaranteedRentNoAdmin ? 0 : grossRent * managementRate;
      netRent = grossRent - managementFee;
    } else if (m >= marketRentStart) {
      const yearsFromMarket = Math.floor((m - marketRentStart) / 12);
      const rentGrowthFactor = yearsFromMarket > 0
        ? Math.pow(1 + (p.ufAnnualGrowthPercent + p.rentAnnualExtraPercent) / 100, yearsFromMarket) : 1;
      grossRent = p.monthlyRentCLP * rentGrowthFactor;
      managementFee = grossRent * managementRate;
      netRent = grossRent - managementFee;
    }
    const isMarketRent = m >= marketRentStart;
    const isVacancyMonth = isMarketRent && p.vacancyDays > 0 && (m - marketRentStart) % 12 === 0;
    const vacancyLoss = isVacancyMonth ? grossRent * (p.vacancyDays / 30) : 0;
    const commonCharges = isVacancyMonth ? p.commonChargesCLP : 0;
    const corretaje    = m === corretajeMonth ? p.monthlyRentCLP * 0.5 : 0;
    const reserveFund  = m === reserveFundMonth ? p.reserveFundUF * ufVal : 0;
    const pieCuota     = m >= 1 && m <= p.clientPieCuotasCount ? monthlyCuotaUF * ufVal : 0;
    let dividend = 0, interest = 0, principal = 0;
    if (m >= firstDividendMonth) {
      dividend = monthlyPaymentUF * ufVal;
      const r  = p.annualRatePercent / 100 / 12;
      const bal = calcBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaid);
      interest  = bal * r * ufVal;
      principal = dividend - interest;
      mortgagePaid++;
    }
    const netCashFlow = netRent - vacancyLoss - commonCharges - corretaje - reserveFund - pieCuota - dividend;
    cumCashFlow += netCashFlow;
    const outstandingBalanceUF  = calcBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaid);
    const outstandingBalanceCLP = outstandingBalanceUF * ufVal;
    const propValCLP = totalValueUF * ufVal;
    data.push({
      month: m, date: dateLabel(cm, cy), dateShort: dateLabel(cm, cy, true),
      ufValue: ufVal, phase,
      grossRent, managementFee, netRent,
      pieCuota, pieUpfront: 0, operationalCosts: 0,
      corretaje, vacancyLoss, commonCharges, reserveFund,
      dividend, interest, principal,
      netCashFlow, cumulativeCashFlow: cumCashFlow,
      outstandingBalanceUF, outstandingBalanceCLP,
      propertyValueCLP: propValCLP, equityCLP: propValCLP - outstandingBalanceCLP,
    });
  }
  function calcScenario(aprecPct: number): ScenarioResult {
    const last = data[data.length - 1];
    const salePriceUF    = totalValueUF * (1 + aprecPct / 100);
    const salePriceCLP   = salePriceUF * last.ufValue;
    const grossEquityCLP = salePriceCLP - last.outstandingBalanceCLP;
    const saleCostsCLP   = salePriceCLP * (p.saleCostPercent / 100);
    const netEquityCLP   = grossEquityCLP - saleCostsCLP;
    const totalInvested  = data.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), 0);
    const totalReturn    = netEquityCLP + last.cumulativeCashFlow;
    const roi            = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : Infinity;
    const annRoi         = totalInvested > 0 ? (Math.pow(1 + roi / 100, 1 / p.analysisYears) - 1) * 100 : Infinity;
    const em             = totalInvested > 0 ? (totalReturn + totalInvested) / totalInvested : Infinity;
    return {
      appreciationPercent: aprecPct, salePriceUF, salePriceCLP,
      outstandingBalanceUF: last.outstandingBalanceUF, outstandingBalanceCLP: last.outstandingBalanceCLP,
      grossEquityCLP, saleCostsCLP, netEquityCLP,
      cumulativeCashFlow: last.cumulativeCashFlow,
      totalReturn, totalInvested, roiPercent: roi, annualizedRoiPercent: annRoi, equityMultiple: em,
    };
  }
  const totalNeg = data.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), 0);
  const avgFlow  = data.slice(1).reduce((s, d) => s + d.netCashFlow, 0) / totalTableMonths;
  const gRentStartGlobal = p.guaranteedRentEnabled ? (preDeliveryMonths + 2) : 9999;
  const gRentEndGlobal   = p.guaranteedRentEnabled ? gRentStartGlobal + p.guaranteedRentMonths - 1 : -1;
  const eff1 = p.baseAnnualAppreciationPercent * p.scenario1FactorPercent / 100;
  const eff2 = p.baseAnnualAppreciationPercent * p.scenario2FactorPercent / 100;
  const totalApprec1 = (Math.pow(1 + eff1 / 100, p.analysisYears) - 1) * 100;
  const totalApprec2 = (Math.pow(1 + eff2 / 100, p.analysisYears) - 1) * 100;
  return {
    params: p, totalPiePct, bonoPieUF, clientPieUF,
    clientPieUpfrontUF, clientPieCuotasUF, monthlyCuotaUF,
    loanUF, monthlyPaymentUF, monthlyPaymentCLP,
    netMonthlyRentCLP, capRatePercent,
    escrituraMonth, firstDividendMonth, rentStartMonth, totalTableMonths,
    guaranteedRentStartMonth: gRentStartGlobal, guaranteedRentEndMonth: gRentEndGlobal,
    monthlyData: data, scenario1: calcScenario(totalApprec1), scenario2: calcScenario(totalApprec2),
    effectiveAnnual1: eff1, effectiveAnnual2: eff2,
    totalApprec1, totalApprec2,
    totalNegativeCashFlow: totalNeg, avgMonthlyCashFlow: avgFlow,
    propertyValueCLP, totalValueUF,
    totalNetRentReceived: data.reduce((s, d) => s + d.netRent, 0),
    totalDividendsPaid: data.reduce((s, d) => s + d.dividend, 0),
    bonoPieUFTotal: bonoPieUF,
  };
}

// ─── CompactScenarios ────────────────────────────────────────
function CompactScenarios({ R, p }: { R: SimulationResult; p: SimulationParams }) {
  const escrituraMes = addMonths(p.startMonth, p.startYear, p.deliveryType === 'future' ? p.constructionMonths : 0);
  const { month: sm, year: sy } = addMonths(escrituraMes.month, escrituraMes.year, p.analysisYears * 12);

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {([
        { label: 'Escenario Conservador', s: R.scenario1, ann: R.effectiveAnnual1, total: R.totalApprec1, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
        { label: 'Escenario Optimista',   s: R.scenario2, ann: R.effectiveAnnual2, total: R.totalApprec2, color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
      ] as const).map(({ label, s, ann, total, color, bg, border }) => (
        <div key={label} style={{ width: 220, flexShrink: 0, background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '12px 14px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
          <p style={{ fontSize: 10, color: '#6b93c4', marginBottom: 8 }}>
            {fPct(ann, 1)}/año · +{fPct(total, 1)} en {p.analysisYears}a · Venta {ML[sm]} {sy}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: '#ffffff88', borderRadius: 8, padding: '8px 10px' }}>
              <div>
                <p style={{ fontSize: 9, color: '#6b93c4', marginBottom: 1 }}>💰 Total invertido</p>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fCLP(R.totalNegativeCashFlow, false)}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, color: '#6b93c4', marginBottom: 1 }}>🚀 Podrías ganar</p>
                <p style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fCLP(s.totalReturn, false)}</p>
              </div>
            </div>
            {[
              ['Precio venta', fUF(s.salePriceUF, 0)],
              ['Patrimonio neto', fCLP(s.netEquityCLP, false)],
              ['ROI total', fPct(s.roiPercent, 0)],
              ['ROI anualizado', fPct(s.annualizedRoiPercent, 1)],
              ['Equity múltiplo', `${isFinite(s.equityMultiple) ? s.equityMultiple.toFixed(1) : '∞'}x`],
              ['Deuda pendiente', fUF(s.outstandingBalanceUF, 0)],
            ].map(([lbl, val]) => (
              <div key={lbl as string}>
                <p style={{ fontSize: 9, color: '#6b93c4', marginBottom: 1 }}>{lbl}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SalesSummaryBox ─────────────────────────────────────────
function SalesSummaryBox({ R, p }: { R: SimulationResult; p: SimulationParams }) {
  const last = R.monthlyData[R.monthlyData.length - 1];
  const lastUF = last.ufValue;
  const apreciacionUF1 = R.scenario1.salePriceUF - R.totalValueUF;
  const apreciacionUF2 = R.scenario2.salePriceUF - R.totalValueUF;
  const amortizacionUF1 = R.loanUF - R.scenario1.outstandingBalanceUF;
  const amortizacionUF2 = R.loanUF - R.scenario2.outstandingBalanceUF;

  const rows: [string, string, string][] = [
    ['Precio compra inicial (UF)',  fUF(R.totalValueUF, 0),               fUF(R.totalValueUF, 0)],
    ['Precio compra inicial (CLP)', fCLP(R.totalValueUF * p.ufValueCLP, false), fCLP(R.totalValueUF * p.ufValueCLP, false)],
    ['Precio de venta (UF)',        fUF(R.scenario1.salePriceUF, 0),      fUF(R.scenario2.salePriceUF, 0)],
    ['Precio de venta (CLP)',       fCLP(R.scenario1.salePriceCLP, false), fCLP(R.scenario2.salePriceCLP, false)],
    ['Ganancia plusvalía (UF)',     fUF(apreciacionUF1, 0),               fUF(apreciacionUF2, 0)],
    ['Ganancia plusvalía (CLP)',    fCLP(apreciacionUF1 * lastUF, false),  fCLP(apreciacionUF2 * lastUF, false)],
    ['Deuda hipot. inicial (UF)',   fUF(R.loanUF, 0),                     fUF(R.loanUF, 0)],
    ['Deuda hipot. al vender (UF)', fUF(R.scenario1.outstandingBalanceUF, 0), fUF(R.scenario2.outstandingBalanceUF, 0)],
    ['Amortización (UF)',           fUF(amortizacionUF1, 0),              fUF(amortizacionUF2, 0)],
    ['Amortización (CLP)',          fCLP(amortizacionUF1 * lastUF, false), fCLP(amortizacionUF2 * lastUF, false)],
    ['Inversión total',             fCLP(R.totalNegativeCashFlow, false), fCLP(R.totalNegativeCashFlow, false)],
    ['Utilidad del ejercicio',      fCLP(R.scenario1.totalReturn, false), fCLP(R.scenario2.totalReturn, false)],
    ['ROI Neto',                    fPct(R.scenario1.roiPercent, 1),      fPct(R.scenario2.roiPercent, 1)],
    ['Cap Rate',                    fPct(R.capRatePercent),               fPct(R.capRatePercent)],
  ];

  return (
    <div style={{ ...CARD, padding: '14px 18px', width: 360, flexShrink: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Resumen de Venta
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '5px 8px', borderBottom: '2px solid #dbeafe', color: '#6b93c4', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Concepto</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '2px solid #dbeafe', color: '#1d4ed8', fontSize: 9, textTransform: 'uppercase' }}>Conservador</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '2px solid #dbeafe', color: '#15803d', fontSize: 9, textTransform: 'uppercase' }}>Optimista</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([lbl, v1, v2], i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f0f4ff' }}>
              <td style={{ padding: '4px 8px', color: '#6b93c4', fontSize: 10 }}>{lbl}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', fontSize: 11 }}>{v1}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#15803d', fontSize: 11 }}>{v2}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── FlowTable ───────────────────────────────────────────────
function FlowTable({ data, p, R }: { data: MonthlyData[]; p: SimulationParams; R: SimulationResult }) {
  const COL_W   = 100;
  const LABEL_W = 240;
  const lastMonth = R.totalTableMonths;

  function colBg(d: MonthlyData) {
    if (d.month === lastMonth) return '#f5f3ff';
    if (d.month === 0)         return '#faf5ff';
    if (d.phase === 'pre-delivery') return '#fff7ed';
    if (d.phase === 'grace')        return '#f0fdf4';
    if (d.phase === 'guaranteed')   return '#dcfce7';
    return '#fff';
  }
  function headerBg(d: MonthlyData) {
    if (d.month === lastMonth) return '#6d28d9';
    if (d.month === 0)         return '#7c3aed';
    if (d.phase === 'pre-delivery') return '#d97706';
    if (d.phase === 'grace')        return '#16a34a';
    if (d.phase === 'guaranteed')   return '#15803d';
    return '#1d4ed8';
  }
  function phaseBadge(d: MonthlyData) {
    if (d.month === lastMonth) return 'Venta';
    if (d.month === 0)         return 'Promesa';
    if (d.phase === 'pre-delivery') return 'Obra';
    if (d.phase === 'grace')        return 'Gracia';
    return null;
  }

  const [balanceOpen, setBalanceOpen] = React.useState(false);

  type RowDef = {
    label: string;
    type: 'section' | 'income' | 'expense' | 'subtotal' | 'result' | 'balance' | 'equity' | 'info' | 'toggle';
    fn: (d: MonthlyData) => number | string | null;
    tooltipFn?: (d: MonthlyData) => string | null;
  };

  const rows: RowDef[] = [
    { label: 'INGRESOS', type: 'section', fn: () => null },
    { label: 'Arriendo bruto', type: 'income', fn: d => d.grossRent > 0 ? d.grossRent : null },
    { label: 'GASTOS', type: 'section', fn: () => null },
    { label: 'Pie up front (contado)', type: 'expense', fn: d => d.pieUpfront > 0 ? -d.pieUpfront : null },
    { label: `Cuota pie (${p.clientPieCuotasCount} cuotas)`, type: 'expense', fn: d => d.pieCuota > 0 ? -d.pieCuota : null },
    { label: 'Gastos operacionales crédito', type: 'expense', fn: d => d.operationalCosts > 0 ? -d.operationalCosts : null },
    { label: 'Fondo de reserva inicial', type: 'expense', fn: d => d.reserveFund > 0 ? -d.reserveFund : null },
    ...(p.commonChargesCLP > 0 ? [{ label: 'Gastos comunes', type: 'expense' as const, fn: (d: MonthlyData) => d.commonCharges > 0 ? -d.commonCharges : null }] : []),
    { label: 'Fase', type: 'info', fn: d => {
      if (d.month === 0) return 'Promesa';
      if (d.phase === 'pre-delivery') return 'Construcción';
      if (d.phase === 'grace') return '⏸ Gracia';
      return null;
    }},
    { label: 'Dividendo', type: 'expense', fn: d => d.dividend > 0 ? -d.dividend : null,
      tooltipFn: d => d.dividend > 0 ? `Interés: ${fCLP(d.interest, false)}\nAmortización: ${fCLP(d.principal, false)}` : null },
    { label: 'Corretaje (50% 1er arriendo)', type: 'expense', fn: d => d.corretaje > 0 ? -d.corretaje : null },
    { label: `Adm. inmobiliaria (${p.managementFeePercent}%)`, type: 'expense', fn: d => d.managementFee > 0 ? -d.managementFee : null },
    ...(p.vacancyDays > 0 ? [{ label: `Vacancia (${p.vacancyDays} días/año)`, type: 'expense' as const, fn: (d: MonthlyData) => d.vacancyLoss > 0 ? -d.vacancyLoss : null }] : []),
    { label: 'FLUJO MENSUAL', type: 'section', fn: () => null },
    { label: 'Flujo neto del mes', type: 'result', fn: d => d.netCashFlow },
    { label: 'Flujo acumulado', type: 'result', fn: d => d.cumulativeCashFlow },
    // ── PATRIMONIO ACUMULADO (siempre visible, gris) ─────────
    { label: 'Patrimonio acumulado', type: 'equity', fn: (d: MonthlyData) => d.equityCLP },

    // ── GANANCIA TOTAL CON VENTA (siempre visible) ────────────
    { label: 'GANANCIA TOTAL CON VENTA', type: 'section', fn: () => null },
    { label: 'Resultado final (conservador)', type: 'result', fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario1.totalReturn : null },
    { label: 'Resultado final (optimista)', type: 'result', fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario2.totalReturn : null },

    { label: 'BALANCE AL CIERRE', type: 'toggle', fn: () => null },
    ...(balanceOpen ? [
      { label: 'UF del período', type: 'balance' as const, fn: (d: MonthlyData) => d.ufValue },
      { label: 'Saldo deuda (UF)', type: 'balance' as const, fn: (d: MonthlyData) => d.outstandingBalanceUF },
      { label: 'Saldo deuda (CLP)', type: 'balance' as const, fn: (d: MonthlyData) => d.outstandingBalanceCLP },
      { label: 'EVENTO DE VENTA', type: 'section' as const, fn: () => null },
      { label: 'Precio venta (conservador)', type: 'income' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario1.salePriceCLP : null },
      { label: 'Precio venta (optimista)', type: 'income' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario2.salePriceCLP : null },
      { label: 'Saldo deuda a cancelar', type: 'expense' as const, fn: (d: MonthlyData) => d.month === lastMonth ? -d.outstandingBalanceCLP : null },
      { label: `Patrimonio neto cons. (neto 2,38% corretaje)`, type: 'subtotal' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario1.netEquityCLP : null },
      { label: `Patrimonio neto opt. (neto 2,38% corretaje)`, type: 'subtotal' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario2.netEquityCLP : null },
    ] : []),
  ];

  function formatVal(row: RowDef, raw: number | string | null): string {
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
    if (row.type === 'equity')   return '#94a3b8';
    return '#0f2957';
  }

  return (
    <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
      <table style={{
        width: '100%',
        minWidth: LABEL_W + COL_W * data.length,
        borderCollapse: 'separate',
        borderSpacing: 0,
        fontSize: 12,
      }}>
        <thead>
          <tr>
            <th style={{
              width: LABEL_W, minWidth: LABEL_W,
              background: '#1a46c8',
              position: 'sticky', left: 0, zIndex: 4,
              boxShadow: '2px 0 6px rgba(0,0,0,0.12)',
            }} />
            {data.map(d => {
              const badge = phaseBadge(d);
              return (
                <th key={d.month} style={{ minWidth: COL_W, background: headerBg(d), textAlign: 'center', padding: '3px 2px', borderLeft: '1px solid #ffffff20' }}>
                  {badge && <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: '#ffffff30', padding: '1px 6px', borderRadius: 8 }}>{badge}</span>}
                </th>
              );
            })}
          </tr>
          <tr>
            <th style={{
              background: '#1a46c8', color: '#fff', textAlign: 'left',
              padding: '10px 16px', fontSize: 11, fontWeight: 700,
              position: 'sticky', left: 0, zIndex: 4,
              boxShadow: '2px 0 6px rgba(0,0,0,0.12)',
              borderBottom: '2px solid #ffffff40',
            }}>
              Concepto
            </th>
            {data.map(d => (
              <th key={d.month} style={{
                minWidth: COL_W, textAlign: 'center', padding: '7px 4px',
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
            const isToggle  = row.type === 'toggle';
            const rowBg = isSection || isToggle ? '#dbeafe' : row.type === 'result' ? '#eff6ff' : row.type === 'subtotal' ? '#f0f9ff' : row.type === 'equity' ? '#f8fafc' : '#fff';

            if (isToggle) {
              return (
                <tr key={ri}>
                  <td style={{
                    padding: '7px 16px', background: '#dbeafe',
                    borderRight: '2px solid #bfdbfe', borderTop: '2px solid #bfdbfe',
                    position: 'sticky', left: 0, zIndex: 2,
                    boxShadow: '2px 0 6px rgba(0,0,0,0.08)',
                  }}>
                    <button onClick={() => setBalanceOpen(v => !v)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 10, fontWeight: 700, color: '#1d4ed8',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      <span style={{ fontSize: 12 }}>{balanceOpen ? '▼' : '▶'}</span>
                      Balance al cierre
                    </button>
                  </td>
                  {data.map(d => (
                    <td key={d.month} style={{ background: '#dbeafe', borderLeft: '1px solid #f0f4ff', borderTop: '2px solid #bfdbfe' }} />
                  ))}
                </tr>
              );
            }

            return (
              <tr key={ri}>
                <td style={{
                  padding: isSection ? '7px 16px' : '5px 16px',
                  fontWeight: isSection ? 700 : row.type === 'result' ? 700 : 500,
                  fontSize: isSection ? 10 : 12,
                  color: isSection ? '#1d4ed8' : '#334d6e',
                  textTransform: isSection ? 'uppercase' : 'none',
                  letterSpacing: isSection ? '0.08em' : 'normal',
                  background: rowBg,
                  borderRight: '2px solid #bfdbfe',
                  whiteSpace: 'nowrap',
                  position: 'sticky', left: 0, zIndex: 2,
                  boxShadow: '2px 0 6px rgba(0,0,0,0.08)',
                }}>
                  {row.label}
                </td>
                {data.map(d => {
                  const raw     = row.fn(d);
                  const display = formatVal(row, raw);
                  const color   = cellColor(row, raw);
                  const bg      = isSection ? rowBg : colBg(d);
                  const tooltip = row.tooltipFn ? row.tooltipFn(d) : null;
                  return (
                    <td key={d.month} style={{
                      textAlign: 'right', padding: '5px 10px', position: 'relative',
                      fontFamily: isSection ? 'inherit' : 'monospace',
                      fontWeight: row.type === 'result' ? 700 : 500,
                      fontSize: isSection ? 0 : 12,
                      color, background: bg, whiteSpace: 'nowrap',
                      borderLeft: '1px solid #f0f4ff',
                      cursor: 'default',
                    }}>
                      {row.type === 'info'
                        ? (typeof raw === 'string'
                          ? <span style={{ fontSize: 10, fontFamily: 'inherit', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8' }}>{raw}</span>
                          : '')
                        : display}
                      {tooltip && (
                        <span className="td-tip" style={{
                          display: 'none', position: 'absolute', bottom: '100%', right: 0, zIndex: 100,
                          background: '#0f2957', color: '#e0f2fe', borderRadius: 8,
                          padding: '6px 10px', fontSize: 10, whiteSpace: 'pre', minWidth: 180,
                          boxShadow: '0 4px 16px #1d4ed840', pointerEvents: 'none',
                        }}>{tooltip}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Auth ────────────────────────────────────────────────────
// ─── Page ────────────────────────────────────────────────────
export default function FlujoPage() {
  const [p, setP] = useState<SimulationParams | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('s');
      if (s) setP({ ...JSON.parse(atob(s)), saleCostPercent: 2.38 });
    } catch {}
  }, []);

  const R = useMemo(() => (p ? runSimulation(p) : null), [p]);

  if (!p || !R) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', background: '#f0f7ff' }}>
        <p style={{ color: '#6b93c4', fontSize: 14 }}>Cargando flujo...</p>
      </div>
    );
  }

  const legendItems = [
    { bg: '#7c3aed', label: p.deliveryType === 'future' ? 'Promesa' : 'Escritura' },
    ...(p.deliveryType === 'future' ? [{ bg: '#d97706', label: 'Construcción' }] : []),
    { bg: '#16a34a', label: 'Período de gracia' },
    ...(p.guaranteedRentEnabled ? [{ bg: '#15803d', label: `Arriendo garantizado (${p.guaranteedRentMonths / 12}a)` }] : []),
    { bg: '#1d4ed8', label: 'Período activo' },
    { bg: '#6d28d9', label: 'Evento de venta' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7ff', fontFamily: 'system-ui,sans-serif', color: '#0f2957' }}>
      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg,#1d4ed8,#0284c7)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>Flujo mensual detallado</p>
          <h1 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0 }}>
            {p.projectName || 'Simulación'}{p.clientName ? ` · ${p.clientName}` : ''}
          </h1>
          {p.commune && <p style={{ fontSize: 11, color: '#bfdbfe', margin: '2px 0 0' }}>{p.commune} · {fUF(p.propertyValueUF + p.parkingCount * p.parkingValueUF + p.storageCount * p.storageValueUF, 0)} · {ML[p.startMonth]} {p.startYear}</p>}
        </div>
        <button onClick={() => window.close()} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, fontWeight: 600, fontSize: 12, padding: '7px 16px', background: '#ffffff20', color: '#fff' }}>
          ✕ Cerrar
        </button>
      </header>

      {/* Content */}
      <main style={{ padding: '20px 20px' }}>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, fontSize: 11, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: '#6b93c4', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Fases:</span>
          {legendItems.map(({ bg, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#334d6e' }}>
              <span style={{ width: 12, height: 12, background: bg, borderRadius: 3, display: 'inline-block', flexShrink: 0 }} />
              {label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#93b4d4' }}>
            {R.totalTableMonths + 1} columnas · primera columna fija
          </span>
        </div>

        {/* Table */}
        <FlowTable data={R.monthlyData} p={p} R={R} />

        {/* Resumen escenarios + venta */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 16 }}>
          <CompactScenarios R={R} p={p} />
          <SalesSummaryBox R={R} p={p} />
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: '#93b4d4', marginTop: 16 }}>
          Proppi Simulador · Valores estimativos, no garantizan retorno · UF ${p.ufValueCLP.toLocaleString('es-CL')} · {p.commune} {p.startYear}
        </p>
      </main>
    </div>
  );
}
