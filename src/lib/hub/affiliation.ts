import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import type { AffiliationRequestInput } from "@/lib/affiliation/schema";

const SETUP_CODE_TTL_MS = 72 * 60 * 60 * 1000; // 72h

function sha256(s: string) { return createHash("sha256").update(s, "utf8").digest("hex"); }

export async function createRequest(input: AffiliationRequestInput) {
  const emailToken = randomBytes(32).toString("hex");
  const request = await prisma.affiliationRequest.create({
    data: {
      schoolName: input.schoolName, province: input.province,
      installationUrl: input.installationUrl.replace(/\/+$/, ""), contactEmail: input.contactEmail,
      status: "PENDING_EMAIL", emailVerifyTokenHash: sha256(emailToken),
    },
  });
  return { request, emailToken };
}

export async function verifyEmail(token: string) {
  const hash = sha256(token);
  const req = await prisma.affiliationRequest.findFirst({ where: { emailVerifyTokenHash: hash, status: "PENDING_EMAIL" } });
  if (!req) return { ok: false };
  await prisma.affiliationRequest.update({ where: { id: req.id }, data: { status: "PENDING_REVIEW", emailVerifiedAt: new Date(), emailVerifyTokenHash: null } });
  return { ok: true };
}

export async function approve(requestId: string, adminId: string) {
  const req = await prisma.affiliationRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING_REVIEW") return { ok: false as const, error: "invalid_state" };

  const clientId = `inst_${randomBytes(16).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("base64url");
  const clientSecretHash = await hashPassword(clientSecret);
  const setupCode = randomBytes(24).toString("base64url");

  const inst = await prisma.installation.create({
    data: { name: req.schoolName, contactEmail: req.contactEmail, clientId, clientSecretHash },
  });
  await prisma.affiliationRequest.update({
    where: { id: req.id },
    data: {
      status: "APPROVED", installationId: inst.id, reviewedByHubAccountId: adminId, reviewedAt: new Date(),
      setupCodeHash: sha256(setupCode), setupCodeExpiresAt: new Date(Date.now() + SETUP_CODE_TTL_MS),
      pendingClientId: clientId, pendingClientSecret: clientSecret,
    },
  });

  return { ok: true as const, setupCode, contactEmail: req.contactEmail, schoolName: req.schoolName };
}

export async function reject(requestId: string, adminId: string, reason?: string) {
  const req = await prisma.affiliationRequest.findUnique({ where: { id: requestId } });
  if (!req || (req.status !== "PENDING_REVIEW" && req.status !== "PENDING_EMAIL")) return { ok: false as const };
  await prisma.affiliationRequest.update({
    where: { id: req.id },
    data: { status: "REJECTED", reviewedByHubAccountId: adminId, reviewedAt: new Date(), rejectionReason: reason ?? null },
  });
  return { ok: true as const, contactEmail: req.contactEmail, schoolName: req.schoolName };
}

export async function redeem(setupCode: string) {
  const req = await prisma.affiliationRequest.findFirst({
    where: { setupCodeHash: sha256(setupCode), status: "APPROVED" },
  });
  if (!req) return { ok: false as const, error: "invalid_code" };
  if (!req.setupCodeExpiresAt || req.setupCodeExpiresAt < new Date()) return { ok: false as const, error: "expired" };
  if (!req.pendingClientId || !req.pendingClientSecret) return { ok: false as const, error: "no_credentials" };

  const clientId = req.pendingClientId;
  const clientSecret = req.pendingClientSecret;

  // Atomic single-use claim: only one concurrent caller flips APPROVED -> REDEEMED.
  const claimed = await prisma.affiliationRequest.updateMany({
    where: { id: req.id, status: "APPROVED" },
    data: { status: "REDEEMED", redeemedAt: new Date(), setupCodeHash: null, pendingClientSecret: null },
  });
  if (claimed.count === 0) return { ok: false as const, error: "invalid_code" };

  return { ok: true as const, clientId, clientSecret };
}
