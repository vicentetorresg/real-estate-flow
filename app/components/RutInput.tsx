'use client';
import React from 'react';

// ─── Utilidades RUT chileno ───────────────────────────────────

/** Elimina todo excepto dígitos y K/k */
function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

/** Formatea: 11111111 + K → "11.111.111-K" */
export function formatRut(raw: string): string {
  const clean = cleanRut(raw);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv   = clean.slice(-1);
  // Agregar puntos cada 3 dígitos desde la derecha
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
}

/** Valida dígito verificador */
export function validateRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dvInput = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const dvCalc = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return dvCalc === dvInput;
}

// ─── Componente ───────────────────────────────────────────────
interface RutInputProps {
  value: string;
  onChange: (formatted: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
}

export default function RutInput({ value, onChange, style, placeholder = '11.111.111-K' }: RutInputProps) {
  const clean = cleanRut(value);
  const isValid   = clean.length >= 7 && validateRut(clean);
  const isInvalid = clean.length >= 7 && !validateRut(clean);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Permitir borrar libremente; solo formatear si hay contenido
    const cleaned = cleanRut(raw);
    if (cleaned.length === 0) { onChange(''); return; }
    // Limitar a 9 caracteres (8 dígitos + DV)
    if (cleaned.length > 9) return;
    onChange(formatRut(cleaned));
  };

  const borderColor = isValid ? '#16a34a' : isInvalid ? '#dc2626' : '#bfdbfe';

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        style={{
          ...style,
          border: `1px solid ${borderColor}`,
          paddingRight: clean.length >= 7 ? 32 : undefined,
          transition: 'border-color 0.15s',
        }}
      />
      {clean.length >= 7 && (
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, pointerEvents: 'none',
        }}>
          {isValid ? '✓' : '✗'}
        </span>
      )}
    </div>
  );
}
