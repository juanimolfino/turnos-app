"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";

interface AppShellProps {
  clubId: string | null;
  clubName: string;
  courtCount: number;
  initials: string;
  clubInfoDone: boolean;
  courtsDone: boolean;
  children: React.ReactNode;
}

export function AppShell({
  clubId, clubName, courtCount, initials, clubInfoDone, courtsDone, children,
}: AppShellProps) {
  const [step3Done, setStep3Done] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

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
  }, [clubId, clubInfoDone, courtsDone]);

  function close() {
    setOpen(false);
    if (clubId) window.sessionStorage.setItem(`cancha_onboarding_hidden_${clubId}`, "1");
  }

  function ackStep3() {
    if (!clubId) return;
    window.localStorage.setItem(`cancha_onboarding_step3_ack_${clubId}`, "1");
    setStep3Done(true);
  }

  const allDone = clubInfoDone && courtsDone && step3Done;

  return (
    <div className="app-layout" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        clubName={clubName}
        courtCount={courtCount}
        initials={initials}
        checklistComplete={clubId ? allDone : undefined}
        onOpenChecklist={clubId ? () => setOpen(true) : undefined}
      />
      <div className="main-content" style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto", background: "#F4F1EA" }}>
        {children}
      </div>
      {mounted && clubId && (
        <OnboardingChecklist
          open={open}
          onClose={close}
          clubInfoDone={clubInfoDone}
          courtsDone={courtsDone}
          step3Done={step3Done}
          onAckStep3={ackStep3}
        />
      )}
    </div>
  );
}
