'use client';
import React, { useState } from 'react';
import RutInput from './RutInput';

const ASESORES = ['Diego Sánchez', 'Cristóbal Sepúlveda', 'Matías Bertelsen', 'Vicente Torres'];

// ─── Types ────────────────────────────────────────────────────
interface SimulationParams {
  projectName: string; commune: string; deliveryType: string; constructionMonths: number;
  propertyValueUF: number; ufValueCLP: number; financingPercent: number;
  annualRatePercent: number; loanTermYears: number; gracePeriodMonths: number;
  bonoPiePercent: number; clientPieUpfrontPct: number; clientPieCuotasCount: number;
  monthlyRentCLP: number; managementFeePercent: number; analysisYears: number;
  baseAnnualAppreciationPercent: number; scenario1FactorPercent: number; scenario2FactorPercent: number;
  saleCostPercent: number; startMonth: number; startYear: number;
  clientName: string; clientRut: string; clientEmail: string;
  parkingCount: number; parkingValueUF: number; parkingBonoPie: boolean;
  storageCount: number; storageValueUF: number; storageBonoPie: boolean;
  guaranteedRentEnabled: boolean; guaranteedRentMonths: number; guaranteedRentCLP: number;
  reserveFundUF: number; operationalCostsCLP: number;
}
interface ScenarioResult {
  salePriceUF: number; salePriceCLP: number; netEquityCLP: number;
  totalReturn: number; totalInvested: number; roiPercent: number; annualizedRoiPercent: number;
}
interface SimulationResult {
  totalPiePct: number; bonoPieUF: number; clientPieUF: number;
  clientPieUpfrontUF: number; loanUF: number; monthlyPaymentUF: number; monthlyPaymentCLP: number;
  netMonthlyRentCLP: number; capRatePercent: number; totalValueUF: number;
  scenario1: ScenarioResult; scenario2: ScenarioResult;
  effectiveAnnual1: number; effectiveAnnual2: number;
  totalApprec1: number; totalApprec2: number;
  totalNegativeCashFlow: number; propertyValueCLP: number;
  bonoPieUFTotal: number;
}

// ─── Formatters ───────────────────────────────────────────────
const fCLPFull = (v: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
const fUF = (v: number, d = 0) =>
  `UF ${v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const fPct = (v: number, d = 1) => (isFinite(v) ? `${v.toFixed(d).replace('.', ',')}%` : '\u221E');

const ML = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function addMonths(month: number, year: number, n: number) {
  const t = year * 12 + month + n;
  return { month: t % 12, year: Math.floor(t / 12) };
}

// ─── SVG Generator ────────────────────────────────────────────
function generateSVGString(
  p: SimulationParams,
  R: SimulationResult,
  clientName: string,
  clientRut: string,
  asesor: string,
  logoDataUrl: string,
): string {
  const W = 900;
  const escrituraMes = addMonths(p.startMonth, p.startYear, p.deliveryType === 'future' ? p.constructionMonths : 0);
  const saleMes = addMonths(escrituraMes.month, escrituraMes.year, p.analysisYears * 12);
  const today = new Date();
  const todayLabel = `${today.getDate()} ${MS[today.getMonth()]} ${today.getFullYear()}`;
  const netMonthly = R.netMonthlyRentCLP - R.monthlyPaymentCLP;
  const pieUpfrontCLP = R.clientPieUpfrontUF * p.ufValueCLP;
  const inversionInicial = pieUpfrontCLP + p.operationalCostsCLP + (p.reserveFundUF * p.ufValueCLP);
  const soloGastos = R.clientPieUF === 0 && p.operationalCostsCLP > 0;
  const hasParkingStorage = p.parkingCount > 0 || p.storageCount > 0 || p.reserveFundUF > 0;

  // Section heights
  const HEADER_H = 172;
  const CLIENT_H = 72;
  const KPI_H = 100;
  const SCENARIO_H = 300;
  const FIN_H = hasParkingStorage ? 182 : 136;
  const GUARANTEED_H = p.guaranteedRentEnabled ? 82 : 0;
  const SUMMARY_H = 106;
  const FOOTER_H = 58;
  const TOTAL_H = HEADER_H + CLIENT_H + KPI_H + SCENARIO_H + FIN_H + GUARANTEED_H + SUMMARY_H + FOOTER_H;

  // Helpers
  const esc = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  type TxtOpts = { size?: number; weight?: string | number; fill?: string; anchor?: string; mono?: boolean; italic?: boolean };
  const txt = (x: number, y: number, content: string, opts: TxtOpts = {}) => {
    const { size = 12, weight = 'normal', fill = '#0f2957', anchor = 'start', mono = false, italic = false } = opts;
    const family = mono ? 'ui-monospace,SFMono-Regular,Menlo,monospace' : 'system-ui,-apple-system,sans-serif';
    const style = italic ? ' font-style="italic"' : '';
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="${family}"${style}>${esc(String(content))}</text>`;
  };
  const rct = (x: number, y: number, w: number, h: number, fill: string, rx = 0, stroke = '', sw = 0) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;

  const parts: string[] = [];

  // ── DEFS ─────────────────────────────────────────────────────
  parts.push(`<defs>
  <linearGradient id="gHdr" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#0f2957"/><stop offset="50%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#0284c7"/>
  </linearGradient>
  <linearGradient id="gCons" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#1d4ed8"/>
  </linearGradient>
  <linearGradient id="gOpt" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#14532d"/><stop offset="100%" stop-color="#15803d"/>
  </linearGradient>
  <linearGradient id="gSum" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#1d4ed8"/>
  </linearGradient>
  <linearGradient id="gGuar" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#14532d"/><stop offset="100%" stop-color="#15803d"/>
  </linearGradient>
  <clipPath id="cHdr"><rect width="${W}" height="${HEADER_H}"/></clipPath>
  <clipPath id="cCons"><rect x="36" y="${HEADER_H + CLIENT_H + KPI_H + 50}" width="${(W - 88) / 2}" height="54" rx="12"/></clipPath>
  <clipPath id="cOpt"><rect x="${36 + (W - 88) / 2 + 16}" y="${HEADER_H + CLIENT_H + KPI_H + 50}" width="${(W - 88) / 2}" height="54" rx="12"/></clipPath>
</defs>`);

  // ── HEADER ───────────────────────────────────────────────────
  let y = 0;
  parts.push(rct(0, y, W, HEADER_H, 'url(#gHdr)'));

  // Logo box
  parts.push(rct(36, y + 28, 52, 52, '#ffffff', 12));
  if (logoDataUrl) {
    parts.push(`<image x="40" y="${y + 32}" width="44" height="44" href="${logoDataUrl}" preserveAspectRatio="xMidYMid meet"/>`);
  } else {
    parts.push(txt(62, y + 60, 'P', { size: 30, weight: 900, fill: '#1d4ed8', anchor: 'middle' }));
  }

  // Brand
  parts.push(txt(100, y + 52, 'Proppi', { size: 18, weight: 800, fill: '#ffffff' }));
  parts.push(txt(100, y + 68, 'Inversion Inmobiliaria', { size: 10, fill: '#93c5fd' }));

  // Badge top-right
  const badgeW = 250;
  const badgeX = W - 36 - badgeW;
  parts.push(rct(badgeX, y + 28, badgeW, 28, '#ffffff20', 14));
  parts.push(`<rect x="${badgeX}" y="${y + 28}" width="${badgeW}" height="28" rx="14" fill="none" stroke="#ffffff40" stroke-width="1"/>`);
  parts.push(txt(badgeX + badgeW / 2, y + 47, `Simulacion de Inversion  \u00B7  ${todayLabel}`, { size: 11, weight: 600, fill: '#e0f2fe', anchor: 'middle' }));

  // Separator
  parts.push(line(36, y + 96, W - 36, y + 96, '#ffffff30'));

  // Project name
  const projName = p.projectName || 'Proyecto Inmobiliario';
  parts.push(txt(36, y + 128, projName, { size: 26, weight: 900, fill: '#ffffff' }));

  // Sub info
  const deliveryTxt = p.deliveryType === 'immediate' ? 'Entrega Inmediata' : `Entrega Futura \u00B7 ${p.constructionMonths}m obra`;
  const subInfo = [p.commune, deliveryTxt, `Analisis ${p.analysisYears} anos \u00B7 Venta ${ML[saleMes.month]} ${saleMes.year}`];
  if (p.guaranteedRentEnabled) subInfo.push(`Arriendo Garantizado ${p.guaranteedRentMonths / 12}a`);
  parts.push(txt(36, y + 155, subInfo.join('   \u00B7   '), { size: 11, fill: '#bfdbfe' }));

  y += HEADER_H;

  // ── CLIENT BAR ───────────────────────────────────────────────
  parts.push(rct(0, y, W, CLIENT_H, '#eff6ff'));
  parts.push(line(0, y + CLIENT_H, W, y + CLIENT_H, '#dbeafe', 2));

  parts.push(txt(36, y + 18, 'PREPARADO PARA', { size: 9, weight: 700, fill: '#93b4d4' }));
  parts.push(txt(36, y + 40, clientName || '\u2014', { size: 14, weight: 800, fill: '#0f2957' }));
  if (clientRut) {
    parts.push(txt(36, y + 58, `RUT ${clientRut}`, { size: 11, fill: '#6b93c4' }));
  }

  if (asesor) {
    parts.push(txt(W - 160, y + 18, 'ASESOR', { size: 9, weight: 700, fill: '#93b4d4' }));
    parts.push(txt(W - 160, y + 40, asesor, { size: 13, weight: 800, fill: '#1d4ed8' }));
    parts.push(txt(W - 160, y + 58, 'Proppi', { size: 9, fill: '#6b93c4' }));
  }
  parts.push(txt(W - 36, y + 18, 'FECHA', { size: 9, weight: 700, fill: '#93b4d4', anchor: 'end' }));
  parts.push(txt(W - 36, y + 40, todayLabel, { size: 12, weight: 600, fill: '#0f2957', anchor: 'end' }));

  y += CLIENT_H;

  // ── KPI HEROES ───────────────────────────────────────────────
  const kpiItems = [
    {
      label: 'Valor Propiedad',
      main: fUF(R.totalValueUF),
      sub: fCLPFull(R.totalValueUF * p.ufValueCLP),
      note: `UF ${p.ufValueCLP.toLocaleString('es-CL')} hoy`,
      bg: '#ffffff',
    },
    {
      label: soloGastos ? 'Lo que necesitas al escriturar' : 'Tu Inversion Inicial',
      main: fCLPFull(inversionInicial),
      sub: soloGastos ? 'Gastos operacionales del credito' : fUF(R.clientPieUF, 1),
      note: soloGastos
        ? `Pie cubierto por bono \u00B7 Credito ${fPct(p.financingPercent, 0)}`
        : `Pie ${fPct(R.totalPiePct)} \u00B7 Credito ${fPct(p.financingPercent, 0)}`,
      bg: '#eff6ff',
    },
    {
      label: 'Flujo Mensual Estimado',
      main: fCLPFull(netMonthly),
      sub: `Arriendo neto ${fCLPFull(R.netMonthlyRentCLP)}`,
      note: `Dividendo ${fCLPFull(R.monthlyPaymentCLP)}`,
      bg: '#ffffff',
    },
  ];

  const KPI_W = W / 3;
  kpiItems.forEach(({ label, main, sub, note, bg }, i) => {
    const kx = i * KPI_W;
    parts.push(rct(kx, y, KPI_W, KPI_H, bg));
    if (i < 2) parts.push(line(kx + KPI_W, y, kx + KPI_W, y + KPI_H, '#dbeafe'));
    parts.push(line(0, y + KPI_H, W, y + KPI_H, '#dbeafe'));
    parts.push(txt(kx + 28, y + 20, label, { size: 10, fill: '#6b93c4' }));
    parts.push(txt(kx + 28, y + 52, main, { size: 22, weight: 900, fill: '#0f2957', mono: true }));
    parts.push(txt(kx + 28, y + 70, sub, { size: 12, weight: 600, fill: '#1d4ed8' }));
    parts.push(txt(kx + 28, y + 86, note, { size: 10, fill: '#93b4d4' }));
  });

  y += KPI_H;

  // ── SCENARIOS ────────────────────────────────────────────────
  parts.push(rct(0, y, W, SCENARIO_H, '#f8faff'));
  parts.push(txt(36, y + 24, `ESCENARIOS DE RETORNO \u00B7 ${p.analysisYears} ANOS`, { size: 9, weight: 800, fill: '#93b4d4' }));

  const SC_W = (W - 88) / 2; // 388
  const SC_X0 = 36;
  const SC_X1 = 36 + SC_W + 16;
  const scCardY = y + 46;
  const CARD_H = 228;

  const scenarios = [
    { label: 'Escenario Conservador', s: R.scenario1, ann: R.effectiveAnnual1, total: R.totalApprec1, color: '#1d4ed8', bg: '#ffffff', border: '#bfdbfe', grad: 'url(#gCons)', solidColor: '#1d4ed8', clipId: 'cCons', idx: 0 },
    { label: 'Escenario Optimista',   s: R.scenario2, ann: R.effectiveAnnual2, total: R.totalApprec2, color: '#15803d', bg: '#f0fdf4', border: '#86efac', grad: 'url(#gOpt)', solidColor: '#15803d', clipId: 'cOpt', idx: 1 },
  ];

  scenarios.forEach(({ label, s, ann, total, color, bg, border, grad, solidColor, idx }) => {
    const sx = idx === 0 ? SC_X0 : SC_X1;

    // Card background
    parts.push(`<rect x="${sx}" y="${scCardY}" width="${SC_W}" height="${CARD_H}" rx="12" fill="${bg}" stroke="${border}" stroke-width="1.5"/>`);

    // Card header (clipped to rounded top)
    parts.push(`<clipPath id="scHdr${idx}"><rect x="${sx}" y="${scCardY}" width="${SC_W}" height="56" rx="12"/></clipPath>`);
    parts.push(`<rect x="${sx}" y="${scCardY}" width="${SC_W}" height="56" fill="${grad}" clip-path="url(#scHdr${idx})"/>`);
    // Fill bottom strip of header to avoid gap
    parts.push(`<rect x="${sx}" y="${scCardY + 42}" width="${SC_W}" height="14" fill="${solidColor}"/>`);

    parts.push(txt(sx + 20, scCardY + 22, label, { size: 11, weight: 700, fill: '#ffffff' }));
    parts.push(txt(sx + 20, scCardY + 44, `${fPct(ann)}/ano  \u00B7  +${fPct(total, 0)} en ${p.analysisYears} anos`, { size: 12, weight: 600, fill: '#ffffff' }));

    // Numbers row dividers
    const halfW = SC_W / 2;
    parts.push(line(sx + halfW, scCardY + 56, sx + halfW, scCardY + 128, border));
    parts.push(line(sx, scCardY + 128, sx + SC_W, scCardY + 128, border));

    // Left: Invertiste
    parts.push(txt(sx + 20, scCardY + 74, 'Invertiste', { size: 10, fill: '#6b93c4' }));
    parts.push(txt(sx + 20, scCardY + 100, fCLPFull(R.totalNegativeCashFlow), { size: 15, weight: 900, fill: '#dc2626', mono: true }));
    parts.push(txt(sx + 20, scCardY + 118, 'Flujo negativo total', { size: 9, fill: '#93b4d4' }));

    // Right: Podrías ganar
    parts.push(txt(sx + halfW + 20, scCardY + 74, 'Podrias ganar', { size: 10, fill: '#6b93c4' }));
    parts.push(txt(sx + halfW + 20, scCardY + 100, fCLPFull(s.totalReturn), { size: 15, weight: 900, fill: color, mono: true }));
    parts.push(txt(sx + halfW + 20, scCardY + 118, 'Retorno total', { size: 9, fill: '#93b4d4' }));

    // Metrics grid (3 cols × 2 rows)
    const metrics = [
      ['ROI total', fPct(s.roiPercent, 0)],
      ['ROI anual', fPct(s.annualizedRoiPercent, 1)],
      ['Precio venta', fUF(s.salePriceUF)],
      ['Patr. neto', fCLPFull(s.netEquityCLP)],
      ['Plusvalia', fPct(total, 0)],
      ['Venta est.', `${MS[saleMes.month]} ${saleMes.year}`],
    ];
    const colW = SC_W / 3;
    metrics.forEach(([lbl, val], mi) => {
      const col = mi % 3;
      const row = Math.floor(mi / 3);
      const mx = sx + col * colW + 20;
      const my = scCardY + 144 + row * 42;
      parts.push(txt(mx, my, lbl.toUpperCase(), { size: 8, fill: '#93b4d4' }));
      parts.push(txt(mx, my + 18, val, { size: 11, weight: 700, fill: color, mono: true }));
    });
  });

  y += SCENARIO_H;

  // ── FINANCIAL DETAILS ─────────────────────────────────────────
  parts.push(rct(0, y, W, FIN_H, '#f8faff'));
  const FBX = 36;
  const FBW = W - 72;
  const FBH = FIN_H - 12;
  parts.push(`<rect x="${FBX}" y="${y}" width="${FBW}" height="${FBH}" rx="12" fill="#ffffff" stroke="#dbeafe" stroke-width="1"/>`);
  parts.push(txt(FBX + 24, y + 24, 'DETALLES FINANCIEROS', { size: 9, weight: 800, fill: '#93b4d4' }));

  const finItems: [string, string][] = [
    ['Financiamiento', `${fPct(p.financingPercent, 0)}  \u2192  ${fUF(R.loanUF)}`],
    ['Tasa hipotecaria', `${fPct(p.annualRatePercent)} anual`],
    ['Plazo credito', `${p.loanTermYears} anos`],
    ['Dividendo mensual', fCLPFull(R.monthlyPaymentCLP)],
    ['Arriendo neto/mes', fCLPFull(R.netMonthlyRentCLP)],
    ['Cap Rate', fPct(R.capRatePercent)],
    ['Periodo de gracia', `${p.gracePeriodMonths} meses`],
    ['Bono pie', `${fPct(p.bonoPiePercent, 0)}  \u2192  ${fUF(R.bonoPieUF, 1)}`],
  ];
  const FIN_COL_W = FBW / 4;
  finItems.forEach(([lbl, val], fi) => {
    const col = fi % 4;
    const row = Math.floor(fi / 4);
    const fx = FBX + 24 + col * FIN_COL_W;
    const fy = y + 46 + row * 40;
    parts.push(txt(fx, fy, lbl, { size: 9, fill: '#6b93c4' }));
    parts.push(txt(fx, fy + 18, val, { size: 12, weight: 700, fill: '#0f2957', mono: true }));
  });

  if (hasParkingStorage) {
    const psY = y + 46 + 2 * 40 + 10;
    parts.push(line(FBX + 24, psY, FBX + FBW - 24, psY, '#dbeafe'));
    let psX = FBX + 24;
    if (p.parkingCount > 0) {
      parts.push(rct(psX, psY + 10, 200, 40, '#eff6ff', 8));
      parts.push(txt(psX + 14, psY + 26, 'Estacionamientos', { size: 9, fill: '#6b93c4' }));
      parts.push(txt(psX + 14, psY + 42, `${p.parkingCount} x ${fUF(p.parkingValueUF)}${p.parkingBonoPie ? '  \u00B7  Bono pie incl.' : ''}`, { size: 11, weight: 700, fill: '#1d4ed8' }));
      psX += 216;
    }
    if (p.storageCount > 0) {
      parts.push(rct(psX, psY + 10, 200, 40, '#eff6ff', 8));
      parts.push(txt(psX + 14, psY + 26, 'Bodega', { size: 9, fill: '#6b93c4' }));
      parts.push(txt(psX + 14, psY + 42, `${fUF(p.storageValueUF)}${p.storageBonoPie ? '  \u00B7  Bono pie incl.' : ''}`, { size: 11, weight: 700, fill: '#1d4ed8' }));
      psX += 216;
    }
    if (p.reserveFundUF > 0) {
      parts.push(rct(psX, psY + 10, 200, 40, '#fefce8', 8));
      parts.push(txt(psX + 14, psY + 26, 'Fondo de reserva', { size: 9, fill: '#92400e' }));
      parts.push(txt(psX + 14, psY + 42, `${fUF(p.reserveFundUF, 1)} al escriturar`, { size: 11, weight: 700, fill: '#b45309' }));
    }
  }

  y += FIN_H;

  // ── GUARANTEED RENT BANNER ────────────────────────────────────
  if (p.guaranteedRentEnabled) {
    parts.push(`<rect x="36" y="${y + 8}" width="${W - 72}" height="${GUARANTEED_H - 16}" rx="12" fill="url(#gGuar)"/>`);
    parts.push(txt(64, y + 32, 'Arriendo Garantizado Incluido', { size: 12, weight: 800, fill: '#ffffff' }));
    parts.push(txt(64, y + 54, `${p.guaranteedRentMonths} meses  \u00B7  ${fCLPFull(p.guaranteedRentCLP)}/mes  \u00B7  Sin riesgo de vacancia`, { size: 11, fill: '#bbf7d0' }));
    const badgeRX = W - 120;
    parts.push(rct(badgeRX, y + 14, 84, 54, '#ffffff20', 10));
    parts.push(txt(badgeRX + 42, y + 44, `${p.guaranteedRentMonths / 12}a`, { size: 20, weight: 900, fill: '#ffffff', anchor: 'middle' }));
    parts.push(txt(badgeRX + 42, y + 60, 'garantizado', { size: 9, fill: '#bbf7d0', anchor: 'middle' }));
    y += GUARANTEED_H;
  }

  // ── SUMMARY BAR ──────────────────────────────────────────────
  parts.push(`<rect x="36" y="${y + 8}" width="${W - 72}" height="${SUMMARY_H - 16}" rx="12" fill="url(#gSum)"/>`);
  parts.push(txt(64, y + 30, 'RESUMEN EJECUTIVO', { size: 10, weight: 700, fill: '#93c5fd' }));

  const sumItems: [string, string, string][] = [
    ['Valor total propiedad', fCLPFull(R.totalValueUF * p.ufValueCLP), '#ffffff'],
    ['Flujo total invertido', fCLPFull(R.totalNegativeCashFlow), '#fca5a5'],
    ['Retorno conservador', fCLPFull(R.scenario1.totalReturn), '#93c5fd'],
    ['Retorno optimista', fCLPFull(R.scenario2.totalReturn), '#86efac'],
  ];
  const SUM_COL_W = (W - 72 - 56) / 4;
  sumItems.forEach(([lbl, val, col], si) => {
    const sx = 64 + si * SUM_COL_W;
    parts.push(txt(sx, y + 56, lbl, { size: 9, fill: '#93c5fd' }));
    parts.push(txt(sx, y + 80, val, { size: 14, weight: 900, fill: col, mono: true }));
  });

  y += SUMMARY_H;

  // ── FOOTER ───────────────────────────────────────────────────
  parts.push(rct(0, y, W, FOOTER_H, '#0f2957'));
  parts.push(rct(36, y + 17, 24, 24, '#ffffff', 6));
  if (logoDataUrl) {
    parts.push(`<image x="40" y="${y + 21}" width="16" height="16" href="${logoDataUrl}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  parts.push(txt(68, y + 33, 'Proppi', { size: 12, weight: 700, fill: '#ffffff' }));
  parts.push(txt(100, y + 33, '\u00B7  proppi.cl', { size: 10, fill: '#4a7abf' }));
  const disclaimer = `Valores estimativos. No garantizan retorno. UF ${p.ufValueCLP.toLocaleString('es-CL')} al ${todayLabel}. Generado por Proppi Simulador.`;
  parts.push(txt(W - 36, y + 33, disclaimer, { size: 9, fill: '#4a7abf', anchor: 'end' }));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${TOTAL_H}" viewBox="0 0 ${W} ${TOTAL_H}">
${parts.join('\n')}
</svg>`;
}

// ─── Modal component ──────────────────────────────────────────
export default function PdfExport({ p, R, asesor: defaultAsesor }: {
  p: SimulationParams; R: SimulationResult; asesor: string;
}) {
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState(p.clientName || '');
  const [clientRut, setClientRut] = useState(p.clientRut || '');
  const [asesor, setAsesor] = useState(defaultAsesor || '');
  const [loading, setLoading] = useState(false);

  const handleOpen = () => {
    setClientName(p.clientName || '');
    setClientRut(p.clientRut || '');
    setAsesor(defaultAsesor || '');
    setOpen(true);
  };

  const handleDownload = async () => {
    setLoading(true);

    const filename = `Proppi_${(p.projectName || 'Simulacion').replace(/\s+/g, '_')}_${(clientName || 'Cliente').replace(/\s+/g, '_')}`;

    // Fetch logo and embed as base64
    let logoDataUrl = '';
    try {
      const resp = await fetch('/logo2.png');
      const blob = await resp.blob();
      logoDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      // logo will be skipped if fetch fails
    }

    const svgString = generateSVGString(p, R, clientName, clientRut, asesor, logoDataUrl);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setLoading(false);
    setOpen(false);
  };

  const INPUT: React.CSSProperties = {
    width: '100%', background: '#f0f7ff', border: '1px solid #bfdbfe',
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#0f2957',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <>
      <button onClick={handleOpen} style={{
        padding: '6px 14px', borderRadius: 20, border: '1px solid #ffffff40',
        background: '#0f2957', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      }}>
        Descargar SVG
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: '#00000060', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{
            background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420, padding: 28,
            boxShadow: '0 24px 80px #0f295740',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, background: '#eff6ff', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src="/logo2.png" alt="Proppi" style={{ width: 44, height: 44, objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2957' }}>Generar SVG</div>
                <div style={{ fontSize: 11, color: '#6b93c4' }}>{p.projectName || 'Simulacion de inversion'}</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 5 }}>Nombre del cliente</p>
                <input value={clientName} onChange={e => setClientName(e.target.value)} style={INPUT} placeholder="Ej: María González" />
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 5 }}>RUT</p>
                <RutInput value={clientRut} onChange={setClientRut} style={INPUT} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#6b93c4', marginBottom: 5 }}>Asesor</p>
                <select value={asesor} onChange={e => setAsesor(e.target.value)} style={INPUT}>
                  <option value="">— Seleccionar asesor —</option>
                  {ASESORES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={() => setOpen(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #bfdbfe', background: '#fff', color: '#6b93c4', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleDownload} disabled={loading} style={{
                flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
                background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#0284c7)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              }}>
                {loading ? 'Generando...' : 'Descargar SVG'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
