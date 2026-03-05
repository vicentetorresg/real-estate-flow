'use client';

import React, { useState, useMemo, useCallback } from 'react';
import PdfExport from './components/PdfExport';
import RutInput from './components/RutInput';
import {
  ComposedChart, Bar, Cell, Line, XAxis, YAxis, CartesianGrid,
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
  operationalCostsCLP: number;  // gastos operacionales del crédito (cobrados el mes de escritura)

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
  baseAnnualAppreciationPercent: number;  // % anual base (potencial de la zona)
  scenario1FactorPercent: number;         // % del base para conservador (ej: 30)
  scenario2FactorPercent: number;         // % del base para optimista (ej: 70)
  saleCostPercent: number;
  startMonth: number;
  startYear: number;

  // Proyecto y cliente
  projectName: string;
  clientName: string;
  clientRut: string;
  clientEmail: string;
  // Estacionamientos y bodega
  parkingCount: number;      // cantidad de estacionamientos (0-3)
  parkingValueUF: number;    // precio UF por estacionamiento
  parkingBonoPie: boolean;   // developer cubre el pie
  storageCount: number;      // cantidad de bodegas (0 o 1)
  storageValueUF: number;    // precio UF de la bodega
  storageBonoPie: boolean;   // developer cubre el pie de bodega
  // Arriendo garantizado
  guaranteedRentEnabled: boolean;
  guaranteedRentMonths: number;       // duración total en meses (12,24,36,48,60)
  guaranteedRentCLP: number;          // monto mensual garantizado bruto
  guaranteedRentNoAdmin: boolean;     // true = sin cobro de administración
  guaranteedRentUFAdjusted: boolean;  // true = se reajusta anualmente por UF
  vacancyDays: number;        // días de vacancia al año (0 = sin vacancia)
  commonChargesCLP: number;   // gastos comunes mensuales CLP (solo durante vacancia concentrada)
  reserveFundUF: number;      // fondo de reserva inicial del proyecto en UF
  rentAnnualExtraPercent: number; // % extra de reajuste anual sobre UF (ej: 2 = UF+2%)
}

type Phase = 'pre-delivery' | 'grace' | 'guaranteed' | 'active';

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
  operationalCosts: number; // gastos operacionales del crédito (sólo en mes de escritura)
  corretaje: number;     // costo corretaje (50% primer mes arriendo mercado)
  vacancyLoss: number;   // pérdida por vacancia (concentrada)
  commonCharges: number; // gastos comunes (solo meses con vacancia concentrada)
  reserveFund: number;   // fondo de reserva (mes de escritura)

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
  guaranteedRentStartMonth: number;
  guaranteedRentEndMonth: number;
  // Datos
  monthlyData: MonthlyData[]; // incluye mes 0 (upfront)
  scenario1: ScenarioResult;
  scenario2: ScenarioResult;
  effectiveAnnual1: number;
  effectiveAnnual2: number;
  totalApprec1: number;
  totalApprec2: number;
  totalNegativeCashFlow: number;
  avgMonthlyCashFlow: number;
  propertyValueCLP: number;
  totalValueUF: number;
  totalNetRentReceived: number;
  totalDividendsPaid: number;
  bonoPieUFTotal: number;
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

  // ── Totales incluyendo estacionamientos y bodega ──────────
  const parkingTotalUF    = p.parkingCount * p.parkingValueUF;
  const storageTotalUF    = p.storageCount * p.storageValueUF;
  const totalValueUF      = p.propertyValueUF + parkingTotalUF + storageTotalUF;

  // ── Pie desglose ──────────────────────────────────────────
  const piePct            = (100 - p.financingPercent) / 100;
  const totalPiePct       = 100 - p.financingPercent;
  // Dpto
  const bonoPieDptoPct    = Math.min(p.bonoPiePercent, totalPiePct);
  const bonoPieDptoUF     = p.propertyValueUF * (bonoPieDptoPct / 100);
  const dptoPieUF         = p.propertyValueUF * piePct;
  const dptoClientPieUF   = Math.max(0, dptoPieUF - bonoPieDptoUF);
  // Parking
  const parkingPieUF      = parkingTotalUF * piePct;
  const bonoPieParkingUF  = p.parkingBonoPie ? parkingTotalUF * (bonoPieDptoPct / 100) : 0;
  const parkingClientPieUF = parkingPieUF - bonoPieParkingUF;
  // Storage
  const storagePieUF      = storageTotalUF * piePct;
  const bonoPieStorageUF  = p.storageBonoPie ? storageTotalUF * (bonoPieDptoPct / 100) : 0;
  const storageClientPieUF = storagePieUF - bonoPieStorageUF;
  // Totales
  const loanUF            = totalValueUF * (p.financingPercent / 100);
  const bonoPieUF         = bonoPieDptoUF + bonoPieParkingUF + bonoPieStorageUF;
  const clientPieUF       = dptoClientPieUF + parkingClientPieUF + storageClientPieUF;
  const clientPieUpfrontUF = clientPieUF * (p.clientPieUpfrontPct / 100);
  const clientPieCuotasUF  = clientPieUF - clientPieUpfrontUF;
  const monthlyCuotaUF    = p.clientPieCuotasCount > 0 ? clientPieCuotasUF / p.clientPieCuotasCount : 0;

  // ── Hipoteca ──────────────────────────────────────────────
  const monthlyPaymentUF  = calcPMT(loanUF, p.annualRatePercent, loanTermMonths);
  const monthlyPaymentCLP = monthlyPaymentUF * p.ufValueCLP;

  // ── Renta ─────────────────────────────────────────────────
  const managementRate    = p.managementFeePercent / 100;
  const netMonthlyRentCLP = p.monthlyRentCLP * (1 - managementRate);
  const propertyValueCLP  = totalValueUF * p.ufValueCLP;
  const capRatePercent    = ((netMonthlyRentCLP * 12) / propertyValueCLP) * 100;
  // vacancyRate reemplazado por lógica concentrada por año

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
  const pieUpfront0 = clientPieUpfrontUF * ufVal0;
  // Fondo de reserva se paga en escritura. Para entrega inmediata, escritura = mes 0.
  const reserveFundCLP0 = preDeliveryMonths === 0 ? p.reserveFundUF * ufVal0 : 0;
  const upfrontCLP  = pieUpfront0 + p.operationalCostsCLP + reserveFundCLP0;

  const month0: MonthlyData = {
    month: 0,
    date: dateLabel(p.startMonth, p.startYear),
    dateShort: dateLabel(p.startMonth, p.startYear, true),
    ufValue: ufVal0, phase: 'pre-delivery',
    grossRent: 0, managementFee: 0, netRent: 0,
    pieCuota: 0, pieUpfront: pieUpfront0, operationalCosts: p.operationalCostsCLP,
    corretaje: 0, vacancyLoss: 0, commonCharges: 0, reserveFund: reserveFundCLP0,
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

  // Corretaje y vacancia
  const gRentStart_outer = p.guaranteedRentEnabled ? escrituraMonth + 2 : 9999;
  const gRentEnd_outer   = p.guaranteedRentEnabled ? gRentStart_outer + p.guaranteedRentMonths - 1 : -1;
  const corretajeMonth   = p.guaranteedRentEnabled ? gRentEnd_outer + 1 : rentStartMonth;
  const reserveFundMonth = preDeliveryMonths > 0 ? preDeliveryMonths : -1; // escritura futura

  for (let m = 1; m <= totalTableMonths; m++) {
    const { month: cm, year: cy } = addMonths(p.startMonth, p.startYear, m);
    const ufVal = p.ufValueCLP * Math.pow(1 + ufGrowth, m);

    // Fase
    const isPreDelivery = m <= preDeliveryMonths;
    const isGrace       = !isPreDelivery && m < firstDividendMonth;
    const isGuaranteedPhase = !isPreDelivery && !isGrace && p.guaranteedRentEnabled
      && m >= (escrituraMonth + 2) && m <= (escrituraMonth + 2 + p.guaranteedRentMonths - 1);
    const phase: Phase  = isPreDelivery ? 'pre-delivery' : isGrace ? 'grace' : isGuaranteedPhase ? 'guaranteed' : 'active';

    // Arriendo (garantizado o mercado)
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
        ? Math.pow(1 + (p.ufAnnualGrowthPercent + p.rentAnnualExtraPercent) / 100, yearsFromMarket)
        : 1;
      grossRent = p.monthlyRentCLP * rentGrowthFactor;
      managementFee = grossRent * managementRate;
      netRent = grossRent - managementFee;
    }

    // Vacancia: concentrada en el primer mes de cada año de arriendo mercado
    const isMarketRent = m >= marketRentStart;
    const isVacancyMonth = isMarketRent && p.vacancyDays > 0 && (m - marketRentStart) % 12 === 0;
    const vacancyLoss = isVacancyMonth ? grossRent * (p.vacancyDays / 30) : 0;
    const commonCharges = isVacancyMonth ? p.commonChargesCLP : 0;

    // Corretaje: 50% del arriendo bruto, solo el primer mes de arriendo mercado
    const corretaje = m === corretajeMonth ? p.monthlyRentCLP * 0.5 : 0;

    // Fondo de reserva: solo en mes de escritura futura
    const reserveFund = m === reserveFundMonth ? p.reserveFundUF * ufVal : 0;

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

    const netCashFlow = netRent - vacancyLoss - commonCharges - corretaje - reserveFund - pieCuota - dividend;
    cumCashFlow += netCashFlow;

    const outstandingBalanceUF  = calcBalance(loanUF, p.annualRatePercent, loanTermMonths, mortgagePaid);
    const outstandingBalanceCLP = outstandingBalanceUF * ufVal;
    const propValCLP            = totalValueUF * ufVal;

    data.push({
      month: m, date: dateLabel(cm, cy), dateShort: dateLabel(cm, cy, true),
      ufValue: ufVal, phase,
      grossRent, managementFee, netRent,
      pieCuota, pieUpfront: 0, operationalCosts: 0,
      corretaje, vacancyLoss, commonCharges, reserveFund,
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
    const salePriceUF       = totalValueUF * (1 + aprecPct / 100);
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

  const totalNeg             = data.reduce((s, d) => s + (d.netCashFlow < 0 ? Math.abs(d.netCashFlow) : 0), 0);
  const avgFlow              = data.slice(1).reduce((s, d) => s + d.netCashFlow, 0) / totalTableMonths;
  const totalNetRentReceived = data.reduce((s, d) => s + d.netRent, 0);
  const totalDividendsPaid   = data.reduce((s, d) => s + d.dividend, 0);

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
    guaranteedRentStartMonth: gRentStartGlobal,
    guaranteedRentEndMonth: gRentEndGlobal,
    monthlyData: data,
    scenario1: calcScenario(totalApprec1),
    scenario2: calcScenario(totalApprec2),
    effectiveAnnual1: eff1, effectiveAnnual2: eff2,
    totalApprec1, totalApprec2,
    totalNegativeCashFlow: totalNeg,
    avgMonthlyCashFlow: avgFlow,
    propertyValueCLP,
    totalValueUF, totalNetRentReceived, totalDividendsPaid,
    bonoPieUFTotal: bonoPieUF,
  };
}

// ─────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────
const DEFAULTS: SimulationParams = {
  propertyValueUF: 3000, commune: 'Cerrillos',
  ufValueCLP: 38500, ufAnnualGrowthPercent: 3.5,
  deliveryType: 'immediate', constructionMonths: 24,
  financingPercent: 90, annualRatePercent: 4.0, loanTermYears: 30, gracePeriodMonths: 3, operationalCostsCLP: 2000000,
  bonoPiePercent: 10,
  clientPieUpfrontPct: 0,   // con bono pie = 10%, cliente no paga nada
  clientPieCuotasCount: 24,
  monthlyRentCLP: 450000, managementFeePercent: 7,
  analysisYears: 5,
  baseAnnualAppreciationPercent: 5,
  scenario1FactorPercent: 30,
  scenario2FactorPercent: 70,
  saleCostPercent: 2.38, startMonth: 2, startYear: 2026,
  projectName: '',
  clientName: '', clientRut: '', clientEmail: '',
  parkingCount: 0, parkingValueUF: 300, parkingBonoPie: true,
  storageCount: 0, storageValueUF: 100, storageBonoPie: true,
  guaranteedRentEnabled: false,
  guaranteedRentMonths: 24,
  guaranteedRentCLP: 450000,
  guaranteedRentNoAdmin: true,
  guaranteedRentUFAdjusted: false,
  vacancyDays: 0,
  commonChargesCLP: 0,
  reserveFundUF: 0,
  rentAnnualExtraPercent: 2,
};

// ─────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─── Comunas RM ───────────────────────────────────────────────
const COMUNAS: Record<string, string> = {
  // Arica y Parinacota
  'Arica': '#c0392b', 'Camarones': '#c0392b', 'General Lagos': '#c0392b', 'Putre': '#c0392b',
  // Tarapacá
  'Alto Hospicio': '#e67e22', 'Camiña': '#e67e22', 'Colchane': '#e67e22', 'Huara': '#e67e22',
  'Iquique': '#e67e22', 'Pica': '#e67e22', 'Pozo Almonte': '#e67e22',
  // Antofagasta
  'Antofagasta': '#d4ac0d', 'Calama': '#d4ac0d', 'María Elena': '#d4ac0d', 'Mejillones': '#d4ac0d',
  'Ollagüe': '#d4ac0d', 'San Pedro de Atacama': '#d4ac0d', 'Sierra Gorda': '#d4ac0d',
  'Taltal': '#d4ac0d', 'Tocopilla': '#d4ac0d',
  // Atacama
  'Alto del Carmen': '#8e44ad', 'Caldera': '#8e44ad', 'Chañaral': '#8e44ad', 'Copiapó': '#8e44ad',
  'Diego de Almagro': '#8e44ad', 'Freirina': '#8e44ad', 'Huasco': '#8e44ad',
  'Tierra Amarilla': '#8e44ad', 'Vallenar': '#8e44ad',
  // Coquimbo
  'Andacollo': '#27ae60', 'Canela': '#27ae60', 'Combarbalá': '#27ae60', 'Coquimbo': '#27ae60',
  'Illapel': '#27ae60', 'La Higuera': '#27ae60', 'La Serena': '#27ae60', 'Los Vilos': '#27ae60',
  'Monte Patria': '#27ae60', 'Ovalle': '#27ae60', 'Paihuano': '#27ae60', 'Punitaqui': '#27ae60',
  'Río Hurtado': '#27ae60', 'Salamanca': '#27ae60', 'Vicuña': '#27ae60',
  // Valparaíso
  'Algarrobo': '#2980b9', 'Cabildo': '#2980b9', 'Calera': '#2980b9', 'Cartagena': '#2980b9',
  'Casablanca': '#2980b9', 'Catemu': '#2980b9', 'Concón': '#2980b9', 'El Quisco': '#2980b9',
  'El Tabo': '#2980b9', 'Hijuelas': '#2980b9', 'Isla de Pascua': '#2980b9', 'Juan Fernández': '#2980b9',
  'La Cruz': '#2980b9', 'La Ligua': '#2980b9', 'Limache': '#2980b9', 'Llaillay': '#2980b9',
  'Los Andes': '#2980b9', 'Nogales': '#2980b9', 'Olmué': '#2980b9', 'Panquehue': '#2980b9',
  'Papudo': '#2980b9', 'Petorca': '#2980b9', 'Puchuncaví': '#2980b9', 'Putaendo': '#2980b9',
  'Quilpué': '#2980b9', 'Quillota': '#2980b9', 'Quintero': '#2980b9', 'Rinconada': '#2980b9',
  'San Antonio': '#2980b9', 'San Esteban': '#2980b9', 'San Felipe': '#2980b9', 'Santa María': '#2980b9',
  'Santo Domingo': '#2980b9', 'Valparaíso': '#2980b9', 'Villa Alemana': '#2980b9',
  'Viña del Mar': '#2980b9', 'Zapallar': '#2980b9',
  // Región Metropolitana
  'Alhué': '#f22424', 'Buin': '#3960bf', 'Calera de Tango': '#64a508', 'Cerrillos': '#f224d8',
  'Cerro Navia': '#39bfa8', 'Colina': '#a55d08', 'Conchalí': '#5724f2', 'Curacaví': '#3fbf39',
  'El Bosque': '#a5083c', 'El Monte': '#24a5f2', 'Estación Central': '#b4bf39', 'Huechuraba': '#8408a5',
  'Independencia': '#24f28a', 'Isla de Maipo': '#bf5539', 'La Cisterna': '#0815a5',
  'La Florida': '#71f224', 'La Granja': '#bf3992', 'La Pintana': '#089fa5', 'La Reina': '#f2be24',
  'Lampa': '#7639bf', 'Las Condes': '#08a522', 'Lo Barnechea': '#f2243e', 'Lo Espejo': '#3971bf',
  'Lo Prado': '#78a508', 'Macul': '#f124f2', 'Maipú': '#39bf97', 'María Pinto': '#a54908',
  'Melipilla': '#3d24f2', 'Ñuñoa': '#50bf39', 'Padre Hurtado': '#a50851', 'Paine': '#24bff2',
  'Pedro Aguirre Cerda': '#bfb939', 'Peñaflor': '#7008a5', 'Peñalolén': '#24f270',
  'Pirque': '#bf4339', 'Providencia': '#0829a5', 'Pudahuel': '#8cf224', 'Puente Alto': '#bf39a4',
  'Quilicura': '#08a597', 'Quinta Normal': '#f2a324', 'Recoleta': '#6539bf', 'Renca': '#08a50e',
  'San Bernardo': '#f22458', 'San Joaquín': '#3982bf', 'San José de Maipo': '#8ca508',
  'San Miguel': '#d724f2', 'San Pedro': '#39bf86', 'San Ramón': '#a53508', 'Santiago': '#2425f2',
  'Talagante': '#61bf39', 'Til Til': '#a50865', 'Vitacura': '#24d9f2',
  // O'Higgins
  'Chépica': '#e74c3c', 'Chimbarongo': '#e74c3c', 'Codegua': '#e74c3c', 'Coinco': '#e74c3c',
  'Coltauco': '#e74c3c', 'Doñihue': '#e74c3c', 'Graneros': '#e74c3c', 'La Estrella': '#e74c3c',
  'Las Cabras': '#e74c3c', 'Litueche': '#e74c3c', 'Lolol': '#e74c3c', 'Machalí': '#e74c3c',
  'Malloa': '#e74c3c', 'Marchihue': '#e74c3c', 'Mostazal': '#e74c3c', 'Nancagua': '#e74c3c',
  'Navidad': '#e74c3c', 'Olivar': '#e74c3c', 'Palmilla': '#e74c3c', 'Paredones': '#e74c3c',
  'Peralillo': '#e74c3c', 'Peumo': '#e74c3c', 'Pichidegua': '#e74c3c', 'Pichilemu': '#e74c3c',
  'Placilla': '#e74c3c', 'Pumanque': '#e74c3c', 'Quinta de Tilcoco': '#e74c3c', 'Rancagua': '#e74c3c',
  'Rengo': '#e74c3c', 'Requínoa': '#e74c3c', 'San Fernando': '#e74c3c', 'San Vicente': '#e74c3c',
  'Santa Cruz': '#e74c3c',
  // Maule
  'Cauquenes': '#16a085', 'Chanco': '#16a085', 'Colbún': '#16a085', 'Constitución': '#16a085',
  'Curicó': '#16a085', 'Curepto': '#16a085', 'Empedrado': '#16a085', 'Hualañé': '#16a085',
  'Licantén': '#16a085', 'Linares': '#16a085', 'Longaví': '#16a085', 'Maule': '#16a085',
  'Molina': '#16a085', 'Parral': '#16a085', 'Pelarco': '#16a085', 'Pelluhue': '#16a085',
  'Pencahue': '#16a085', 'Rauco': '#16a085', 'Retiro': '#16a085', 'Río Claro': '#16a085',
  'Romeral': '#16a085', 'Sagrada Familia': '#16a085', 'San Clemente': '#16a085', 'San Javier': '#16a085',
  'San Rafael': '#16a085', 'Talca': '#16a085', 'Teno': '#16a085', 'Vichuquén': '#16a085',
  'Villa Alegre': '#16a085', 'Yerbas Buenas': '#16a085',
  // Ñuble
  'Bulnes': '#7f8c8d', 'Chillán': '#7f8c8d', 'Chillán Viejo': '#7f8c8d', 'Cobquecura': '#7f8c8d',
  'Coelemu': '#7f8c8d', 'Coihueco': '#7f8c8d', 'El Carmen': '#7f8c8d', 'Ninhue': '#7f8c8d',
  'Ñiquén': '#7f8c8d', 'Pemuco': '#7f8c8d', 'Pinto': '#7f8c8d', 'Portezuelo': '#7f8c8d',
  'Quillón': '#7f8c8d', 'Quirihue': '#7f8c8d', 'Ránquil': '#7f8c8d', 'San Carlos': '#7f8c8d',
  'San Fabián': '#7f8c8d', 'San Ignacio': '#7f8c8d', 'San Nicolás': '#7f8c8d', 'Treguaco': '#7f8c8d',
  'Yungay': '#7f8c8d',
  // Biobío
  'Alto Biobío': '#2c3e50', 'Antuco': '#2c3e50', 'Arauco': '#2c3e50', 'Cabrero': '#2c3e50',
  'Cañete': '#2c3e50', 'Chiguayante': '#2c3e50', 'Concepción': '#2c3e50', 'Contulmo': '#2c3e50',
  'Coronel': '#2c3e50', 'Curanilahue': '#2c3e50', 'Florida': '#2c3e50', 'Hualpén': '#2c3e50',
  'Hualqui': '#2c3e50', 'Laja': '#2c3e50', 'Lebu': '#2c3e50', 'Los Álamos': '#2c3e50',
  'Los Ángeles': '#2c3e50', 'Lota': '#2c3e50', 'Mulchén': '#2c3e50', 'Nacimiento': '#2c3e50',
  'Negrete': '#2c3e50', 'Penco': '#2c3e50', 'Quilaco': '#2c3e50', 'Quilleco': '#2c3e50',
  'San Pedro de la Paz': '#2c3e50', 'San Rosendo': '#2c3e50', 'Santa Bárbara': '#2c3e50',
  'Santa Juana': '#2c3e50', 'Talcahuano': '#2c3e50', 'Tirúa': '#2c3e50', 'Tomé': '#2c3e50',
  'Tucapel': '#2c3e50', 'Yumbel': '#2c3e50',
  // La Araucanía
  'Angol': '#1e8449', 'Carahue': '#1e8449', 'Cholchol': '#1e8449', 'Collipulli': '#1e8449',
  'Cunco': '#1e8449', 'Curacautín': '#1e8449', 'Curarrehue': '#1e8449', 'Ercilla': '#1e8449',
  'Freire': '#1e8449', 'Galvarino': '#1e8449', 'Gorbea': '#1e8449', 'Lautaro': '#1e8449',
  'Loncoche': '#1e8449', 'Lonquimay': '#1e8449', 'Los Sauces': '#1e8449', 'Lumaco': '#1e8449',
  'Melipeuco': '#1e8449', 'Nueva Imperial': '#1e8449', 'Padre Las Casas': '#1e8449',
  'Perquenco': '#1e8449', 'Pitrufquén': '#1e8449', 'Pucón': '#1e8449', 'Purén': '#1e8449',
  'Renaico': '#1e8449', 'Saavedra': '#1e8449', 'Temuco': '#1e8449', 'Teodoro Schmidt': '#1e8449',
  'Toltén': '#1e8449', 'Traiguén': '#1e8449', 'Victoria': '#1e8449', 'Vilcún': '#1e8449',
  'Villarrica': '#1e8449',
  // Los Ríos
  'Corral': '#1abc9c', 'Futrono': '#1abc9c', 'La Unión': '#1abc9c', 'Lago Ranco': '#1abc9c',
  'Lanco': '#1abc9c', 'Los Lagos': '#1abc9c', 'Máfil': '#1abc9c', 'Mariquina': '#1abc9c',
  'Paillaco': '#1abc9c', 'Panguipulli': '#1abc9c', 'Río Bueno': '#1abc9c', 'Valdivia': '#1abc9c',
  // Los Lagos
  'Ancud': '#2471a3', 'Calbuco': '#2471a3', 'Castro': '#2471a3', 'Chaitén': '#2471a3',
  'Chonchi': '#2471a3', 'Cochamó': '#2471a3', 'Curaco de Vélez': '#2471a3', 'Dalcahue': '#2471a3',
  'Fresia': '#2471a3', 'Frutillar': '#2471a3', 'Futaleufú': '#2471a3', 'Hualaihué': '#2471a3',
  'Llanquihue': '#2471a3', 'Los Muermos': '#2471a3', 'Maullín': '#2471a3', 'Osorno': '#2471a3',
  'Palena': '#2471a3', 'Puerto Montt': '#2471a3', 'Puerto Octay': '#2471a3', 'Puerto Varas': '#2471a3',
  'Puqueldón': '#2471a3', 'Purranque': '#2471a3', 'Puyehue': '#2471a3', 'Queilén': '#2471a3',
  'Quellón': '#2471a3', 'Quemchi': '#2471a3', 'Quinchao': '#2471a3', 'Río Negro': '#2471a3',
  'San Juan de la Costa': '#2471a3', 'San Pablo': '#2471a3',
  // Aysén
  'Aysén': '#9b59b6', 'Chile Chico': '#9b59b6', 'Cisnes': '#9b59b6', 'Cochrane': '#9b59b6',
  'Coyhaique': '#9b59b6', 'Guaitecas': '#9b59b6', 'Lago Verde': '#9b59b6', 'O\'Higgins': '#9b59b6',
  'Río Ibáñez': '#9b59b6', 'Tortel': '#9b59b6',
  // Magallanes
  'Antártica': '#1a5276', 'Cabo de Hornos': '#1a5276', 'Laguna Blanca': '#1a5276',
  'Natales': '#1a5276', 'Porvenir': '#1a5276', 'Primavera': '#1a5276', 'Punta Arenas': '#1a5276',
  'Río Verde': '#1a5276', 'San Gregorio': '#1a5276', 'Timaukel': '#1a5276', 'Torres del Paine': '#1a5276',
};

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
      <p style={{ fontSize: 17, fontWeight: 800, color: clr[type], lineHeight: 1.2, whiteSpace: 'nowrap' }}>{value}</p>
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

function NumberInput({ label, value, onChange, suffix, decimals = 0 }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; decimals?: number;
}) {
  const fmt = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const [raw, setRaw] = React.useState(fmt(value));
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => { if (!focused) setRaw(fmt(value)); }, [value, focused]);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#4a7abf' }}>{label}</span>
        {suffix && <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700 }}>{suffix}</span>}
      </div>
      <input
        style={INPUT_S}
        value={raw}
        onFocus={() => { setFocused(true); setRaw(String(value)); }}
        onChange={e => {
          const s = e.target.value.replace(/[^\d]/g, '');
          setRaw(s);
          const n = parseInt(s, 10);
          if (!isNaN(n)) onChange(n);
        }}
        onBlur={() => { setFocused(false); setRaw(fmt(value)); }}
        inputMode="numeric"
      />
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

const ASESORES: { name: string; email: string; phone: string }[] = [
  { name: 'Diego Sánchez',       email: 'diego.sanchez@proppi.cl',       phone: '56997550071' },
  { name: 'Cristóbal Sepúlveda', email: 'cristobal.sepulveda@proppi.cl', phone: '56954895625' },
  { name: 'Matías Bertelsen',    email: 'matias.bertelsen@proppi.cl',    phone: '56968202364' },
  { name: 'Vicente Torres',      email: 'vicente.torres@proppi.cl',      phone: '56994366697' },
];

function SendModal({ p, R, getShareLink, onClose, defaultAsesor = '', onAsesorChange }: {
  p: SimulationParams; R: SimulationResult; getShareLink: (mode: 'static' | 'dynamic') => string; onClose: () => void;
  defaultAsesor?: string; onAsesorChange?: (v: string) => void;
}) {
  const [step, setStep] = React.useState<'mode' | 'insights' | 'send' | 'sent'>('mode');
  const [mode, setMode] = React.useState<'static' | 'dynamic'>('static');
  const [to, setTo] = React.useState(p.clientEmail || '');
  const [asesor, setAsesor] = React.useState(defaultAsesor);
  const asesorObj = ASESORES.find(a => a.name === asesor) ?? null;
  const handleSetAsesor = (v: string) => { setAsesor(v); onAsesorChange?.(v); };
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const shareLink = getShareLink(mode);

  const [insightsText, setInsightsText] = React.useState('');
  const [insightsLoading, setInsightsLoading] = React.useState(true);
  const [includeInsights, setIncludeInsights] = React.useState<boolean | null>(null);
  const [insightsError, setInsightsError] = React.useState('');
  const insightsScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (step !== 'insights') return;
    if (insightsText) return; // already generated
    let cancelled = false;
    setInsightsLoading(true);
    const last = R.monthlyData[R.monthlyData.length - 1];
    const r = {
      clientPieUF: R.clientPieUF,
      monthlyPaymentCLP: R.monthlyPaymentCLP,
      netMonthlyRentCLP: R.netMonthlyRentCLP,
      capRatePercent: R.capRatePercent,
      totalNegativeCashFlow: R.totalNegativeCashFlow,
      avgMonthlyCashFlow: R.avgMonthlyCashFlow,
      totalTableMonths: R.totalTableMonths,
      positiveMonths: R.monthlyData.slice(1).filter(d => d.netCashFlow > 0).length,
      negativeMonths: R.monthlyData.slice(1).filter(d => d.netCashFlow < 0).length,
      lastCumulativeCashFlow: last.cumulativeCashFlow,
      totalApprec1: R.totalApprec1,
      totalApprec2: R.totalApprec2,
      scenario1: R.scenario1,
      scenario2: R.scenario2,
    };
    (async () => {
      try {
        const res = await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p, r }),
        });
        if (!res.ok || !res.body) {
          const errText = await res.text();
          if (!cancelled) setInsightsError(errText || 'Error al generar análisis');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          setInsightsText(prev => prev + decoder.decode(value));
        }
      } catch {}
      if (!cancelled) setInsightsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [step]);

  React.useEffect(() => {
    if (insightsScrollRef.current) {
      insightsScrollRef.current.scrollTop = insightsScrollRef.current.scrollHeight;
    }
  }, [insightsText]);

  const clientShareLink = asesorObj
    ? `${shareLink}&asesorName=${encodeURIComponent(asesorObj.name)}&asesorPhone=${encodeURIComponent(asesorObj.phone)}`
    : shareLink;

  const handleCopy = () => {
    navigator.clipboard.writeText(clientShareLink);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!to) return;
    setSending(true); setError('');
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, clientName: p.clientName, clientRut: p.clientRut, shareLink: clientShareLink, mode, projectName: p.projectName, asesorName: asesor, asesorEmail: asesorObj?.email ?? null, commune: p.commune, insights: insightsText || undefined }),
      });
      if (!res.ok) throw new Error('Error');
      setStep('sent');
    } catch {
      setError('No se pudo enviar. Revisa el email e intenta de nuevo.');
    } finally { setSending(false); }
  };

  function renderBold(text: string) {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} style={{ color: '#0f2957' }}>{part}</strong> : part
    );
  }

  function renderInsights(text: string) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) {
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 4 }}>
            <span style={{ width: 3, height: 14, background: '#1d4ed8', borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: '#0f2957', fontSize: 12 }}>{renderBold(line.slice(3))}</span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
      return <p key={i} style={{ fontSize: 11, color: '#334d6e', lineHeight: 1.7, margin: 0 }}>{renderBold(line)}</p>;
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000070', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: step === 'insights' ? 620 : 520, boxShadow: '0 24px 80px #0004', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* Modal header */}
        <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
              {step === 'insights' ? '✨ Análisis IA' : '📧 Enviar simulación'}
            </h2>
            {p.clientName && <p style={{ fontSize: 12, color: '#c4b5fd' }}>Para: <strong style={{ color: '#fff' }}>{p.clientName}</strong>{p.clientRut ? ` · ${p.clientRut}` : ''}</p>}
          </div>
          <button onClick={onClose} style={{ background: '#ffffff20', border: 'none', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {step === 'mode' ? (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0f2957', marginBottom: 4 }}>
                ¿Cómo quieres que {p.clientName ? <strong>{p.clientName}</strong> : 'tu cliente'} vea la simulación?
              </p>
              <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 16 }}>
                Tú eliges — el cliente solo recibirá el link según lo que decidas aquí.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {([
                  {
                    m: 'static' as const, icon: '📋', title: 'Solo visualización',
                    badge: 'Recomendado', badgeColor: '#1d4ed8',
                    desc: 'El cliente ve la propuesta limpia y profesional, sin poder tocar nada. Perfecto para una presentación formal.',
                  },
                  {
                    m: 'dynamic' as const, icon: '🎮', title: 'Interactiva',
                    badge: 'El cliente puede explorar', badgeColor: '#7c3aed',
                    desc: 'El cliente puede mover parámetros (tasa, años, arriendo…) y ver cómo cambian los números. Genera más conversación.',
                  },
                ]).map(({ m, icon, title, badge, badgeColor, desc }) => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    padding: 16, borderRadius: 14, border: `2px solid ${mode === m ? badgeColor : '#dbeafe'}`,
                    background: mode === m ? (m === 'static' ? '#eff6ff' : '#f5f3ff') : '#fff',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}>
                    <p style={{ fontSize: 24, marginBottom: 8 }}>{icon}</p>
                    <p style={{ fontSize: 12, fontWeight: 800, color: mode === m ? badgeColor : '#0f2957', marginBottom: 4 }}>{title}</p>
                    <span style={{ fontSize: 9, fontWeight: 700, background: mode === m ? badgeColor : '#dbeafe', color: mode === m ? '#fff' : '#6b93c4', padding: '2px 7px', borderRadius: 20, marginBottom: 8, display: 'inline-block' }}>{badge}</span>
                    <p style={{ fontSize: 10, color: '#93b4d4', lineHeight: 1.5, marginTop: 6 }}>{desc}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep('insights')} style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700,
              }}>
                Siguiente: análisis IA ✨
              </button>
            </>
          ) : step === 'insights' ? (
            <>
              <button onClick={() => setStep('mode')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6b93c4', marginBottom: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                ← Cambiar tipo ({mode === 'static' ? '📋 Solo visualización' : '🎮 Interactiva'})
              </button>
              <div style={{ fontSize: 11, color: insightsLoading ? '#7c3aed' : '#15803d', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                {insightsLoading
                  ? '✦ Generando análisis personalizado...'
                  : '✓ Análisis listo — previsualízalo antes de enviarlo'}
              </div>
              <div ref={insightsScrollRef} style={{
                background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: 12,
                padding: '14px 16px', marginBottom: 16, maxHeight: 340, overflowY: 'auto', minHeight: 100,
              }}>
                {insightsError
                  ? <p style={{ fontSize: 11, color: '#dc2626', textAlign: 'center', paddingTop: 20 }}>{insightsError}</p>
                  : insightsText
                    ? renderInsights(insightsText)
                    : <p style={{ fontSize: 11, color: '#93b4d4', textAlign: 'center', paddingTop: 30 }}>Generando...</p>}
              </div>
              {insightsLoading ? (
                <button disabled style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: '#c4b5fd', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'not-allowed' }}>
                  Generando análisis...
                </button>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button onClick={() => { setIncludeInsights(false); setStep('send'); }} style={{
                    padding: '12px 0', borderRadius: 10, border: '1px solid #dbeafe',
                    background: '#f8fbff', color: '#6b93c4', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    Enviar sin análisis
                  </button>
                  <button onClick={() => { setIncludeInsights(true); setStep('send'); }} style={{
                    padding: '12px 0', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                    ✨ Incluir en el email →
                  </button>
                </div>
              )}
            </>
          ) : step === 'sent' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>¡Simulación enviada!</p>
              <p style={{ fontSize: 12, color: '#6b93c4', marginBottom: 6 }}>
                {p.clientName ? <><strong>{p.clientName}</strong> recibirá</> : 'Se envió'} la versión {mode === 'static' ? 'de solo visualización 📋' : 'interactiva 🎮'} a <strong>{to}</strong>
              </p>
              {includeInsights && <p style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, marginBottom: 20 }}>✨ Con análisis IA incluido</p>}
              <button onClick={onClose} style={{ padding: '10px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setStep('insights')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6b93c4', marginBottom: 14, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                ← Volver al análisis
              </button>
              {includeInsights && (
                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                  ✨ El análisis IA se incluirá en el email
                </div>
              )}
              <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 6 }}>Link único generado para este cliente:</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                <input readOnly value={clientShareLink} style={{ ...INPUT_S, flex: 1, fontSize: 10, fontFamily: 'monospace' }} onClick={e => (e.target as HTMLInputElement).select()} />
                <button onClick={handleCopy} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #bfdbfe', background: copied ? '#f0fdf4' : '#eff6ff', color: copied ? '#15803d' : '#1d4ed8', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 6 }}>Asesor que envía:</p>
              <select value={asesor} onChange={e => handleSetAsesor(e.target.value)} style={{ ...INPUT_S, marginBottom: 14 }}>
                <option value="">— Seleccionar asesor —</option>
                {ASESORES.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
              <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 6 }}>Email del cliente:</p>
              <input type="email" value={to} onChange={e => setTo(e.target.value)} style={{ ...INPUT_S, marginBottom: 16 }} placeholder="email@cliente.com" />
              <div style={{ background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: '#334d6e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span>ℹ️</span>
                <span>
                  {mode === 'static'
                    ? 'El cliente verá la propuesta tal como la configuraste. No podrá modificar nada.'
                    : 'El cliente podrá cambiar parámetros y explorar escenarios. Siempre verá tu configuración inicial.'}
                </span>
              </div>
              <button onClick={handleSend} disabled={!to || sending} style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                cursor: to && !sending ? 'pointer' : 'not-allowed',
                background: to && !sending ? 'linear-gradient(135deg, #1d4ed8, #7c3aed)' : '#c4b5fd',
                color: '#fff', fontSize: 13, fontWeight: 700,
              }}>
                {sending ? '⏳ Enviando...' : `📧 Enviar simulación${to ? ` a ${to}` : ''}`}
              </button>
              {error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 10, textAlign: 'center' }}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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

function InvestmentSummary({ R, p }: { R: SimulationResult; p: SimulationParams }) {
  const totalRentCLP    = R.totalNetRentReceived;
  const totalDivCLP     = R.totalDividendsPaid;
  const totalInvested   = R.totalNegativeCashFlow;
  const lastCum         = R.monthlyData[R.monthlyData.length - 1].cumulativeCashFlow;

  return (
    <div style={{ ...CARD, padding: '14px 18px', marginBottom: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Resumen del período · {p.analysisYears} años
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <div>
          <p style={{ fontSize: 10, color: '#6b93c4', marginBottom: 3 }}>💵 Total que pusiste</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>{fCLP(totalInvested, false)}</p>
          <p style={{ fontSize: 9, color: '#93b4d4' }}>Pie + top-ups del período</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#6b93c4', marginBottom: 3 }}>🏠 Recibiste en arriendos</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#15803d', whiteSpace: 'nowrap' }}>{fCLP(totalRentCLP, false)}</p>
          <p style={{ fontSize: 9, color: '#93b4d4' }}>Renta neta acumulada</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#6b93c4', marginBottom: 3 }}>🏦 Pagaste en dividendos</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>{fCLP(totalDivCLP, false)}</p>
          <p style={{ fontSize: 9, color: '#93b4d4' }}>Total hipoteca período</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#6b93c4', marginBottom: 3 }}>📊 Flujo neto acumulado</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: lastCum >= 0 ? '#15803d' : '#dc2626', whiteSpace: 'nowrap' }}>{fCLP(lastCum, false)}</p>
          <p style={{ fontSize: 9, color: '#93b4d4' }}>Sin contar plusvalía</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TABLA HORIZONTAL (conceptos = filas, meses = columnas)
// ─────────────────────────────────────────────────────────────
function FlowTable({ data, p, R }: { data: MonthlyData[]; p: SimulationParams; R: SimulationResult }) {
  const COL_W = 92;
  const LABEL_W = 210;
  const [balanceOpen, setBalanceOpen] = useState(false);

  const lastMonth = R.totalTableMonths;

  // Colores por fase
  function colBg(d: MonthlyData) {
    if (d.month === lastMonth) return '#f5f3ff';     // venta
    if (d.month === 0) return '#faf5ff';              // promesa
    if (d.phase === 'pre-delivery') return '#fff7ed'; // construcción
    if (d.phase === 'grace')        return '#f0fdf4'; // gracia
    if (d.phase === 'guaranteed')   return '#dcfce7'; // garantizado
    return '#fff';
  }
  function headerBg(d: MonthlyData) {
    if (d.month === lastMonth) return '#6d28d9';
    if (d.month === 0) return '#7c3aed';
    if (d.phase === 'pre-delivery') return '#d97706';
    if (d.phase === 'grace')        return '#16a34a';
    if (d.phase === 'guaranteed')   return '#15803d';
    return '#1d4ed8';
  }

  // Badge de fase en header
  function phaseBadge(d: MonthlyData) {
    if (d.month === lastMonth) return 'Venta';
    if (d.month === 0) return 'Promesa';
    if (d.phase === 'pre-delivery') return 'Obra';
    if (d.phase === 'grace')        return 'Gracia';
    return null;
  }

  type RowDef = {
    label: string;
    type: 'section' | 'income' | 'expense' | 'subtotal' | 'result' | 'balance' | 'equity' | 'info' | 'toggle';
    fn: (d: MonthlyData) => number | string | null;
    tooltipFn?: (d: MonthlyData) => string | null;
  };

  const rows: RowDef[] = [
    // ── INGRESOS ──────────────────────────────────────────────
    { label: 'INGRESOS', type: 'section', fn: () => null },
    { label: `Arriendo bruto`, type: 'income', fn: d => d.grossRent > 0 ? d.grossRent : null },

    // ── GASTOS (orden: pie → gastos op → gastos comunes → dividendo → corretaje → adm → vacancia)
    { label: 'GASTOS', type: 'section', fn: () => null },
    // a) Pie
    { label: 'Pie up front (contado)', type: 'expense', fn: d => d.pieUpfront > 0 ? -d.pieUpfront : null },
    { label: `Cuota pie (${p.clientPieCuotasCount} cuotas)`, type: 'expense', fn: d => d.pieCuota > 0 ? -d.pieCuota : null },
    // b) Gastos operacionales
    { label: 'Gastos operacionales crédito', type: 'expense', fn: d => d.operationalCosts > 0 ? -d.operationalCosts : null },
    { label: 'Fondo de reserva inicial', type: 'expense', fn: d => d.reserveFund > 0 ? -d.reserveFund : null },
    // c) Gastos comunes (solo en meses de vacancia concentrada)
    ...(p.commonChargesCLP > 0 ? [{ label: 'Gastos comunes', type: 'expense' as const, fn: (d: MonthlyData) => d.commonCharges > 0 ? -d.commonCharges : null }] : []),
    // d) Dividendo
    { label: 'Fase', type: 'info', fn: d => {
      if (d.month === 0) return 'Promesa';
      if (d.phase === 'pre-delivery') return 'Construcción';
      if (d.phase === 'grace') return '⏸ Gracia';
      return null;
    }},
    { label: 'Dividendo', type: 'expense', fn: d => d.dividend > 0 ? -d.dividend : null,
      tooltipFn: d => d.dividend > 0
        ? `Interés: ${fCLP(d.interest, false)}\nAmortización: ${fCLP(d.principal, false)}`
        : null },
    // e) Corretaje
    { label: 'Corretaje (50% 1er arriendo)', type: 'expense', fn: d => d.corretaje > 0 ? -d.corretaje : null },
    // f) Administración
    { label: `Adm. inmobiliaria (${p.managementFeePercent}%)`, type: 'expense', fn: d => d.managementFee > 0 ? -d.managementFee : null },
    // Vacancia (solo si aplica)
    ...(p.vacancyDays > 0 ? [{ label: `Vacancia (${p.vacancyDays} días/año, concentrada)`, type: 'expense' as const, fn: (d: MonthlyData) => d.vacancyLoss > 0 ? -d.vacancyLoss : null }] : []),

    // ── FLUJO MENSUAL ─────────────────────────────────────────
    { label: 'FLUJO MENSUAL', type: 'section', fn: () => null },
    { label: 'Flujo neto del mes', type: 'result', fn: d => d.netCashFlow },
    { label: 'Flujo acumulado', type: 'result', fn: d => d.cumulativeCashFlow },

    // ── PATRIMONIO ACUMULADO (siempre visible, gris) ─────────
    { label: 'Patrimonio acumulado', type: 'equity', fn: (d: MonthlyData) => d.equityCLP },

    // ── GANANCIA TOTAL CON VENTA (siempre visible) ────────────
    { label: 'GANANCIA TOTAL CON VENTA', type: 'section', fn: () => null },
    { label: 'Resultado final (conservador)', type: 'result', fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario1.totalReturn : null },
    { label: 'Resultado final (optimista)', type: 'result', fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario2.totalReturn : null },

    // ── BALANCE AL CIERRE (colapsable) ────────────────────────
    { label: 'BALANCE AL CIERRE', type: 'toggle', fn: () => null },
    ...(balanceOpen ? [
      { label: 'UF del período', type: 'balance' as const, fn: (d: MonthlyData) => d.ufValue },
      { label: 'Saldo deuda (UF)', type: 'balance' as const, fn: (d: MonthlyData) => d.outstandingBalanceUF },
      { label: 'Saldo deuda (CLP)', type: 'balance' as const, fn: (d: MonthlyData) => d.outstandingBalanceCLP },
      { label: 'EVENTO DE VENTA', type: 'section' as const, fn: () => null },
      { label: 'Precio venta (conservador)', type: 'income' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario1.salePriceCLP : null },
      { label: 'Precio venta (optimista)', type: 'income' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario2.salePriceCLP : null },
      { label: 'Saldo deuda a cancelar', type: 'expense' as const, fn: (d: MonthlyData) => d.month === lastMonth ? -d.outstandingBalanceCLP : null },
      { label: `Patrimonio neto cons. (neto ${p.saleCostPercent}% gastos)`, type: 'subtotal' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario1.netEquityCLP : null },
      { label: `Patrimonio neto opt. (neto ${p.saleCostPercent}% gastos)`, type: 'subtotal' as const, fn: (d: MonthlyData) => d.month === lastMonth ? R.scenario2.netEquityCLP : null },
    ] : []),
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
    if (row.type === 'equity')   return '#94a3b8';
    return '#0f2957';
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid #bfdbfe', background: '#fff' }}>
      <table className="flow-table" style={{ width: '100%', minWidth: LABEL_W + COL_W * data.length, borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
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
              const isToggle  = row.type === 'toggle';
              const rowBg = isSection || isToggle ? '#dbeafe' : row.type === 'result' ? '#eff6ff' : row.type === 'subtotal' ? '#f0f9ff' : row.type === 'equity' ? '#f8fafc' : '#fff';

              if (isToggle) {
                return (
                  <tr key={ri}>
                    <td style={{
                      padding: '7px 14px', background: '#dbeafe',
                      borderRight: '2px solid #bfdbfe', borderTop: '2px solid #bfdbfe',
                      position: 'sticky', left: 0, zIndex: 2,
                      boxShadow: '2px 0 6px rgba(0,0,0,0.08)',
                    }}>
                      <button onClick={() => setBalanceOpen(v => !v)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 9, fontWeight: 700, color: '#1d4ed8',
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
                    const tooltip = row.tooltipFn ? row.tooltipFn(d) : null;
                    return (
                      <td key={d.month} style={{
                        textAlign: 'right', padding: '4px 8px', position: 'relative',
                        fontFamily: isSection ? 'inherit' : 'monospace',
                        fontWeight: row.type === 'result' ? 700 : 500,
                        fontSize: isSection ? 0 : 11,
                        color, background: bg, whiteSpace: 'nowrap',
                        borderLeft: '1px solid #f0f4ff',
                        cursor: 'default',
                      }}>
                        {row.type === 'info'
                          ? (typeof raw === 'string'
                            ? <span style={{ fontSize: 9, fontFamily: 'inherit', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8' }}>{raw}</span>
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

// ─── PlusvaliasModal ──────────────────────────────────────────
function PlusvaliasModal({ onClose, appreciations, onChange }: {
  onClose: () => void;
  appreciations: Record<string, number>;
  onChange: (commune: string, value: number) => void;
}) {
  const [search, setSearch] = React.useState('');
  const comunas = Object.keys(COMUNAS).sort((a, b) => a.localeCompare(b, 'es'));
  const filtered = search ? comunas.filter(c => c.toLowerCase().includes(search.toLowerCase())) : comunas;

  const [localValues, setLocalValues] = React.useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    comunas.forEach(c => { init[c] = appreciations[c] != null ? String(appreciations[c]).replace('.', ',') : ''; });
    return init;
  });

  function handleSave() {
    comunas.forEach(c => {
      const raw = (localValues[c] ?? '').replace(',', '.');
      const num = parseFloat(raw);
      onChange(c, isNaN(num) ? 0 : num);
    });
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000070', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680, boxShadow: '0 24px 80px #0004', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Plusvalias por Comuna</h2>
            <p style={{ fontSize: 12, color: '#c4b5fd' }}>Tasa anual estimada de apreciacion por comuna de Chile — editable</p>
          </div>
          <button onClick={onClose} style={{ background: '#ffffff20', border: 'none', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
        </div>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #dbeafe', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar comuna..."
            style={{ ...INPUT_S, width: '100%' }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 24px 12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #dbeafe', color: '#6b93c4', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Comuna</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', borderBottom: '2px solid #dbeafe', color: '#6b93c4', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Plusvalia anual (%)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(commune => (
                <tr key={commune} style={{ borderBottom: '1px solid #f0f4ff' }}>
                  <td style={{ padding: '6px 8px', color: '#0f2957', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: COMUNAS[commune] ?? '#94a3b8', display: 'inline-block', flexShrink: 0 }} />
                    {commune}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={localValues[commune] ?? ''}
                        onChange={e => setLocalValues(prev => ({ ...prev, [commune]: e.target.value }))}
                        placeholder="—"
                        style={{ width: 70, textAlign: 'right', background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#0f2957', outline: 'none' }}
                      />
                      <span style={{ fontSize: 11, color: '#6b93c4', width: 14 }}>%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={{ textAlign: 'center', color: '#93b4d4', padding: 20, fontSize: 12 }}>No se encontraron comunas</p>}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid #dbeafe', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────
const AUTH_USERS: Record<string, { role: 'admin' | 'asesor' }> = {
  'proppi:20262026': { role: 'asesor' },
  'admin:admin':     { role: 'admin'  },
};
const SESSION_KEY = 'cotiz_session';

const LOGIN_INPUT: React.CSSProperties = {
  background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8,
  padding: '8px 10px', fontSize: 13, color: '#0f2957', outline: 'none', width: '100%',
};

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export default function Home() {
  const [p, setP] = useState<SimulationParams>(DEFAULTS);
  const [tab, setTab] = useState<'prop' | 'credit' | 'pie' | 'rent' | 'exit' | 'cliente'>('prop');
  const [showSendModal, setShowSendModal] = useState(false);
  const [showMap, setShowMap]             = useState(false);
  const [showPlusvaliasTable, setShowPlusvaliasTable] = useState(false);
  const [communeAppreciations, setCommuneAppreciations] = useState<Record<string, number>>({});
  const [useTableAppreciation, setUseTableAppreciation] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedAsesor, setSelectedAsesor] = useState('');
  const [isStaticView, setIsStaticView] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [mainView, setMainView] = useState<'params' | 'analysis'>('analysis');

  // Auth
  const [authed, setAuthed]         = useState(false);
  const [isClientLink, setIsClientLink] = useState(false);
  const [loginUser, setLoginUser]   = useState('');
  const [loginPass, setLoginPass]   = useState('');
  const [loginErr, setLoginErr]     = useState('');

  const set = useCallback(<K extends keyof SimulationParams>(k: K, v: SimulationParams[K]) =>
    setP(prev => ({ ...prev, [k]: v })), []);

  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('s');
      const mode = params.get('mode');
      if (s) setP(prev => ({ ...prev, ...JSON.parse(atob(s)), saleCostPercent: 2.38 }));
      if (mode === 'static') setIsStaticView(true);
      if (mode === 'static' || mode === 'dynamic') setIsClientLink(true);
      const urlAsesor = params.get('asesorName');
      if (urlAsesor) setSelectedAsesor(urlAsesor);
    } catch {}
    try {
      const sess = localStorage.getItem('cotiz_session');
      if (sess) { const { role } = JSON.parse(sess); if (role) { setAuthed(true); setHasSession(true); setTab('prop'); } }
    } catch {}
    try {
      const saved = localStorage.getItem('communeAppreciations');
      if (saved) setCommuneAppreciations(JSON.parse(saved));
    } catch {}
    // Auto-fetch UF del día desde mindicador.cl
    const hasUrlParams = new URLSearchParams(window.location.search).get('s');
    if (!hasUrlParams) {
      fetch('https://mindicador.cl/api/uf')
        .then(r => r.json())
        .then(data => {
          const val = data?.serie?.[0]?.valor;
          if (val && typeof val === 'number') setP(prev => ({ ...prev, ufValueCLP: Math.round(val) }));
        })
        .catch(() => {});
    }
  }, []);

  const doLogin = () => {
    const key = `${loginUser.trim().toLowerCase()}:${loginPass.trim()}`;
    if (AUTH_USERS[key]) {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ role: AUTH_USERS[key].role })); } catch {}
      setAuthed(true); setHasSession(true); setLoginErr(''); setTab('prop');
    } else {
      setLoginErr('Usuario o contraseña incorrectos.');
    }
  };

  const handleSave = useCallback(() => {
    const encoded = btoa(JSON.stringify(p));
    window.history.replaceState({}, '', `?s=${encoded}`);
    localStorage.setItem('real_estate_sim', JSON.stringify(p));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [p]);

  const handleCommuneAppreciationChange = (commune: string, value: number) => {
    const updated = { ...communeAppreciations, [commune]: value };
    setCommuneAppreciations(updated);
    try { localStorage.setItem('communeAppreciations', JSON.stringify(updated)); } catch {}
    if (useTableAppreciation && commune === p.commune) {
      set('baseAnnualAppreciationPercent', value);
    }
  };

  const handleUseTableToggle = (checked: boolean) => {
    setUseTableAppreciation(checked);
    if (checked && communeAppreciations[p.commune] !== undefined) {
      set('baseAnnualAppreciationPercent', communeAppreciations[p.commune]);
    }
  };

  React.useEffect(() => {
    if (useTableAppreciation && communeAppreciations[p.commune] !== undefined) {
      set('baseAnnualAppreciationPercent', communeAppreciations[p.commune]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.commune, useTableAppreciation]);

  const getShareLink = useCallback((mode: 'static' | 'dynamic' = 'dynamic') => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}?s=${btoa(JSON.stringify(p))}&mode=${mode}`;
  }, [p]);

  const R = useMemo(() => runSimulation(p), [p]);

  // ── Login wall ──────────────────────────────────────────────
  if (!authed && !isClientLink) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 14, width: '100%', maxWidth: 380, padding: 36, boxShadow: '0 8px 40px #1d4ed815' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 56, height: 56, background: '#eff6ff', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src="/logo2.png" alt="Proppi" style={{ width: 44, height: 44, objectFit: 'contain' }} /></div>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#0f2957' }}>Proppi</span>
            </div>
            <h1 style={{ fontSize: 16, fontWeight: 800, color: '#0f2957', margin: 0 }}>Simulador de Inversión</h1>
            <p style={{ fontSize: 12, color: '#6b93c4', marginTop: 4 }}>Acceso interno Proppi</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>Usuario</p>
            <input value={loginUser} onChange={e => setLoginUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} style={LOGIN_INPUT} placeholder="proppi o admin" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 4 }}>Contraseña</p>
            <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} style={LOGIN_INPUT} placeholder="••••••••" />
          </div>
          {loginErr && <p style={{ fontSize: 11, color: '#dc2626', marginBottom: 12, textAlign: 'center' }}>{loginErr}</p>}
          <button onClick={doLogin} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, fontWeight: 700, fontSize: 13, width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#1d4ed8,#0284c7)', color: '#fff' }}>
            Ingresar →
          </button>
        </div>
      </div>
    );
  }

  // Fechas clave
  const escrituraMes = addMonths(p.startMonth, p.startYear,
    p.deliveryType === 'future' ? p.constructionMonths : 0);
  const { month: fdm, year: fdy } = addMonths(escrituraMes.month, escrituraMes.year, p.gracePeriodMonths + 1);
  const firstDividendLabel = `${ML[fdm]} ${fdy}`;

  // Chart data (todos los meses desde m=1, incluye pre-entrega con cuotas pie)
  const chartData = R.monthlyData.slice(1).map(d => ({
    name: d.dateShort,
    'Flujo neto': d.netCashFlow,
    'Arr. neto': d.netRent,
    'Dividendo': d.dividend > 0 ? -d.dividend : 0,
    'Cuota pie': d.pieCuota > 0 ? -d.pieCuota : 0,
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
            <div style={{ width: 44, height: 44, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src="/logo2.png" alt="Proppi" style={{ width: 36, height: 36, objectFit: 'contain' }} /></div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                {p.projectName || 'Simulador Inmobiliario'}
              </h1>
              <p style={{ fontSize: 10, color: '#93c5fd' }}>
                {p.commune} · {ML[p.startMonth]} {p.startYear} ·{' '}
                {p.deliveryType === 'immediate' ? 'Entrega Inmediata' : `Entrega Futura (${p.constructionMonths} meses obra)`}
                {p.guaranteedRentEnabled ? ` · 🏆 Garantía ${p.guaranteedRentMonths/12}a` : ''}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
            <span style={{ color: '#bfdbfe' }}>🏦 1er div.: <strong style={{ color: '#fff' }}>{firstDividendLabel}</strong></span>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#ffffff25', color: '#fff', padding: '4px 12px', borderRadius: 20, border: '1px solid #ffffff40' }}>
              {fUF(R.totalValueUF, 0)} · UF ${p.ufValueCLP.toLocaleString('es-CL')}
            </span>
            {!isStaticView && (
              <>
                <a href="/cotizaciones" style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid #ffffff40',
                  background: '#ffffff15', color: '#bfdbfe', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', textDecoration: 'none',
                }}>
                  📋 Historial
                </a>
                <button onClick={() => setShowPlusvaliasTable(true)} style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid #ffffff40',
                  background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                  Plusvalias
                </button>
                <button onClick={() => setShowMap(true)} style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid #ffffff40',
                  background: '#0369a1', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                  Mapa interactivo
                </button>
                <button onClick={() => { handleSave(); setShowSendModal(true); }} style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid #ffffff60',
                  background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                  📧 Enviar al cliente
                </button>
                <PdfExport p={p} R={R} asesor={selectedAsesor} />
                {hasSession && (
                  <button onClick={() => {
                    try { localStorage.removeItem('cotiz_session'); } catch {}
                    window.location.href = '/cotizaciones';
                  }} style={{
                    padding: '6px 14px', borderRadius: 20, border: '1px solid #ffffff30',
                    background: 'transparent', color: '#93c5fd', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                    Cerrar sesión
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar Parámetros / Análisis */}
      {!isStaticView && (
        <div style={{ background: '#fff', borderBottom: '2px solid #dbeafe', position: 'sticky', top: 64, zIndex: 40 }}>
          <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 20px', display: 'flex' }}>
            {([['params', '⚙️ Parámetros'], ['analysis', '📊 Análisis']] as const).map(([view, label]) => (
              <button key={view} onClick={() => setMainView(view)} style={{
                padding: '10px 22px', border: 'none', cursor: 'pointer',
                background: 'transparent', fontSize: 12, fontWeight: 700,
                color: mainView === view ? '#1d4ed8' : '#93b4d4',
                borderBottom: mainView === view ? '3px solid #1d4ed8' : '3px solid transparent',
                transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '18px 16px' }}>

        {/* STATIC VIEW BANNER */}
        {isStaticView && (
          <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', borderRadius: 16, padding: '20px 28px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <p style={{ fontSize: 10, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Simulación personalizada</p>
              {p.projectName && <p style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 2 }}>{p.projectName}</p>}
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                {p.clientName ? `Hola, ${p.clientName}` : 'Tu Simulación de Inversión'}
              </h2>
              <p style={{ fontSize: 12, color: '#bfdbfe' }}>
                {p.commune} · {fUF(R.totalValueUF, 0)} · {ML[p.startMonth]} {p.startYear}
              </p>
              {(p.clientRut || p.clientEmail) && (
                <p style={{ fontSize: 11, color: '#93c5fd', marginTop: 4 }}>
                  {p.clientRut ? `RUT ${p.clientRut}` : ''}{p.clientRut && p.clientEmail ? ' · ' : ''}{p.clientEmail || ''}
                </p>
              )}
            </div>
            {!isStaticView && (
              <a href={`${typeof window !== 'undefined' ? window.location.href.replace('mode=static','mode=dynamic') : ''}`}
                style={{ padding: '10px 20px', borderRadius: 10, background: '#ffffff20', border: '1px solid #ffffff40', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                🎮 Explorar interactivamente →
              </a>
            )}
          </div>
        )}

        {/* KPI STRIP - solo en análisis */}
        <div style={{ display: (mainView === 'analysis' || isStaticView) ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
          <KpiCard label="Dividendo mensual" icon="🏦" value={fCLP(R.monthlyPaymentCLP, false)}
            sub={`${fUF(R.monthlyPaymentUF)} / mes`} type="blue" />
          <KpiCard label="Arriendo neto" icon="🏠" value={fCLPFull(R.netMonthlyRentCLP)}
            sub={`Bruto ${fCLPFull(p.monthlyRentCLP)} · adm ${p.managementFeePercent}%`} type="sky" />
          <KpiCard label="Flujo mensual prom." icon={R.avgMonthlyCashFlow >= 0 ? '📈' : '📉'}
            value={fCLP(R.avgMonthlyCashFlow, false)} sub="promedio período análisis"
            type={R.avgMonthlyCashFlow >= 0 ? 'positive' : 'negative'} />
          <KpiCard label="Cap Rate" icon="💹" value={fPct(R.capRatePercent)}
            sub="Renta anual neta / valor total" type="blue" />
          <KpiCard label="Pie cliente total" icon="💰"
            value={R.clientPieUF === 0 ? '$0 — cubierto ✅' : fUF(R.clientPieUF, 0)}
            sub={R.clientPieUF > 0 ? `${fCLP(R.clientPieUpfrontUF * p.ufValueCLP, false)} contado + cuotas` : 'Bono pie cubre todo'}
            type={R.clientPieUF === 0 ? 'positive' : 'sky'} />
          <KpiCard label="Cuota pie / mes" icon="📅"
            value={R.monthlyCuotaUF > 0 ? fCLPFull(R.monthlyCuotaUF * p.ufValueCLP) : '$0'}
            sub={cuotaLabel} type={R.monthlyCuotaUF > 0 ? 'negative' : 'positive'} />
        </div>

        {/* INVESTMENT SUMMARY + COMPACT SCENARIOS - solo en análisis */}
        <div style={{ display: (mainView === 'analysis' || isStaticView) ? 'flex' : 'none', gap: 10, marginBottom: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}><InvestmentSummary R={R} p={p} /></div>
          <div style={{ flex: 1, minWidth: 220 }}><CompactScenarios R={R} p={p} /></div>
          {isClientLink && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', alignSelf: 'center' }}>
              <a href={`https://wa.me/${(ASESORES.find(a => a.name === selectedAsesor)?.phone || '56994366697')}?text=${encodeURIComponent('Hola ' + (selectedAsesor || 'Vicente Torres') + '! Quiero avanzar con la reserva. te paso los numeros de teléfono en breve')}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', textDecoration: 'none', padding: '14px 22px', borderRadius: 14, fontSize: 14, fontWeight: 800, boxShadow: '0 6px 20px #16a34a40', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 18 }}>🏠</span> ¡Quiero hacer la reserva!
              </a>
              <a href={`https://wa.me/${(ASESORES.find(a => a.name === selectedAsesor)?.phone || '56994366697')}?text=${encodeURIComponent('Hola ' + (selectedAsesor || 'Vicente Torres') + '! Tengo dudas sobre mi plan de inversión.')}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#25D366', textDecoration: 'none', padding: '14px 20px', borderRadius: 14, fontSize: 13, fontWeight: 700, border: '2px solid #25D366', boxShadow: '0 4px 14px #25D36625', whiteSpace: 'nowrap' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                ¿Tienes dudas? Contacta a tu asesor
              </a>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>

          {/* ── SIDEBAR / PARÁMETROS ─────────────────────────────────── */}
          <aside style={{ display: (!isStaticView && mainView === 'params') ? 'flex' : 'none', flexDirection: 'column', gap: 14, maxWidth: 660, margin: '0 auto', width: '100%' }}>
            <div style={CARD}>
              <div style={{ padding: '14px 16px 8px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Parámetros</p>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 3, background: '#eff6ff', borderRadius: 10, padding: 4 }}>
                  {([['prop','🏢 Dpto'],['credit','🏦 Crédito'],['pie','💰 Pie'],['rent','🏠 Arriendo'],['exit','📊 Salida'],['cliente','👤 Cliente']] as const).map(([k, lbl]) => (
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
                  <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Nombre del proyecto</p>
                  <input value={p.projectName} onChange={e => set('projectName', e.target.value)} style={{ ...INPUT_S, marginBottom: 14 }} placeholder="Ej: Edificio Vista Oriente" />
                  <NumberInput label="Valor propiedad (UF)" value={p.propertyValueUF}
                    onChange={v => set('propertyValueUF', v)}
                    suffix={`≈ ${fCLP(p.propertyValueUF * p.ufValueCLP, false)}`} />
                  <NumberInput label="Valor UF hoy (CLP)" value={p.ufValueCLP}
                    onChange={v => set('ufValueCLP', v)}
                    suffix={`$${p.ufValueCLP.toLocaleString('es-CL')}`} />
                  <Slider label="Crecimiento UF anual (inflación)" value={p.ufAnnualGrowthPercent} min={0} max={8} step={0.5}
                    display={`${p.ufAnnualGrowthPercent}%`} onChange={v => set('ufAnnualGrowthPercent', v)} />
                  <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Comuna</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{
                      display: 'inline-block', width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      background: COMUNAS[p.commune] ?? '#94a3b8',
                      border: '2px solid #fff', boxShadow: '0 0 0 1.5px #c3d8f7',
                    }} />
                    <select
                      value={p.commune}
                      onChange={e => set('commune', e.target.value)}
                      style={{ ...INPUT_S, flex: 1 }}
                    >
                      {Object.keys(COMUNAS).sort((a, b) => a.localeCompare(b, 'es')).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Estacionamientos</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Cantidad</p>
                      <select value={p.parkingCount} onChange={e => set('parkingCount', parseInt(e.target.value))} style={INPUT_S}>
                        {[0,1,2,3].map(n => <option key={n} value={n}>{n === 0 ? 'Sin estac.' : `${n} estac.`}</option>)}
                      </select>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Precio c/u (UF)</p>
                      <input type="number" value={p.parkingValueUF} onChange={e => set('parkingValueUF', parseFloat(e.target.value) || 0)} style={INPUT_S} disabled={p.parkingCount === 0} />
                    </div>
                  </div>
                  {p.parkingCount > 0 && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
                      <input type="checkbox" checked={p.parkingBonoPie} onChange={e => set('parkingBonoPie', e.target.checked)} style={{ width: 14, height: 14, accentColor: '#1d4ed8', marginTop: 1, flexShrink: 0 }} />
                      <span>
                        <span style={{ fontSize: 11, color: '#0f2957', fontWeight: 600 }}>El estacionamiento incluye bono pie</span>
                        <span style={{ display: 'block', fontSize: 10, color: p.parkingBonoPie ? '#059669' : '#6b7280', marginTop: 2 }}>
                          {p.parkingBonoPie
                            ? `Desarrollador aporta ${p.bonoPiePercent}% del precio (${(p.parkingCount * p.parkingValueUF * (Math.min(p.bonoPiePercent, 100 - p.financingPercent) / 100)).toFixed(1)} UF)`
                            : 'Cliente paga el pie completo del estacionamiento'}
                        </span>
                      </span>
                    </label>
                  )}

                  <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Bodega</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Cantidad</p>
                      <select value={p.storageCount} onChange={e => set('storageCount', parseInt(e.target.value))} style={INPUT_S}>
                        <option value={0}>Sin bodega</option>
                        <option value={1}>1 bodega</option>
                      </select>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Precio (UF)</p>
                      <input type="number" value={p.storageValueUF} onChange={e => set('storageValueUF', parseFloat(e.target.value) || 0)} style={INPUT_S} disabled={p.storageCount === 0} />
                    </div>
                  </div>
                  {p.storageCount > 0 && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
                      <input type="checkbox" checked={p.storageBonoPie} onChange={e => set('storageBonoPie', e.target.checked)} style={{ width: 14, height: 14, accentColor: '#1d4ed8', marginTop: 1, flexShrink: 0 }} />
                      <span>
                        <span style={{ fontSize: 11, color: '#0f2957', fontWeight: 600 }}>La bodega incluye bono pie</span>
                        <span style={{ display: 'block', fontSize: 10, color: p.storageBonoPie ? '#059669' : '#6b7280', marginTop: 2 }}>
                          {p.storageBonoPie
                            ? `Desarrollador aporta ${p.bonoPiePercent}% del precio (${(p.storageCount * p.storageValueUF * (Math.min(p.bonoPiePercent, 100 - p.financingPercent) / 100)).toFixed(1)} UF)`
                            : 'Cliente paga el pie completo de la bodega'}
                        </span>
                      </span>
                    </label>
                  )}
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
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#4a7abf' }}>Tasa CAE anual</span>
                      <span style={{ fontSize: 10, color: '#6b93c4' }}>ej: 4.1</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <input
                        type="number" step="0.1" min="0" max="30"
                        style={{ ...INPUT_S, flex: 1, borderRadius: '8px 0 0 8px', marginBottom: 0 }}
                        value={p.annualRatePercent}
                        onChange={e => set('annualRatePercent', parseFloat(e.target.value) || 0)}
                        inputMode="decimal"
                      />
                      <span style={{ background: '#e8f0fb', border: '1px solid #c3d8f7', borderLeft: 'none', borderRadius: '0 8px 8px 0', padding: '0 10px', fontSize: 13, color: '#4a7abf', fontWeight: 600, height: 34, display: 'flex', alignItems: 'center' }}>%</span>
                    </div>
                  </div>
                  <Slider label="Plazo crédito" value={p.loanTermYears} min={5} max={30} step={5}
                    display={`${p.loanTermYears} años`} onChange={v => set('loanTermYears', v)} />
                  <Slider label="Período de gracia post-entrega" value={p.gracePeriodMonths} min={0} max={12} step={1}
                    display={`${p.gracePeriodMonths} meses → 1er div. ${firstDividendLabel}`}
                    onChange={v => set('gracePeriodMonths', v)} />
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#4a7abf' }}>Gastos operacionales crédito</span>
                      <span style={{ fontSize: 10, color: '#6b93c4' }}>cobrado al escriturar</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <span style={{ background: '#e8f0fb', border: '1px solid #c3d8f7', borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '0 10px', fontSize: 13, color: '#4a7abf', fontWeight: 600, height: 34, display: 'flex', alignItems: 'center' }}>$</span>
                      <input
                        style={{ ...INPUT_S, flex: 1, borderRadius: '0 8px 8px 0', marginBottom: 0 }}
                        value={p.operationalCostsCLP === 0 ? '' : p.operationalCostsCLP.toLocaleString('es-CL')}
                        placeholder="ej: 1.500.000"
                        onChange={e => {
                          const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '');
                          set('operationalCostsCLP', parseInt(raw) || 0);
                        }}
                        inputMode="numeric"
                      />
                    </div>
                    {p.operationalCostsCLP > 0 && (
                      <p style={{ fontSize: 10, color: '#6b93c4', marginTop: 4 }}>
                        Incluye {fCLPFull(p.operationalCostsCLP)} en gastos operacionales al escriturar
                      </p>
                    )}
                  </div>
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

                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>% del pie al contado (up front)</p>
                      <input
                        type="number" min={0} max={100} value={p.clientPieUpfrontPct}
                        onChange={e => set('clientPieUpfrontPct', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        style={{ ...INPUT_S, marginBottom: 4 }}
                      />
                      <p style={{ fontSize: 10, color: '#7c3aed', margin: 0 }}>
                        {fUF(R.clientPieUpfrontUF, 2)} · <strong>{fCLP(R.clientPieUpfrontUF * p.ufValueCLP, false)}</strong>
                      </p>
                    </div>
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
                  {/* Arriendo garantizado toggle */}
                  <div style={{ background: p.guaranteedRentEnabled ? '#f0fdf4' : '#f8faff', border: `1px solid ${p.guaranteedRentEnabled ? '#86efac' : '#dbeafe'}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: p.guaranteedRentEnabled ? 14 : 0 }}>
                      <input type="checkbox" checked={p.guaranteedRentEnabled} onChange={e => set('guaranteedRentEnabled', e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#15803d', cursor: 'pointer' }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: p.guaranteedRentEnabled ? '#15803d' : '#334d6e', marginBottom: 1 }}>🏆 Arriendo Garantizado</p>
                        <p style={{ fontSize: 10, color: '#6b93c4' }}>El desarrollador garantiza el arriendo mensual por un período fijo</p>
                      </div>
                    </label>
                    {p.guaranteedRentEnabled && <>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#4a7abf' }}>Monto garantizado bruto mensual (CLP)</span>
                        </div>
                        <input
                          style={INPUT_S}
                          value={p.guaranteedRentCLP === 0 ? '' : p.guaranteedRentCLP.toLocaleString('es-CL')}
                          placeholder="ej: 450.000"
                          onChange={e => {
                            const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '');
                            set('guaranteedRentCLP', parseInt(raw) || 0);
                          }}
                          inputMode="numeric"
                        />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Duración del arriendo garantizado</p>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {[12, 24, 36, 48, 60].map(m => (
                            <button key={m} onClick={() => set('guaranteedRentMonths', m)} style={{
                              padding: '5px 10px', borderRadius: 8, border: '1px solid',
                              borderColor: p.guaranteedRentMonths === m ? '#15803d' : '#dbeafe',
                              background: p.guaranteedRentMonths === m ? '#f0fdf4' : '#fff',
                              color: p.guaranteedRentMonths === m ? '#15803d' : '#94a3b8',
                              fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}>{m / 12}a</button>
                          ))}
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 11, color: '#0f2957' }}>
                        <input type="checkbox" checked={p.guaranteedRentNoAdmin} onChange={e => set('guaranteedRentNoAdmin', e.target.checked)}
                          style={{ width: 14, height: 14, accentColor: '#15803d' }} />
                        <span>Sin cobro de administración <span style={{ color: '#6b93c4' }}>(el desarrollador la cubre)</span></span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: '#0f2957' }}>
                        <input type="checkbox" checked={p.guaranteedRentUFAdjusted} onChange={e => set('guaranteedRentUFAdjusted', e.target.checked)}
                          style={{ width: 14, height: 14, accentColor: '#15803d' }} />
                        <span>Reajuste anual por UF <span style={{ color: '#6b93c4' }}>({p.ufAnnualGrowthPercent}%/año)</span></span>
                      </label>
                      <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginTop: 12, fontSize: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ color: '#6b93c4' }}>Monto bruto garantizado</span>
                          <span style={{ fontWeight: 700, color: '#15803d', fontFamily: 'monospace' }}>{fCLPFull(p.guaranteedRentCLP)}/mes</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ color: '#6b93c4' }}>Administración</span>
                          <span style={{ fontWeight: 700, color: p.guaranteedRentNoAdmin ? '#15803d' : '#dc2626', fontFamily: 'monospace' }}>
                            {p.guaranteedRentNoAdmin ? '$0 (cubierta)' : `-${fCLPFull(p.guaranteedRentCLP * p.managementFeePercent / 100)}`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eff6ff', paddingTop: 4, marginTop: 4 }}>
                          <span style={{ color: '#6b93c4', fontWeight: 700 }}>Lo que llega al cliente</span>
                          <span style={{ fontWeight: 800, color: '#15803d', fontFamily: 'monospace' }}>
                            {fCLPFull(p.guaranteedRentNoAdmin ? p.guaranteedRentCLP : p.guaranteedRentCLP * (1 - p.managementFeePercent / 100))}/mes
                          </span>
                        </div>
                      </div>
                    </>}
                  </div>

                  <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    {p.guaranteedRentEnabled ? 'Arriendo de mercado (post-garantía)' : 'Arriendo de mercado'}
                  </p>
                  <Slider label="Arriendo mensual bruto" value={p.monthlyRentCLP} min={200000} max={2000000} step={10000}
                    display={fCLPFull(p.monthlyRentCLP)} onChange={v => set('monthlyRentCLP', v)} />
                  <Slider label="Fee de administración" value={p.managementFeePercent} min={0} max={15} step={0.5}
                    display={`${p.managementFeePercent}%`} onChange={v => set('managementFeePercent', v)} />
                  <Slider label="Reajuste anual sobre UF" value={p.rentAnnualExtraPercent} min={0} max={10} step={0.5}
                    display={`UF + ${p.rentAnnualExtraPercent}%/año`} onChange={v => set('rentAnnualExtraPercent', v)} />

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#4a7abf' }}>Vacancia (días al año)</span>
                      {p.vacancyDays > 0 && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>{((p.vacancyDays/365)*100).toFixed(1)}% del año</span>}
                    </div>
                    <input
                      type="number" min={0} max={365} value={p.vacancyDays === 0 ? '' : p.vacancyDays}
                      onChange={e => set('vacancyDays', Math.min(365, Math.max(0, parseInt(e.target.value) || 0)))}
                      style={INPUT_S} placeholder="ej: 15 días"
                    />
                    {p.vacancyDays > 0 && (
                      <p style={{ fontSize: 10, color: '#dc2626', marginTop: 4 }}>
                        Se muestra concentrado 1 vez/año de arriendo ({fCLPFull(Math.round(p.monthlyRentCLP * p.vacancyDays / 30))} ese mes)
                      </p>
                    )}
                  </div>

                  {p.vacancyDays > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#4a7abf' }}>Gastos comunes en vacancia (CLP/mes)</span>
                        <span style={{ fontSize: 10, color: '#6b93c4' }}>solo cuando está vacío</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        <span style={{ background: '#e8f0fb', border: '1px solid #c3d8f7', borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '0 10px', fontSize: 13, color: '#4a7abf', fontWeight: 600, height: 34, display: 'flex', alignItems: 'center' }}>$</span>
                        <input
                          style={{ ...INPUT_S, flex: 1, borderRadius: '0 8px 8px 0', marginBottom: 0 }}
                          value={p.commonChargesCLP === 0 ? '' : p.commonChargesCLP.toLocaleString('es-CL')}
                          placeholder="ej: 50.000"
                          onChange={e => {
                            const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '');
                            set('commonChargesCLP', parseInt(raw) || 0);
                          }}
                          inputMode="numeric"
                        />
                      </div>
                      {p.commonChargesCLP > 0 && (
                        <p style={{ fontSize: 10, color: '#dc2626', marginTop: 4 }}>
                          {fCLPFull(p.commonChargesCLP)}/mes mientras el depto esté vacío
                        </p>
                      )}
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#4a7abf' }}>Fondo de reserva inicial (UF)</span>
                      <span style={{ fontSize: 10, color: '#6b93c4' }}>cobrado al escriturar</span>
                    </div>
                    <input
                      type="number" min={0} value={p.reserveFundUF === 0 ? '' : p.reserveFundUF}
                      onChange={e => set('reserveFundUF', parseFloat(e.target.value) || 0)}
                      style={INPUT_S} placeholder="ej: 10"
                    />
                    {p.reserveFundUF > 0 && (
                      <p style={{ fontSize: 10, color: '#dc2626', marginTop: 4 }}>
                        {fUF(p.reserveFundUF, 1)} = {fCLPFull(p.reserveFundUF * p.ufValueCLP)} al escriturar
                      </p>
                    )}
                  </div>

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
                  {/* Checkbox: usar tabla de plusvalías */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={useTableAppreciation} onChange={e => handleUseTableToggle(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: '#7c3aed', marginTop: 2, flexShrink: 0 }} />
                    <span>
                      <span style={{ fontSize: 11, color: '#0f2957', fontWeight: 600 }}>Usar plusvalia de tabla por comuna</span>
                      <span style={{ display: 'block', fontSize: 10, color: '#6b93c4', marginTop: 2 }}>
                        {useTableAppreciation
                          ? communeAppreciations[p.commune] !== undefined
                            ? `Usando ${communeAppreciations[p.commune]}%/año segun tabla para ${p.commune}`
                            : `Sin dato en tabla para ${p.commune} — ingresa el valor en "Plusvalias"`
                          : 'Modo manual — ajusta el valor abajo'}
                      </span>
                    </span>
                  </label>
                  {useTableAppreciation ? (
                    <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Plusvalia anual ({p.commune})</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed', fontFamily: 'monospace' }}>
                          {communeAppreciations[p.commune] !== undefined ? `${communeAppreciations[p.commune]}%/año` : '—'}
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                        Para modificar, usa el boton "Plusvalias" en el header
                      </p>
                    </div>
                  ) : (
                    <Slider label="Plusvalia base anual de la zona (0–10%)" value={p.baseAnnualAppreciationPercent} min={0} max={10} step={0.5}
                      display={`${p.baseAnnualAppreciationPercent}%/año`} onChange={v => set('baseAnnualAppreciationPercent', v)} />
                  )}
                  <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 10px', marginBottom: 14, fontSize: 11, color: '#1d4ed8' }}>
                    El valor base refleja el crecimiento esperado anual de la zona. Se penaliza por escenario.
                  </div>
                  <Slider label="Factor conservador" value={p.scenario1FactorPercent} min={0} max={100} step={5}
                    display={`${p.scenario1FactorPercent}% → ${fPct(p.baseAnnualAppreciationPercent * p.scenario1FactorPercent / 100, 1)}/año`}
                    onChange={v => set('scenario1FactorPercent', v)} />
                  <Slider label="Factor optimista" value={p.scenario2FactorPercent} min={0} max={100} step={5}
                    display={`${p.scenario2FactorPercent}% → ${fPct(p.baseAnnualAppreciationPercent * p.scenario2FactorPercent / 100, 1)}/año`}
                    onChange={v => set('scenario2FactorPercent', v)} />
                  <Slider label="Anos de analisis (post-entrega)" value={p.analysisYears} min={3} max={10} step={1}
                    display={`${p.analysisYears} años`} onChange={v => set('analysisYears', v)} />
                  {/* Gastos de corretaje — fijo 2% + IVA = 2.38% */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#4a7abf' }}>Gastos de corretaje</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>2,38% (fijo)</span>
                    </div>
                    <input
                      type="range" min={0} max={5} step={0.01} value={2.38}
                      readOnly
                      style={{ width: '100%', opacity: 0.5, cursor: 'not-allowed' }}
                    />
                    <p style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>2% corretaje + IVA (19%) = 2,38% — aplicado al precio de venta</p>
                  </div>
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

                {/* ── TAB: CLIENTE ── */}
                {tab === 'cliente' && <>
                  <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Nombre del cliente</p>
                  <input value={p.clientName} onChange={e => set('clientName', e.target.value)} style={{ ...INPUT_S, marginBottom: 14 }} placeholder="Nombre Apellido" />
                  <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>RUT</p>
                  <RutInput value={p.clientRut} onChange={v => set('clientRut', v)} style={{ ...INPUT_S, marginBottom: 14 }} />
                  <p style={{ fontSize: 11, color: '#4a7abf', marginBottom: 4 }}>Email del cliente</p>
                  <input type="email" value={p.clientEmail} onChange={e => set('clientEmail', e.target.value)} style={{ ...INPUT_S, marginBottom: 14 }} placeholder="cliente@email.com" />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={handleSave} style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: saved ? '#15803d' : '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 700, transition: 'background 0.3s',
                    }}>
                      {saved ? '✅ Guardado' : '💾 Guardar'}
                    </button>
                    <button onClick={() => { handleSave(); setShowSendModal(true); }} style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: '#7c3aed', color: '#fff', fontSize: 12, fontWeight: 700,
                    }}>
                      📧 Enviar
                    </button>
                  </div>
                </>}

              </div>
            </div>

            {/* Resumen rápido */}
            <div style={{ ...CARD, padding: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b93c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Resumen</p>
              {[
                ['Valor dpto', fUF(p.propertyValueUF, 0)],
                ...(p.parkingCount > 0 ? [[`Estac. (${p.parkingCount}x${fUF(p.parkingValueUF,0)})`, fUF(p.parkingCount*p.parkingValueUF,0)]] : []),
                ...(p.storageCount > 0 ? [['Bodega', fUF(p.storageValueUF,0)]] : []),
                ['Total activo', fUF(R.totalValueUF, 0)],
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

          {/* ── ANÁLISIS (flujo primero, luego gráficos) ──────────────────── */}
          <div style={{ display: (isStaticView || mainView === 'analysis') ? 'flex' : 'none', flexDirection: 'column', gap: 18 }}>

            {/* TABLA PRINCIPAL — flujo primero */}
            <div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f2957', margin: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    Flujo Detallado — Todos los Meses
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#6b93c4' }}>
                      {R.totalTableMonths + 1} columnas
                    </span>
                    <a
                      href={`/flujo?s=${btoa(JSON.stringify(p))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: '#eff6ff', color: '#1d4ed8',
                        border: '1px solid #bfdbfe', textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Ver flujo en detalle
                    </a>
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 10, flexWrap: 'wrap' }}>
                  {[
                    { bg: '#7c3aed', label: p.deliveryType === 'future' ? 'Promesa' : 'Escritura' },
                    ...(p.deliveryType === 'future' ? [{ bg: '#d97706', label: 'Construccion (pre-entrega)' }] : []),
                    { bg: '#16a34a', label: 'Periodo de gracia' },
                    ...(p.guaranteedRentEnabled ? [{ bg: '#15803d', label: `Arriendo garantizado (${p.guaranteedRentMonths/12}a)` }] : []),
                    { bg: '#1d4ed8', label: 'Periodo activo (renta + dividendo)' },
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

            {/* Resumen al final del flujo: tabla escenarios + resumen venta */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {isClientLink && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', alignSelf: 'center' }}>
                  <a href={`https://wa.me/${(ASESORES.find(a => a.name === selectedAsesor)?.phone || '56994366697')}?text=${encodeURIComponent('Hola ' + (selectedAsesor || 'Vicente Torres') + '! Quiero avanzar con la reserva. te paso los numeros de teléfono en breve')}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', textDecoration: 'none', padding: '14px 22px', borderRadius: 14, fontSize: 14, fontWeight: 800, boxShadow: '0 6px 20px #16a34a40', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 18 }}>🏠</span> ¡Quiero hacer la reserva!
                  </a>
                  <a href={`https://wa.me/${(ASESORES.find(a => a.name === selectedAsesor)?.phone || '56994366697')}?text=${encodeURIComponent('Hola ' + (selectedAsesor || 'Vicente Torres') + '! Tengo dudas sobre mi plan de inversión.')}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#25D366', textDecoration: 'none', padding: '14px 20px', borderRadius: 14, fontSize: 13, fontWeight: 700, border: '2px solid #25D366', boxShadow: '0 4px 14px #25D36625', whiteSpace: 'nowrap' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    ¿Tienes dudas? Contacta a tu asesor
                  </a>
                </div>
              )}
              <CompactScenarios R={R} p={p} />
              <SalesSummaryBox R={R} p={p} />
            </div>

            {/* Flujo mensual chart */}
            <div style={CARD}>
              <div style={{ padding: '14px 18px 8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0f2957', marginBottom: 2 }}>Flujo de Caja Mensual</h2>
                  <p style={{ fontSize: 10, color: '#6b93c4' }}>Verde = superavit · Rojo = deficit · Incluye periodo pre-entrega si hay cuotas pie</p>
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
                    <Bar dataKey="Flujo neto" radius={[2, 2, 0, 0]} opacity={0.9}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry['Flujo neto'] >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mini charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={CARD}>
                <div style={{ padding: '12px 16px 6px' }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f2957', marginBottom: 1 }}>Flujo Acumulado</h3>
                  <p style={{ fontSize: 10, color: '#6b93c4' }}>Total dinero puesto/recibido (todo el periodo)</p>
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
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: '#0f2957', marginBottom: 1 }}>Evolucion Patrimonio</h3>
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

            <p style={{ textAlign: 'center', fontSize: 10, color: '#bfdbfe', padding: '10px 0' }}>
              Proppi Simulador · Valores estimativos, no garantizan retorno · UF ${p.ufValueCLP.toLocaleString('es-CL')} · {p.commune} {p.startYear}
            </p>
          </div>
        </div>
      </main>
      {showSendModal && R && <SendModal p={p} R={R} getShareLink={getShareLink} onClose={() => setShowSendModal(false)} defaultAsesor={selectedAsesor} onAsesorChange={setSelectedAsesor} />}
      {showMap && <MapaInteractivoDynamic onClose={() => setShowMap(false)} />}
      {showPlusvaliasTable && (
        <PlusvaliasModal
          onClose={() => setShowPlusvaliasTable(false)}
          appreciations={communeAppreciations}
          onChange={handleCommuneAppreciationChange}
        />
      )}
    </div>
  );
}

// Dynamic import to avoid SSR issues with Leaflet
import dynamic from 'next/dynamic';
const MapaInteractivoDynamic = dynamic(
  () => import('./components/MapaInteractivo'),
  { ssr: false, loading: () => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#1d4ed8', fontWeight: 600 }}>Cargando mapa...</p>
    </div>
  )},
);
