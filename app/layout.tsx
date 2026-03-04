import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulador de Inversión Inmobiliaria | Proppi",
  description: "Herramienta profesional para análisis de rentabilidad en bienes raíces — Flujo de caja, Cap Rate, ROI, IRR",
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
