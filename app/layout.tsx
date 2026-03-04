import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulador de Inversión Inmobiliaria | Proppi",
  description: "Herramienta profesional para asesores inmobiliarios. Analiza flujo de caja mensual, dividendo hipotecario, arriendo neto, plusvalía, escenarios de venta, ROI y Cap Rate — personalizable por proyecto y cliente.",
  keywords: ["simulador inmobiliario", "inversión inmobiliaria", "flujo de caja", "dividendo hipotecario", "plusvalía", "ROI inmobiliario", "proppi", "asesor inmobiliario"],
  authors: [{ name: "Proppi" }],
  openGraph: {
    title: "Simulador de Inversión Inmobiliaria | Proppi",
    description: "Análisis profesional de rentabilidad inmobiliaria: flujo de caja, Cap Rate, ROI, plusvalía y escenarios de venta personalizados por proyecto y cliente.",
    siteName: "Proppi",
    type: "website",
    locale: "es_CL",
  },
  twitter: {
    card: "summary_large_image",
    title: "Simulador de Inversión Inmobiliaria | Proppi",
    description: "Flujo de caja · Cap Rate · ROI · Plusvalía · Escenarios de venta — Herramienta profesional para asesores inmobiliarios.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
