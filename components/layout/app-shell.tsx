"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import type { OnboardingItem } from "@/lib/onboarding/checklist";

interface AppShellProps {
  clubId: string | null;
  clubName: string;
  courtCount: number;
  initials: string;
  clubInfoDone: boolean;
  courtsDone: boolean;
  children: React.ReactNode;
}

type Detail = {
  clubInfoDone: boolean;
  courtsDone: boolean;
  clubInfoItems: OnboardingItem[];
  courtsItems: OnboardingItem[];
};

export function AppShell({
  clubId, clubName, courtCount, initials, clubInfoDone, courtsDone, children,
}: AppShellProps) {
  const [step3Done, setStep3Done] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Estado en vivo del checklist: arranca con los valores del server (sin flash)
  // y se refresca por fetch para reflejar lo que se completa sin recargar.
  const [detail, setDetail] = useState<Detail>({
    clubInfoDone, courtsDone, clubInfoItems: [], courtsItems: [],
  });

  const refetch = useCallback(async () => {
    if (!clubId) return;
    try {
      const res = await fetch("/api/onboarding/status");
      if (res.ok) setDetail(await res.json());
    } catch { /* offline / transitorio: se reintenta al próximo foco */ }
  }, [clubId]);

  useEffect(() => {
    // Lee localStorage/sessionStorage recién tras montar en el cliente: hacerlo
    // durante el render produciría un mismatch de hidratación contra el HTML
    // renderizado en el servidor (donde `window` no existe).
    if (!clubId) return;
    const ack = window.localStorage.getItem(`cancha_onboarding_step3_ack_${clubId}`) === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep3Done(ack);
    const allDone = clubInfoDone && courtsDone && ack;
    const hidden = window.sessionStorage.getItem(`cancha_onboarding_hidden_${clubId}`) === "1";
    setOpen(!allDone && !hidden);
    setMounted(true);
    refetch();
  }, [clubId, clubInfoDone, courtsDone, refetch]);

  useEffect(() => {
    // Al volver el foco a la pestaña (p. ej. tras guardar en Ajustes) refrescamos
    // el estado para que el checklist se re-renderice ya completado.
    if (!clubId) return;
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [clubId, refetch]);

  function close() {
    setOpen(false);
    if (clubId) window.sessionStorage.setItem(`cancha_onboarding_hidden_${clubId}`, "1");
  }

  function openChecklist() {
    refetch();
    setOpen(true);
  }

  function ackStep3() {
    if (!clubId) return;
    window.localStorage.setItem(`cancha_onboarding_step3_ack_${clubId}`, "1");
    setStep3Done(true);
  }

  const allDone = detail.clubInfoDone && detail.courtsDone && step3Done;

  return (
    <div className="app-layout" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        clubName={clubName}
        courtCount={courtCount}
        initials={initials}
        checklistComplete={clubId ? allDone : undefined}
        onOpenChecklist={clubId ? openChecklist : undefined}
      />
      <div className="main-content" style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto", background: "#F4F1EA" }}>
        {children}
      </div>
      {mounted && clubId && (
        <OnboardingChecklist
          open={open}
          onClose={close}
          onNavigate={close}
          clubInfoDone={detail.clubInfoDone}
          courtsDone={detail.courtsDone}
          clubInfoItems={detail.clubInfoItems}
          courtsItems={detail.courtsItems}
          step3Done={step3Done}
          onAckStep3={ackStep3}
        />
      )}
    </div>
  );
}
