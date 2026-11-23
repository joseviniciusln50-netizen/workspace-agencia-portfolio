import type { MetadataRoute } from "next";

/**
 * App instalável ("Adicionar à tela de início"). Na versão de portfólio, os ícones são marcadores neutros
 * (o sistema real usa o símbolo oficial da agência, que não faz parte deste repositório).
 * Sem service worker de propósito: nada de cache offline de páginas com dados internos.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Workspace",
    short_name: "Workspace",
    description: "Gestão interna de uma agência de comunicação.",
    lang: "pt-BR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
