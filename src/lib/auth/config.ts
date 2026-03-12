import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/db/client";

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorization: { params: { prompt: "select_account" } },
    // Use nonce check (embedded in ID token) instead of PKCE/state
    // which rely on cookies that fail behind reverse proxy with basePath.
    checks: ["nonce"],
  }),
];

// Dev/demo: login with email, no password needed
if (process.env.NODE_ENV === "development" || process.env.DEMO_MODE === "true") {
  providers.push(
    Credentials({
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "docente@scuola.it" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        if (!email) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        return user;
      },
    })
  );
}

// PrismaAdapter uses prisma.session for auth sessions, but our "Session"
// model is for live quiz sessions (requires pin/quizId/hostId).
// Auth sessions live in the "AuthSession" model (@@map("auth_session")).
// Override the session CRUD methods to use prisma.authSession directly.
const baseAdapter = PrismaAdapter(prisma) as Adapter;
const adapter: Adapter = {
  ...baseAdapter,
  async createSession(session) {
    const created = await prisma.authSession.create({ data: session });
    return created;
  },
  async getSessionAndUser(sessionToken) {
    const row = await prisma.authSession.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
    if (!row) return null;
    const { user, ...session } = row;
    return { session, user };
  },
  async updateSession({ sessionToken, ...data }) {
    const updated = await prisma.authSession.update({
      where: { sessionToken },
      data,
    });
    return updated;
  },
  async deleteSession(sessionToken) {
    await prisma.authSession.delete({ where: { sessionToken } });
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  providers,
  basePath: "/savint/api/auth",
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: (process.env.NODE_ENV === "development" || process.env.DEMO_MODE === "true") ? "jwt" : "database",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
        token.role = dbUser?.role ?? "TEACHER";
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session.user) {
        // JWT mode (dev with credentials) uses token.sub, database mode uses user.id
        session.user.id = user?.id ?? token?.sub ?? "";
        if (user) {
          // Database session: fetch role from user
          const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
          session.user.role = (dbUser?.role as "TEACHER" | "ADMIN") ?? "TEACHER";
        } else {
          // JWT session
          session.user.role = (token.role as "TEACHER" | "ADMIN") ?? "TEACHER";
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
