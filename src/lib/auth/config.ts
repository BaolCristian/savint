import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/client";

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  basePath: "/savint/api/auth",
  trustHost: true,
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
