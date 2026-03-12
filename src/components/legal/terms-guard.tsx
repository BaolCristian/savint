"use client";

import { useState, useEffect } from "react";
import { TermsAcceptanceModal } from "@/components/legal/terms-acceptance-modal";
import { withBasePath } from "@/lib/base-path";
import { CURRENT_TERMS_VERSION } from "@/lib/config/legal";

export function TermsGuard({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(withBasePath(`/api/consent/check?type=TERMS_ACCEPTANCE&version=${CURRENT_TERMS_VERSION}`))
      .then((res) => res.json())
      .then((data) => setAccepted(data.accepted))
      .catch(() => setAccepted(true)); // fail open to not block usage
  }, []);

  if (accepted === null) return <>{children}</>;

  return (
    <>
      {!accepted && <TermsAcceptanceModal onAccepted={() => setAccepted(true)} />}
      {children}
    </>
  );
}
