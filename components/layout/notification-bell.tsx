"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { formatBookingWhen, formatRelativeTime } from "@/lib/notifications/format";

const POLL_MS = 120_000;
const TOAST_MS = 10_000;

function notificationTitle(n: NotificationItem) {
  if (n.kind === "cancelacion_reserva") return `Reserva cancelada${n.customerName ? ` — ${n.customerName}` : ""}`;
  if (n.kind === "pago_requiere_revision") return `Pago requiere revisión${n.customerName ? ` — ${n.customerName}` : ""}`;
  return `Nueva reserva${n.customerName ? ` — ${n.customerName}` : ""}`;
}

function notificationIcon(n: NotificationItem) {
  if (n.kind === "cancelacion_reserva") return "❌";
  if (n.kind === "pago_requiere_revision") return "⚠️";
  return "🎾";
}

type NotificationItem = {
  id: string;
  bookingId: string;
  kind: string;
  createdAt: string;
  readAt: string | null;
  customerName: string | null;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  bookingStatus: string;
  paymentStatus: string | null;
};

export function NotificationBell() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  // Ids ya vistos + flag de "primer load listo": el toast solo salta para
  // reservas que llegan DESPUÉS de la carga inicial, no para las viejas al abrir
  // el panel. Refs (no estado) porque no deben disparar re-render.
  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const toastTimers = useRef<number[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      const nextItems: NotificationItem[] = data.items ?? [];
      setItems(nextItems);
      setUnread(data.unread ?? 0);

      // Detección de novedades: ids que no habíamos visto. En la primera carga
      // solo sembramos el set (sin toast); a partir de ahí, cada id nuevo saltará.
      const fresh = nextItems.filter((n) => !seenIds.current.has(n.id));
      nextItems.forEach((n) => seenIds.current.add(n.id));
      if (primed.current && fresh.length > 0) {
        router.refresh();
        setToasts((prev) => [...fresh, ...prev].slice(0, 3));
        for (const n of fresh) {
          const timer = window.setTimeout(() => dismissToast(n.id), TOAST_MS);
          toastTimers.current.push(timer);
        }
      }
      primed.current = true;
    } catch {
      /* offline / transitorio: reintenta en el próximo tick o foco */
    }
  }, [dismissToast, router]);

  useEffect(() => {
    // load() es async: el setState ocurre tras el await (microtask), no de forma
    // síncrona, así que no dispara el cascading render que la regla previene.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const timers = toastTimers.current;
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [load]);

  // Cerrar al clickear fuera.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Al abrir con no leídas, las marcamos leídas (baja el badge) sin borrar la lista.
    if (next && unread > 0) {
      setUnread(0);
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markRead" }),
        });
      } catch {
        /* si falla, el badge vuelve en el próximo load */
      }
    }
  }

  const wrapStyle: React.CSSProperties = isMobile
    ? { position: "fixed", top: 10, right: 62, zIndex: 150 }
    : { position: "fixed", top: 14, right: 20, zIndex: 150 };

  const toastWrapStyle: React.CSSProperties = isMobile
    ? { position: "fixed", top: 56, right: 12, left: 12, zIndex: 160, display: "flex", flexDirection: "column", gap: 8 }
    : { position: "fixed", top: 58, right: 20, width: 320, zIndex: 160, display: "flex", flexDirection: "column", gap: 8 };

  return (
    <>
    {toasts.length > 0 && (
      <div style={toastWrapStyle}>
        {toasts.map((n) => (
          <div key={n.id} style={{
            display: "flex", gap: 10, padding: "12px 14px",
            background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 12,
            boxShadow: "0 12px 32px -12px rgba(0,0,0,.4)",
          }}>
            <div style={{ fontSize: 18, lineHeight: 1.1, flexShrink: 0 }}>{notificationIcon(n)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#221F1B" }}>
                {notificationTitle(n)}
              </div>
              <div style={{ fontSize: 12.5, color: "#6B6660", marginTop: 2 }}>
                {n.courtName} · {formatBookingWhen(n.date, n.startTime)} · por bot
              </div>
            </div>
            <button
              onClick={() => dismissToast(n.id)}
              aria-label="Cerrar aviso"
              style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0, alignSelf: "flex-start",
                border: "1px solid #E7E1D6", background: "#fff", color: "#928B7E", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    )}
    <div ref={rootRef} style={wrapStyle}>
      <button
        onClick={toggle}
        aria-label="Notificaciones"
        style={{
          position: "relative", width: 36, height: 36, borderRadius: 9,
          background: "#FCFBF8", border: "1px solid #E0DACE", cursor: "pointer",
          color: "#54504A", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px",
            borderRadius: 999, background: "#C96442", color: "#fff", fontSize: 11, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 44, right: 0, width: 320, maxWidth: "calc(100vw - 32px)",
          maxHeight: 420, overflowY: "auto", background: "#FCFBF8", border: "1px solid #E7E1D6",
          borderRadius: 14, boxShadow: "0 18px 44px -18px rgba(0,0,0,.35)",
        }}>
          <div style={{
            padding: "12px 14px", borderBottom: "1px solid #EFEAE0",
            fontSize: 13, fontWeight: 700, color: "#221F1B",
          }}>
            Notificaciones
          </div>

          {items.length === 0 ? (
            <div style={{ padding: "22px 16px", textAlign: "center", fontSize: 13, color: "#928B7E" }}>
              Todavía no hay notificaciones del bot.
            </div>
          ) : (
            items.map((n) => (
              <div key={n.id} style={{
                display: "flex", gap: 10, padding: "12px 14px", borderBottom: "1px solid #EFEAE0",
                background: n.readAt ? "transparent" : "#FBF3EE",
              }}>
                <div style={{ fontSize: 18, lineHeight: 1.1, flexShrink: 0 }}>{notificationIcon(n)}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#221F1B" }}>
                    {notificationTitle(n)}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#6B6660", marginTop: 2 }}>
                    {n.courtName} · {formatBookingWhen(n.date, n.startTime)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase",
                      color: "#3D5C93", background: "#EAF0F8", borderRadius: 999, padding: "2px 7px",
                    }}>
                      por bot
                    </span>
                    <span style={{ fontSize: 11.5, color: "#928B7E" }}>{formatRelativeTime(n.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
    </>
  );
}
