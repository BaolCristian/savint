import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted() is needed (rather than a plain top-level const) because this
// file has static imports of "../gate-callbacks" used across multiple `it`
// blocks; Vitest's hoisting transform relocates those (as dynamic imports)
// above a plain const, which would read mockUser before initialization when
// the "@/lib/db/client" mock factory below runs.
const mockUser = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
const mockAllineaClassi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: { user: mockUser } }));
vi.mock("@/lib/config/student-gate", () => ({ isStudentGateEnabled: vi.fn() }));
vi.mock("@/lib/auth/student-gate", () => ({ evaluateLogin: vi.fn(), takeDecision: vi.fn() }));
vi.mock("@/lib/base-path", () => ({ BASE_PATH: "/savint" }));
vi.mock("@/lib/esercizi/classi", () => ({ allineaClassi: mockAllineaClassi }));

import { isStudentGateEnabled } from "@/lib/config/student-gate";
import { evaluateLogin, takeDecision } from "@/lib/auth/student-gate";
import { signInWithGate, onUserCreated } from "../gate-callbacks";

const enabled = isStudentGateEnabled as ReturnType<typeof vi.fn>;
const evalMock = evaluateLogin as ReturnType<typeof vi.fn>;
const takeMock = takeDecision as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUser.findFirst.mockReset();
  mockUser.update.mockReset();
  enabled.mockReturnValue(true);
  evalMock.mockReset();
  takeMock.mockReset();
  mockAllineaClassi.mockReset();
});

describe("signInWithGate", () => {
  it("returns true and does nothing when the gate is disabled", async () => {
    enabled.mockReturnValue(false);
    expect(await signInWithGate({ email: "a@x.it", provider: "google" })).toBe(true);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("returns true for non-google providers", async () => {
    expect(await signInWithGate({ email: "a@x.it", provider: "credentials" })).toBe(true);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("redirects to /login?error=NotAllowed when the email is missing", async () => {
    expect(await signInWithGate({ email: null, provider: "google" })).toBe("/savint/login?error=NotAllowed");
  });

  it("updates role and classGroups of an existing user", async () => {
    mockUser.findFirst.mockResolvedValue({ id: "u1", role: "TEACHER" });
    evalMock.mockResolvedValue({ allowed: true, role: "STUDENT", classGroups: [{ email: "allievi.3a@x.it", name: "3A", yearLevel: 3 }] });
    expect(await signInWithGate({ email: "M@x.it", provider: "google" })).toBe(true);
    expect(evalMock).toHaveBeenCalledWith("m@x.it", "TEACHER");
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "STUDENT", classGroups: [{ email: "allievi.3a@x.it", name: "3A", yearLevel: 3 }] },
    });
  });

  it("allinea le classi di uno studente esistente dopo l'update", async () => {
    mockUser.findFirst.mockResolvedValue({ id: "u1", role: "STUDENT" });
    const classGroups = [{ email: "allievi.3a@x.it", name: "3A", yearLevel: 3 }];
    evalMock.mockResolvedValue({ allowed: true, role: "STUDENT", classGroups });
    await signInWithGate({ email: "m@x.it", provider: "google" });
    expect(mockAllineaClassi).toHaveBeenCalledWith("u1", classGroups);
  });

  it("existing user stored with mixed-case email is found and keeps ADMIN", async () => {
    mockUser.findFirst.mockResolvedValue({ id: "u1", role: "ADMIN" });
    evalMock.mockResolvedValue({ allowed: true, role: "ADMIN", classGroups: [] });
    expect(await signInWithGate({ email: "M@x.it", provider: "google" })).toBe(true);
    expect(mockUser.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "m@x.it", mode: "insensitive" } },
      select: { id: true, role: true },
    });
    expect(evalMock).toHaveBeenCalledWith("m@x.it", "ADMIN");
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "ADMIN", classGroups: [] },
    });
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });

  it("does not touch classGroups when the decision has none (Google error, existing user)", async () => {
    mockUser.findFirst.mockResolvedValue({ id: "u1", role: "TEACHER" });
    evalMock.mockResolvedValue({ allowed: true, role: "TEACHER" });
    await signInWithGate({ email: "m@x.it", provider: "google" });
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "TEACHER" } });
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });

  it("non allinea le classi di uno studente esistente quando la decisione non ha gruppi", async () => {
    mockUser.findFirst.mockResolvedValue({ id: "u1", role: "STUDENT" });
    evalMock.mockResolvedValue({ allowed: true, role: "STUDENT" });
    await signInWithGate({ email: "m@x.it", provider: "google" });
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });

  it("does not call update for a new user (createUser will)", async () => {
    mockUser.findFirst.mockResolvedValue(null);
    evalMock.mockResolvedValue({ allowed: true, role: "STUDENT", classGroups: [] });
    expect(await signInWithGate({ email: "n@x.it", provider: "google" })).toBe(true);
    expect(evalMock).toHaveBeenCalledWith("n@x.it", null);
    expect(mockUser.update).not.toHaveBeenCalled();
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });

  it("redirects with the deny reason", async () => {
    mockUser.findFirst.mockResolvedValue(null);
    evalMock.mockResolvedValue({ allowed: false, reason: "GroupCheckFailed" });
    expect(await signInWithGate({ email: "n@x.it", provider: "google" })).toBe("/savint/login?error=GroupCheckFailed");
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });
});

describe("onUserCreated", () => {
  it("applies the cached decision to the freshly created user", async () => {
    takeMock.mockReturnValue({ allowed: true, role: "STUDENT", classGroups: [] });
    await onUserCreated({ id: "u9", email: "n@x.it" });
    expect(takeMock).toHaveBeenCalledWith("n@x.it");
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: "u9" }, data: { role: "STUDENT", classGroups: [] } });
  });

  it("allinea le classi di uno studente appena creato", async () => {
    const classGroups = [{ email: "allievi.3a@x.it", name: "3A", yearLevel: 3 }];
    takeMock.mockReturnValue({ allowed: true, role: "STUDENT", classGroups });
    await onUserCreated({ id: "u9", email: "n@x.it" });
    expect(mockAllineaClassi).toHaveBeenCalledWith("u9", classGroups);
  });

  it("does not touch classGroups when the decision has none", async () => {
    takeMock.mockReturnValue({ allowed: true, role: "TEACHER" });
    await onUserCreated({ id: "u9", email: "n@x.it" });
    expect(mockUser.update).toHaveBeenCalledWith({ where: { id: "u9" }, data: { role: "TEACHER" } });
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });

  it("non allinea le classi di un nuovo docente anche se la decisione avesse dei gruppi", async () => {
    takeMock.mockReturnValue({ allowed: true, role: "TEACHER", classGroups: [] });
    await onUserCreated({ id: "u9", email: "n@x.it" });
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });

  it("does nothing without a cached decision or when the gate is disabled", async () => {
    takeMock.mockReturnValue(undefined);
    await onUserCreated({ id: "u9", email: "n@x.it" });
    enabled.mockReturnValue(false);
    await onUserCreated({ id: "u9", email: "n@x.it" });
    expect(mockUser.update).not.toHaveBeenCalled();
    expect(mockAllineaClassi).not.toHaveBeenCalled();
  });
});
