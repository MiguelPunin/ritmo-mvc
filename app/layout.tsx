import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ritmo · Metas y hábitos",
  description: "Seguimiento de metas y hábitos de gimnasio. Un pequeño paso cada día.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
