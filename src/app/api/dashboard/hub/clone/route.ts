import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { fetchHubQuizDownload } from "@/lib/hub/hub-client";
import { qlzManifestSchema } from "@/lib/validators/qlz";
import JSZip from "jszip";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { hubQuizId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { hubQuizId } = body;
  if (!hubQuizId) {
    return NextResponse.json({ error: "missing_hubQuizId" }, { status: 400 });
  }

  // Dedup check: has this user already cloned this hub quiz at the current version?
  let download: { qlzBase64: string; hubAuthor: string; version: number; hubQuizId: string };
  try {
    download = await fetchHubQuizDownload(userId, hubQuizId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("hub_link_missing") || msg.includes("hub_reauth_required")) {
      return NextResponse.json({ error: "hub_reauth_required" }, { status: 403 });
    }
    if (msg.includes("hub_download_404")) {
      return NextResponse.json({ error: "hub_quiz_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "hub_unreachable" }, { status: 502 });
  }

  // Dedup: already cloned at same version?
  const existing = await prisma.quiz.findFirst({
    where: {
      authorId: userId,
      clonedFromHubId: hubQuizId,
      clonedFromHubVersion: download.version,
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "already_cloned", localQuizId: existing.id },
      { status: 409 },
    );
  }

  // Parse the .qlz payload
  let payload: Buffer;
  try {
    payload = Buffer.from(download.qlzBase64, "base64");
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 502 });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(payload);
  } catch {
    return NextResponse.json({ error: "invalid_qlz" }, { status: 502 });
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    return NextResponse.json({ error: "missing_manifest" }, { status: 502 });
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(await manifestFile.async("text"));
  } catch {
    return NextResponse.json({ error: "invalid_manifest_json" }, { status: 502 });
  }

  const parsed = qlzManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_manifest_schema" }, { status: 502 });
  }

  const manifest = parsed.data;

  const quiz = await prisma.quiz.create({
    data: {
      title: manifest.quiz.title,
      description: manifest.quiz.description,
      tags: manifest.quiz.tags,
      authorId: userId,
      clonedFromHubId: hubQuizId,
      clonedFromHubVersion: download.version,
      clonedFromHubAuthor: download.hubAuthor,
      questions: {
        create: manifest.quiz.questions.map((q, i) => ({
          type: q.type,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          order: i,
          options: q.options,
          confidenceEnabled: false,
          mediaUrl: null,
        })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ localQuizId: quiz.id }, { status: 201 });
}
