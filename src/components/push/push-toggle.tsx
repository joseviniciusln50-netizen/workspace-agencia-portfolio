"use client";

import { BellRing, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/push/actions";
import { cn } from "@/lib/utils";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * Liga/desliga as notificações NESTE aparelho. O service worker só é registrado quando a pessoa ativa.
 * iPhone: a Apple só permite notificações no app instalado na Tela de Início (iOS 16.4+).
 */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(PUBLIC_KEY);
      let next: State;
      // iPhone fora do app instalado: a Apple não entrega notificações (mesmo que a API exista na aba)
      if (isIOS() && !isStandalone()) next = "ios-install";
      else if (!supported) next = "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const sub = await currentSubscription().catch(() => null);
        if (sub) void savePushSubscription(sub.toJSON(), navigator.userAgent); // mantém o servidor em dia
        next = sub ? "on" : "off";
      }
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      // 1º passo SEMPRE o pedido de permissão (no iPhone precisa vir direto do toque)
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) }));
      const r = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (!r.ok) {
        await sub.unsubscribe().catch(() => {});
        setMsg({ text: r.error ?? "Não foi possível ativar.", error: true });
        return;
      }
      setState("on");
      setMsg({ text: "Ativadas. Toque em “Enviar teste” para conferir." });
    } catch {
      setMsg({ text: "Não foi possível ativar neste navegador.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await sendTestPush().catch(() => ({ ok: false, error: "Sem conexão." }));
    setMsg(r.ok ? { text: "Enviada. Deve chegar em alguns segundos." } : { text: r.error ?? "Não foi possível enviar.", error: true });
    setBusy(false);
  }

  const btn = "inline-flex h-10 items-center gap-1.5 rounded-tile px-4 text-xs font-bold tracking-wide uppercase transition-opacity disabled:opacity-50";

  return (
    <div className={cn("flex flex-col gap-2", compact && "rounded-tile border border-hairline p-3")} data-push-state={state}>
      <div className="flex items-start gap-2.5">
        <BellRing className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Notificações neste aparelho</p>
          <p className="text-xs font-light text-muted">
            {state === "loading" && "Verificando…"}
            {state === "on" && "Ativadas: você recebe avisos mesmo com o app fechado."}
            {state === "off" && "Receba os avisos das suas tarefas mesmo com o app fechado."}
            {state === "denied" && "Bloqueadas. Libere nas configurações do navegador (ou do celular) para este site e volte aqui."}
            {state === "ios-install" && "No iPhone: abra no Safari, toque em Compartilhar → “Adicionar à Tela de Início” e ative pelo app instalado."}
            {state === "unsupported" && "Este navegador não recebe notificações."}
          </p>
        </div>
      </div>
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap gap-2">
          {state === "off" ? (
            <button type="button" onClick={enable} disabled={busy} className={cn(btn, "bg-ink text-paper")}>
              {busy && <Loader2 className="size-3.5 animate-spin" />} Ativar
            </button>
          ) : (
            <>
              <button type="button" onClick={test} disabled={busy} className={cn(btn, "bg-ink text-paper")}>
                {busy && <Loader2 className="size-3.5 animate-spin" />} Enviar teste
              </button>
              <button type="button" onClick={disable} disabled={busy} className={cn(btn, "border border-hairline hover:border-ink/30")}>
                Desativar
              </button>
            </>
          )}
        </div>
      )}
      {msg && (
        <p role={msg.error ? "alert" : "status"} className={cn("text-xs font-semibold", msg.error ? "text-brand-text" : "text-ink")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
