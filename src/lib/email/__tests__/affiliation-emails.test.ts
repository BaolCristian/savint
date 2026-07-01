import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => undefined) }));
import { sendEmail } from "@/lib/email/send";
import { sendAffiliationCodeEmail } from "@/lib/email/affiliation-emails";

it("invia il codice di setup", async () => {
  await sendAffiliationCodeEmail({ to: "a@b.it", schoolName: "IIS X", setupCode: "ABC123" });
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.it", text: expect.stringContaining("ABC123") }));
});
