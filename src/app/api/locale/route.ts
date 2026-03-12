import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { locale } = await req.json();
  if (!["it", "en"].includes(locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const res = NextResponse.json({ locale });
  res.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
