import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Cancha",
    template: "%s | Cancha"
  },
  description: "La agenda de tu club de pádel en una sola pantalla.",
  openGraph: {
    title: "Cancha",
    description: "Gestioná turnos, clases y torneos de todas tus canchas.",
    url: "/",
    siteName: "Cancha",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
