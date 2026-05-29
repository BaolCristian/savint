import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/db/client";
import { isHubMode } from "@/lib/config/savint-mode";
import { verifyHubCredentials } from "@/lib/auth/hub-credentials";
import { hubAccountAdapter } from "@/lib/auth/hub-adapter";
import { BASE_PATH } from "@/lib/base-path";

const hub = isHubMode();

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorization: { params: { prompt: "select_account" } },
    // All OAuth checks (pkce, state, nonce) rely on cookies which fail
    // behind the reverse proxy with basePath. Disabled until nginx cookie
    // forwarding is fixed. TODO: re-enable once proxy is configured.
    checks: [],
    // Allow linking Google account to existing user with same email.
    // Safe because Google is the only OAuth provider.
    allowDangerousEmailAccountLinking: true,
  }),
];

if (hub) {
  providers.push(
    Credentials({
      id: "hub-credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined) ?? "";
        const password = (credentials?.password as string | undefined) ?? "";
        return verifyHubCredentials(email, password);
      },
    }),
  );
}

if (
  !hub &&
  (process.env.NODE_ENV === "development" || process.env.DEMO_MODE === "true")
) {
  // Dev/demo: login with email, no password needed
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
    }),
  );
}

let adapter: Adapter;

if (hub) {
  adapter = hubAccountAdapter();
} else {
  // PrismaAdapter uses prisma.session for auth sessions, but our "Session"
  // model is for live quiz sessions (requires pin/quizId/hostId).
  // Auth sessions live in the "AuthSession" model (@@map("auth_session")).
  // Override the session CRUD methods to use prisma.authSession directly.
  const baseAdapter = PrismaAdapter(prisma) as Adapter;
  adapter = {
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
}

const sessionStrategy: "jwt" | "database" =
  hub ||
  process.env.NODE_ENV === "development" ||
  process.env.DEMO_MODE === "true"
    ? "jwt"
    : "database";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  providers,
  basePath: `${BASE_PATH}/api/auth`,
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: sessionStrategy },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (hub) {
          const acct = await prisma.hubAccount.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          token.role = acct?.role ?? "HUB_USER";
        } else {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          token.role = dbUser?.role ?? "TEACHER";
        }
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session.user) {
        // JWT mode (hub or dev/credentials) uses token.sub, database mode uses user.id
        session.user.id = user?.id ?? token?.sub ?? "";
        if (hub) {
          session.user.role =
            ((token?.role as "HUB_USER" | "HUB_ADMIN" | undefined) ?? "HUB_USER") as never;
        } else if (user) {
          // Database session: fetch role from user
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
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
