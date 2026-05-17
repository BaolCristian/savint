export type SavintMode = "hub" | "installation";

export function getSavintMode(): SavintMode {
  return process.env.SAVINT_MODE === "hub" ? "hub" : "installation";
}

export function isHubMode(): boolean {
  return getSavintMode() === "hub";
}

export function isInstallationMode(): boolean {
  return getSavintMode() === "installation";
}

/**
 * Returns the URL of the hub this installation talks to.
 * Use in installation mode. Throws if SAVINT_HUB_URL is not configured.
 */
export function getHubUrl(): string {
  const url = process.env.SAVINT_HUB_URL;
  if (!url) {
    throw new Error(
      "SAVINT_HUB_URL is not set. Required when SAVINT_MODE=installation to talk to the hub.",
    );
  }
  return url;
}

/**
 * Returns the canonical own origin when running as the hub.
 * Use in hub mode to mint absolute URLs (email links, OAuth redirects).
 * Throws if HUB_BASE_URL is not configured.
 */
export function getHubBaseUrl(): string {
  const url = process.env.HUB_BASE_URL;
  if (!url) {
    throw new Error(
      "HUB_BASE_URL is not set. Required when SAVINT_MODE=hub for absolute URLs.",
    );
  }
  return url;
}
