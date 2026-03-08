import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/client";

const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
];

// Dev-only: login with email, no password needed
if (process.env.NODE_ENV === "development") {
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
  session: {
    strategy: process.env.NODE_ENV === "development" ? "jwt" : "database",
  },
  callbacks: {
    async session({ session, user, token }) {
      if (session.user) {
        // JWT mode (dev with credentials) uses token.sub, database mode uses user.id
        session.user.id = user?.id ?? token?.sub ?? "";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
