import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { prisma } from "@/lib/db/client";

describe("/u/:hubAccountId", () => {
  let aid: string;
  let qid: string;
  beforeAll(async () => {
    const a = await prisma.hubAccount.create({
      data: {
        email: `prof-${Date.now()}@t`,
        name: "Mara Verdi",
        affiliation: "Liceo X",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    aid = a.id;
    const q = await prisma.hubQuiz.create({
      data: {
        hubAccountId: aid,
        title: "Verdi Quiz",
        description: "d",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 30,
        payloadBlob: Buffer.from("x") as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: 1,
      },
    });
    qid = q.id;
  });
  afterAll(async () => {
    await prisma.hubQuiz.delete({ where: { id: qid } });
    await prisma.hubAccount.delete({ where: { id: aid } });
  });

  it("renders name, affiliation, and published quizzes", async () => {
    const Page = (await import("@/app/u/[hubAccountId]/page")).default;
    const ui = await Page({ params: Promise.resolve({ hubAccountId: aid }) });
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>{ui as React.ReactElement}</NextIntlClientProvider>
    );
    expect(container.textContent).toContain("Mara Verdi");
    expect(container.textContent).toContain("Liceo X");
    expect(container.textContent).toContain("Verdi Quiz");
  });
});
