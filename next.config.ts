import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Teste no celular (mesma rede Wi-Fi).
 * O Next 16 bloqueia, em DESENVOLVIMENTO, recursos de dev (HMR, chunks) pedidos por
 * origens diferentes de `localhost` — no iPhone a página ficaria presa no carregamento.
 * Liberamos apenas os IPs PRIVADOS (RFC 1918) do próprio computador, detectados ao iniciar
 * o servidor (o IP do Wi-Fi pode mudar). Não tem efeito em produção (`next start`).
 * Endereços extras: variável DEV_ORIGINS="host1,host2".
 */
function privateLanHosts(): string[] {
  const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const hosts = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && isPrivate(i.address))
    .map((i) => i!.address);
  const extra = (process.env.DEV_ORIGINS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return [...new Set([...hosts, ...extra])];
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: privateLanHosts(),
  // Indicador "N" do modo dev: no canto inferior ele cobria o botão "Início" da tab bar mobile.
  devIndicators: { position: "top-right" },
  // Imagens servidas diretamente (sem otimizador). Na Netlify o otimizador usa o endpoint
  // próprio `/.netlify/images`, que não há garantia de passar pela proteção do `proxy.ts`;
  // assim, todo arquivo de imagem passa pela autenticação da demonstração.
  // São só 3 imagens pequenas da marca (public/brand/web).
  images: { unoptimized: true },
  // Service worker (só notificações): sempre a versão nova e restrito à própria origem.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
