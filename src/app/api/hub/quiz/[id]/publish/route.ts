import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { buildQlz } from "@/lib/hub/qlz-builder";
import {
  fetchWithTokenRefresh,
  HubLinkMissingError,
  HubReauthRequiredError,
  getAuthorizeUrl,
} from "@/lib/hub/hub-client";
import { publishMetadataSchema } from "@/lib/hub/quiz-metadata";
import { savePublishDefaults } from "@/lib/hub/publish-defaults";

async function loadOwnedQuiz(userId: string, id: string) {
  return prisma.quiz.findFirst({
    where: { id, authorId: userId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const quiz = await loadOwnedQuiz(session.user.id, id);
  if (!quiz) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const overrides = await req.json().catch(() => ({}));
  const metadata = publishMetadataSchema.safeParse({
    title: quiz.title,
    description: quiz.description ?? undefined,
    license: quiz.license,
    tags: quiz.tags,
    schoolLevel: overrides.schoolLevel ?? quiz.schoolLevel,
    subject: overrides.subject ?? quiz.subject,
    language: overrides.language ?? quiz.language,
    ageMin: overrides.ageMin ?? quiz.ageMin ?? undefined,
    ageMax: overrides.ageMax ?? quiz.ageMax ?? undefined,
    estimatedDurationSec:
      overrides.estimatedDurationSec ??
      quiz.questions.reduce((s, q) => s + q.timeLimit, 0),
  });
  if (!metadata.success) {
    return NextResponse.json(
      { error: "invalid_metadata", details: metadata.error.flatten() },
      { status: 400 },
    );
  }

  const { buffer, payloadHash } = await buildQlz(quiz);
  const qlzBase64 = buffer.toString("base64");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (quiz.hubPublishedId) headers["If-Match"] = quiz.hubPublishedId;

  let res: Response;
  try {
    res = await fetchWithTokenRefresh(session.user.id, "/api/hub/quizzes", {
      method: "POST",
      headers,
      body: JSON.stringify({ metadata: metadata.data, qlzBase64, payloadHash }),
    });
  } catch (e) {
    if (e instanceof HubReauthRequiredError || e instanceof HubLinkMissingError) {
      return NextResponse.json(
        { error: "reauth_required", reauthUrl: getAuthorizeUrl(id) },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "hub_unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ error: "hub_rejected", hub: body }, { status: res.status });
  }
  const body = (await res.json()) as {
    hubQuizId: string;
    version: number;
    publishedAt: string;
    url: string;
  };
  const link = await prisma.hubLink.findUnique({
    where: { userId: session.user.id },
  });
  await prisma.quiz.update({
    where: { id },
    data: {
      hubPublishedId: body.hubQuizId,
      hubLastPublishedAt: new Date(body.publishedAt),
      hubAccountId: link?.hubAccountId,
    },
  });
  // Ricorda i metadati usati come default dell'utente (non bloccare il publish).
  try {
    await savePublishDefaults(session.user.id, {
      schoolLevel: metadata.data.schoolLevel,
      subject: metadata.data.subject,
      language: metadata.data.language,
      ageMin: metadata.data.ageMin,
      ageMax: metadata.data.ageMax,
    });
  } catch {
    // ignore
  }
  return NextResponse.json(body);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const quiz = await prisma.quiz.findFirst({
    where: { id, authorId: session.user.id },
  });
  if (!quiz || !quiz.hubPublishedId) {
    return NextResponse.json({ error: "not_published" }, { status: 404 });
  }
  let res: Response;
  try {
    res = await fetchWithTokenRefresh(
      session.user.id,
      `/api/hub/quizzes/${quiz.hubPublishedId}`,
      { method: "DELETE" },
    );
  } catch (e) {
    if (e instanceof HubReauthRequiredError || e instanceof HubLinkMissingError) {
      return NextResponse.json(
        { error: "reauth_required", reauthUrl: getAuthorizeUrl(id) },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "hub_unreachable" }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: "hub_rejected" }, { status: res.status });
  }
  await prisma.quiz.update({
    where: { id },
    data: { hubPublishedId: null, hubLastPublishedAt: null, hubAccountId: null },
  });
  return NextResponse.json({ ok: true });
}
