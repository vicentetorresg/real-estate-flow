'use client';
import React, { useRef, useState } from 'react';
import RutInput from './RutInput';

const ASESORES = ['Diego Sánchez', 'Cristóbal Sepúlveda', 'Matías Bertelsen', 'Vicente Torres'];

// ─── Minimal types (mirror page.tsx) ─────────────────────────
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
const fPct = (v: number, d = 1) => (isFinite(v) ? `${v.toFixed(d).replace('.', ',')}%` : '∞');

const ML = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function addMonths(month: number, year: number, n: number) {
  const t = year * 12 + month + n;
  return { month: t % 12, year: Math.floor(t / 12) };
}

// ─── PDF Template (hidden, captured by html2canvas) ──────────
function PdfTemplate({ p, R, clientName, clientRut, asesor }: {
  p: SimulationParams; R: SimulationResult;
  clientName: string; clientRut: string; asesor: string;
}) {
  const escrituraMes = addMonths(p.startMonth, p.startYear, p.deliveryType === 'future' ? p.constructionMonths : 0);
  const saleMes = addMonths(escrituraMes.month, escrituraMes.year, p.analysisYears * 12);
  const today = new Date();
  const todayLabel = `${today.getDate()} ${MS[today.getMonth()]} ${today.getFullYear()}`;
  const netMonthly = R.netMonthlyRentCLP - R.monthlyPaymentCLP;
  // Inversión inicial = pie contado + gastos operacionales + fondo de reserva
  const pieUpfrontCLP = R.clientPieUpfrontUF * p.ufValueCLP;
  const inversionInicial = pieUpfrontCLP + p.operationalCostsCLP + (p.reserveFundUF * p.ufValueCLP);
  const soloGastos = R.clientPieUF === 0 && p.operationalCostsCLP > 0;

  const ROW: React.CSSProperties = { display: 'flex', gap: 0 };
  const SEC_TITLE: React.CSSProperties = {
    fontSize: 9, fontWeight: 800, color: '#93b4d4', letterSpacing: '0.12em',
    textTransform: 'uppercase', marginBottom: 10,
  };

  return (
    <div style={{
      width: 900, fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#fff', color: '#0f2957', display: 'block', margin: 0, padding: 0,
    }}>

      {/* ── HEADER ───────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f2957 0%, #1d4ed8 50%, #0284c7 100%)',
        padding: '28px 36px 24px', color: '#fff',
      }}>
        <div style={{ ...ROW, justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src="/logo.png" alt="Proppi" style={{ width: 28, height: 28, objectFit: 'contain' }} /></div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>Proppi</div>
              <div style={{ fontSize: 10, color: '#93c5fd', marginTop: 2 }}>Inversión Inmobiliaria</div>
            </div>
          </div>
          {/* Badge */}
          <div style={{
            background: '#ffffff20', border: '1px solid #ffffff40',
            borderRadius: 20, padding: '6px 16px', fontSize: 11, color: '#e0f2fe', fontWeight: 600,
            lineHeight: 1.4,
          }}>
            Simulación de Inversión · {todayLabel}
          </div>
        </div>

        {/* Project name */}
        <div style={{ borderTop: '1px solid #ffffff25', paddingTop: 18 }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
            {p.projectName || 'Proyecto Inmobiliario'}
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#bfdbfe', flexWrap: 'wrap' }}>
            <span>📍 {p.commune}</span>
            <span>·</span>
            <span>{p.deliveryType === 'immediate' ? '✅ Entrega Inmediata' : `🏗 Entrega Futura · ${p.constructionMonths} meses obra`}</span>
            <span>·</span>
            <span>📅 Análisis {p.analysisYears} años · Venta {ML[saleMes.month]} {saleMes.year}</span>
            {p.guaranteedRentEnabled && <><span>·</span><span>🏆 Arriendo Garantizado {p.guaranteedRentMonths / 12}a</span></>}
          </div>
        </div>
      </div>

      {/* ── CLIENT ROW ───────────────────────────── */}
      <div style={{
        background: '#eff6ff', borderBottom: '2px solid #dbeafe',
        padding: '14px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: '#93b4d4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Preparado para</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f2957' }}>{clientName || '—'}</div>
            {clientRut && <div style={{ fontSize: 11, color: '#6b93c4', marginTop: 1 }}>RUT {clientRut}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {asesor && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#93b4d4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Asesor</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8' }}>{asesor}</div>
              <div style={{ fontSize: 9, color: '#6b93c4', marginTop: 1 }}>Proppi</div>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#93b4d4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Fecha</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2957' }}>{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* ── 3 KPI HEROES ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
        {[
          {
            icon: '🏢', label: 'Valor Propiedad', main: fUF(R.totalValueUF),
            sub: fCLPFull(R.totalValueUF * p.ufValueCLP),
            note: `UF ${p.ufValueCLP.toLocaleString('es-CL')} hoy`, bg: '#fff', border: '#dbeafe',
          },
          {
            icon: '💰', label: soloGastos ? 'Lo que necesitas al escriturar' : 'Tu Inversión Inicial',
            main: fCLPFull(inversionInicial),
            sub: soloGastos ? `Gastos operacionales del crédito` : fUF(R.clientPieUF, 1),
            note: soloGastos ? `Pie cubierto por bono · Crédito ${fPct(p.financingPercent, 0)}` : `Pie ${fPct(R.totalPiePct)} · Crédito ${fPct(p.financingPercent, 0)}`,
            bg: '#eff6ff', border: '#bfdbfe',
          },
          {
            icon: '📊', label: 'Flujo Mensual Estimado', main: fCLPFull(netMonthly),
            sub: `Arriendo neto ${fCLPFull(R.netMonthlyRentCLP)}`,
            note: `Dividendo ${fCLPFull(R.monthlyPaymentCLP)}`, bg: '#fff', border: '#dbeafe',
          },
        ].map(({ icon, label, main, sub, note, bg, border }) => (
          <div key={label} style={{
            background: bg, borderRight: `1px solid ${border}`, borderBottom: `1px solid ${border}`,
            padding: '20px 28px',
          }}>
            <div style={{ fontSize: 11, color: '#6b93c4', marginBottom: 6 }}>{icon} {label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f2957', marginBottom: 4, letterSpacing: '-0.02em' }}>{main}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 2 }}>{sub}</div>
            <div style={{ fontSize: 10, color: '#93b4d4' }}>{note}</div>
          </div>
        ))}
      </div>

      {/* ── SCENARIOS ────────────────────────────── */}
      <div style={{ padding: '24px 36px', background: '#f8faff' }}>
        <div style={{ ...SEC_TITLE }}>📈 Escenarios de Retorno · {p.analysisYears} años</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Conservative */}
          {([
            {
              label: 'Escenario Conservador', s: R.scenario1,
              ann: R.effectiveAnnual1, total: R.totalApprec1,
              color: '#1d4ed8', bg: '#fff', border: '#bfdbfe', grad: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)',
              icon: '🛡',
            },
            {
              label: 'Escenario Optimista', s: R.scenario2,
              ann: R.effectiveAnnual2, total: R.totalApprec2,
              color: '#15803d', bg: '#f0fdf4', border: '#86efac', grad: 'linear-gradient(135deg,#14532d,#15803d)',
              icon: '🚀',
            },
          ] as const).map(({ label, s, ann, total, color, bg, border, grad, icon }) => (
            <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 14, overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ background: grad, padding: '14px 20px', color: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, marginBottom: 4 }}>{icon} {label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {fPct(ann)}/año · +{fPct(total, 0)} en {p.analysisYears} años
                </div>
              </div>
              {/* Main numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
                  <div style={{ fontSize: 10, color: '#6b93c4', marginBottom: 4 }}>💰 Invertiste</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#dc2626', letterSpacing: '-0.02em' }}>{fCLPFull(R.totalNegativeCashFlow)}</div>
                  <div style={{ fontSize: 9, color: '#93b4d4', marginTop: 2 }}>Flujo negativo total</div>
                </div>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}` }}>
                  <div style={{ fontSize: 10, color: '#6b93c4', marginBottom: 4 }}>✨ Podrías ganar</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color, letterSpacing: '-0.02em' }}>{fCLPFull(s.totalReturn)}</div>
                  <div style={{ fontSize: 9, color: '#93b4d4', marginTop: 2 }}>Retorno total</div>
                </div>
              </div>
              {/* Metrics grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '12px 20px', gap: 12 }}>
                {[
                  ['ROI total', fPct(s.roiPercent, 0)],
                  ['ROI anual', fPct(s.annualizedRoiPercent, 1)],
                  ['Precio venta', fUF(s.salePriceUF)],
                  ['Patr. neto', fCLPFull(s.netEquityCLP)],
                  ['Plusvalía', fPct(total, 0)],
                  ['Venta est.', `${MS[saleMes.month]} ${saleMes.year}`],
                ].map(([lbl, val]) => (
                  <div key={lbl}>
                    <div style={{ fontSize: 8, color: '#93b4d4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{lbl}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FINANCIAL DETAILS ─────────────────────── */}
      <div style={{ padding: '0 36px 24px', background: '#f8faff' }}>
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ ...SEC_TITLE }}>🏦 Detalles Financieros</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              ['Financiamiento', `${fPct(p.financingPercent, 0)} → ${fUF(R.loanUF)}`],
              ['Tasa hipotecaria', `${fPct(p.annualRatePercent)} anual`],
              ['Plazo crédito', `${p.loanTermYears} años`],
              ['Dividendo mensual', fCLPFull(R.monthlyPaymentCLP)],
              ['Arriendo neto/mes', fCLPFull(R.netMonthlyRentCLP)],
              ['Cap Rate', fPct(R.capRatePercent)],
              ['Período de gracia', `${p.gracePeriodMonths} meses`],
              ['Bono pie', `${fPct(p.bonoPiePercent, 0)} → ${fUF(R.bonoPieUF, 1)}`],
            ].map(([lbl, val]) => (
              <div key={lbl}>
                <div style={{ fontSize: 9, color: '#6b93c4', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f2957', fontFamily: 'monospace' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Parking & storage */}
          {(p.parkingCount > 0 || p.storageCount > 0) && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #dbeafe', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {p.parkingCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', borderRadius: 8, padding: '6px 14px' }}>
                  <span style={{ fontSize: 14 }}>🚗</span>
                  <div>
                    <div style={{ fontSize: 9, color: '#6b93c4' }}>Estacionamientos</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{p.parkingCount} × {fUF(p.parkingValueUF)} {p.parkingBonoPie ? '· Bono pie incluido' : ''}</div>
                  </div>
                </div>
              )}
              {p.storageCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', borderRadius: 8, padding: '6px 14px' }}>
                  <span style={{ fontSize: 14 }}>📦</span>
                  <div>
                    <div style={{ fontSize: 9, color: '#6b93c4' }}>Bodega</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{fUF(p.storageValueUF)} {p.storageBonoPie ? '· Bono pie incluido' : ''}</div>
                  </div>
                </div>
              )}
              {p.reserveFundUF > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fefce8', borderRadius: 8, padding: '6px 14px' }}>
                  <span style={{ fontSize: 14 }}>🏛</span>
                  <div>
                    <div style={{ fontSize: 9, color: '#92400e' }}>Fondo de reserva</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>{fUF(p.reserveFundUF, 1)} al escriturar</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── GUARANTEED RENT BANNER ───────────────── */}
      {p.guaranteedRentEnabled && (
        <div style={{ margin: '0 36px 24px', background: 'linear-gradient(135deg,#14532d,#15803d)', borderRadius: 14, padding: '16px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>🏆 Arriendo Garantizado Incluido</div>
            <div style={{ fontSize: 11, color: '#bbf7d0' }}>
              {p.guaranteedRentMonths} meses · {fCLPFull(p.guaranteedRentCLP)}/mes · Sin riesgo de vacancia
            </div>
          </div>
          <div style={{ background: '#ffffff20', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{p.guaranteedRentMonths / 12}a</div>
            <div style={{ fontSize: 9, color: '#bbf7d0' }}>garantizado</div>
          </div>
        </div>
      )}

      {/* ── SUMMARY BAR ─────────────────────────── */}
      <div style={{ margin: '0 36px 24px', background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)', borderRadius: 14, padding: '18px 28px', color: '#fff' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Resumen Ejecutivo
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            ['Valor total propiedad', fCLPFull(R.totalValueUF * p.ufValueCLP), '#fff'],
            ['Flujo total invertido', fCLPFull(R.totalNegativeCashFlow), '#fca5a5'],
            ['Retorno cons.', fCLPFull(R.scenario1.totalReturn), '#93c5fd'],
            ['Retorno opt.', fCLPFull(R.scenario2.totalReturn), '#86efac'],
          ].map(([lbl, val, col]) => (
            <div key={lbl}>
              <div style={{ fontSize: 9, color: '#93c5fd', marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: col as string, fontFamily: 'monospace' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────── */}
      <div style={{ background: '#0f2957', padding: '16px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, background: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src="/logo.png" alt="Proppi" style={{ width: 16, height: 16, objectFit: 'contain' }} /></div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Proppi</span>
          <span style={{ fontSize: 10, color: '#4a7abf' }}>· proppi.cl</span>
        </div>
        <div style={{ fontSize: 9, color: '#4a7abf', maxWidth: 500, textAlign: 'right' }}>
          Valores estimativos basados en proyecciones. No garantizan retorno. UF {p.ufValueCLP.toLocaleString('es-CL')} al {todayLabel}. Documento generado automáticamente por Proppi Simulador.
        </div>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────
export default function PdfExport({ p, R, asesor: defaultAsesor }: {
  p: SimulationParams; R: SimulationResult; asesor: string;
}) {
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState(p.clientName || '');
  const [clientRut, setClientRut] = useState(p.clientRut || '');
  const [asesor, setAsesor] = useState(defaultAsesor || '');
  const [loading, setLoading] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    setClientName(p.clientName || '');
    setClientRut(p.clientRut || '');
    setAsesor(defaultAsesor || '');
    setOpen(true);
  };

  const handleDownload = async () => {
    if (!templateRef.current) return;
    setLoading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const el = templateRef.current;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true, logging: false,
        backgroundColor: '#ffffff',
        width: w, height: h,
        windowWidth: w, windowHeight: h,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = pageW / canvas.width;
      const imgH = canvas.height * ratio;

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH);
      } else {
        // Multi-page if needed
        let y = 0;
        while (y < canvas.height) {
          if (y > 0) pdf.addPage();
          const sliceH = Math.min(pageH / ratio, canvas.height - y);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, -y);
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, sliceH * ratio);
          y += sliceH;
        }
      }

      const filename = `Proppi_${(p.projectName || 'Simulacion').replace(/\s+/g, '_')}_${clientName.split(' ')[0] || 'Cliente'}.pdf`;
      pdf.save(filename);
    } catch (e) {
      console.error(e);
    }
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
      {/* Trigger button */}
      <button onClick={handleOpen} style={{
        padding: '6px 14px', borderRadius: 20, border: '1px solid #ffffff40',
        background: '#0f2957', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      }}>
        📄 Descargar PDF
      </button>

      {/* Modal */}
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
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, background: '#eff6ff', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src="/logo.png" alt="Proppi" style={{ width: 24, height: 24, objectFit: 'contain' }} /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2957' }}>Generar PDF</div>
                <div style={{ fontSize: 11, color: '#6b93c4' }}>{p.projectName || 'Simulación de inversión'}</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Fields */}
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

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={() => setOpen(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #bfdbfe', background: '#fff', color: '#6b93c4', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleDownload} disabled={loading} style={{
                flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
                background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#0284c7)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              }}>
                {loading ? '⏳ Generando...' : '📄 Descargar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF template (off-screen) */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, display: 'inline-block' }}>
        <div ref={templateRef} style={{ display: 'inline-block' }}>
          <PdfTemplate p={p} R={R} clientName={clientName} clientRut={clientRut} asesor={asesor} />
        </div>
      </div>
    </>
  );
}
