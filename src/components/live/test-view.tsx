"use client";

import { HostView } from "@/components/live/host-view";
import { PlayerView } from "@/components/live/player-view";

interface Props {
  session: {
    id: string;
    pin: string;
    quiz: { title: string; questions: any[] };
  };
}

const TEST_PLAYER_NAME = "Docente (test)";

export function TestView({ session }: Props) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 text-center">
        Modalità test — i risultati non verranno salvati nelle statistiche
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x">
        <section className="overflow-auto" aria-label="Host panel">
          <HostView session={session} />
        </section>
        <section className="overflow-auto" aria-label="Player panel">
          <PlayerView
            testMode
            testPin={session.pin}
            testPlayerName={TEST_PLAYER_NAME}
          />
        </section>
      </div>
    </div>
  );
}
