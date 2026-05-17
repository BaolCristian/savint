import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSavintMode,
  isHubMode,
  isInstallationMode,
  getHubUrl,
  getHubBaseUrl,
} from "../savint-mode";

const ORIGINAL_MODE = process.env.SAVINT_MODE;
const ORIGINAL_HUB_URL = process.env.SAVINT_HUB_URL;
const ORIGINAL_HUB_BASE = process.env.HUB_BASE_URL;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("savint-mode", () => {
  beforeEach(() => {
    delete process.env.SAVINT_MODE;
    delete process.env.SAVINT_HUB_URL;
    delete process.env.HUB_BASE_URL;
  });
  afterEach(() => {
    restore("SAVINT_MODE", ORIGINAL_MODE);
    restore("SAVINT_HUB_URL", ORIGINAL_HUB_URL);
    restore("HUB_BASE_URL", ORIGINAL_HUB_BASE);
  });

  describe("getSavintMode", () => {
    it("defaults to installation when unset", () => {
      expect(getSavintMode()).toBe("installation");
      expect(isInstallationMode()).toBe(true);
      expect(isHubMode()).toBe(false);
    });

    it("returns hub when SAVINT_MODE=hub", () => {
      process.env.SAVINT_MODE = "hub";
      expect(getSavintMode()).toBe("hub");
      expect(isHubMode()).toBe(true);
      expect(isInstallationMode()).toBe(false);
    });

    it("returns installation for explicit installation value", () => {
      process.env.SAVINT_MODE = "installation";
      expect(getSavintMode()).toBe("installation");
    });

    it("falls back to installation for unknown value", () => {
      process.env.SAVINT_MODE = "weird";
      expect(getSavintMode()).toBe("installation");
    });
  });

  describe("getHubUrl (installation mode)", () => {
    it("returns SAVINT_HUB_URL when set", () => {
      process.env.SAVINT_HUB_URL = "https://savint.it";
      expect(getHubUrl()).toBe("https://savint.it");
    });

    it("throws when SAVINT_HUB_URL is unset", () => {
      expect(() => getHubUrl()).toThrow(/SAVINT_HUB_URL/);
    });
  });

  describe("getHubBaseUrl (hub mode)", () => {
    it("returns HUB_BASE_URL when set", () => {
      process.env.HUB_BASE_URL = "https://savint.it";
      expect(getHubBaseUrl()).toBe("https://savint.it");
    });

    it("throws when HUB_BASE_URL is unset", () => {
      expect(() => getHubBaseUrl()).toThrow(/HUB_BASE_URL/);
    });
  });
});
