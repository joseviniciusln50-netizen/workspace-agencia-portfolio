import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { BadgeSafeArea } from "@/components/shell/badge-safe-area";
import "./globals.css";

// Fonte PROVISÓRIA da interface (sans geométrica próxima à prancha).
// Fonte provisória (a versão real usaria a fonte oficial da marca).
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Workspace",
    template: "%s · Workspace",
  },
  description: "Gestão interna de uma agência de comunicação",
  // Ferramenta interna: não indexar em buscadores.
  robots: { index: false, follow: false },
  // iPhone: "Adicionar à Tela de Início" abre como app (sem barra do Safari), com o ícone oficial.
  appleWebApp: { capable: true, title: "Workspace", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full antialiased`}>
      {/* O AppShell (menu, barra inferior) fica em app/(app)/layout.tsx: só para quem está logado. */}
      <body className="min-h-full">
        {children}
        <BadgeSafeArea />
      </body>
    </html>
  );
}
