import { isHubMode } from "@/lib/config/savint-mode";
import { PlayerView } from "@/components/live/player-view";
import { HubLanding } from "@/components/hub/hub-landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (isHubMode()) {
    return <HubLanding />;
  }
  return <PlayerView />;
}
