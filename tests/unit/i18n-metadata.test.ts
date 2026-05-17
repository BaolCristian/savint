import { describe, it, expect } from "vitest";
import itMessages from "@/messages/it.json";
import enMessages from "@/messages/en.json";

const REQUIRED_METADATA_KEYS = [
  "schoolLevelLabel",
  "subjectLabel",
  "languageLabel",
  "ageMinLabel",
  "ageMaxLabel",
  "notSpecified",
  "level_PRIMARIA",
  "level_SECONDARIA_I",
  "level_SECONDARIA_II",
  "level_UNIVERSITA",
  "level_ALTRO",
  "langIt",
  "langEn",
  "langFr",
  "langEs",
  "langDe",
  "langLa",
];

describe("i18n metadata namespace", () => {
  it("IT has every required key", () => {
    for (const k of REQUIRED_METADATA_KEYS) {
      expect((itMessages as any).metadata?.[k], `missing it.metadata.${k}`).toBeTruthy();
    }
  });

  it("EN has every required key", () => {
    for (const k of REQUIRED_METADATA_KEYS) {
      expect((enMessages as any).metadata?.[k], `missing en.metadata.${k}`).toBeTruthy();
    }
  });

  it("editor.metadataSectionTitle exists in both locales", () => {
    expect((itMessages as any).editor?.metadataSectionTitle).toBeTruthy();
    expect((enMessages as any).editor?.metadataSectionTitle).toBeTruthy();
  });
});
