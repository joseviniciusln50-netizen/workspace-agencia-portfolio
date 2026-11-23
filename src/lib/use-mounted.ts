import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * `false` no servidor/prerender e na hidratação; `true` depois de montar no cliente.
 * Usado pelo AppShell para renderizar o conteúdo só no cliente: com Cache Components
 * (Next 16) `new Date()` não pode ser avaliado no prerender.
 */
export function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
