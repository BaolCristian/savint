import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "TEACHER" | "ADMIN";
    } & DefaultSession["user"];
  }
}
