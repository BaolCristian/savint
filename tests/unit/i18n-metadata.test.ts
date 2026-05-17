import { describe, it, expect } from "vitest";
import itMessagesRaw from "@/messages/it.json";
import enMessagesRaw from "@/messages/en.json";

type Messages = {
  metadata?: Record<string, unknown>;
  editor?: Record<string, unknown>;
};

const itMessages = itMessagesRaw as Messages;
const enMessages = enMessagesRaw as Messages;

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
      expect(itMessages.metadata?.[k], `missing it.metadata.${k}`).toBeTruthy();
    }
  });

  it("EN has every required key", () => {
    for (const k of REQUIRED_METADATA_KEYS) {
      expect(enMessages.metadata?.[k], `missing en.metadata.${k}`).toBeTruthy();
    }
  });

  it("editor.metadataSectionTitle exists in both locales", () => {
    expect(itMessages.editor?.metadataSectionTitle).toBeTruthy();
    expect(enMessages.editor?.metadataSectionTitle).toBeTruthy();
  });
});
