import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { generateQuizTemplate } from "@/lib/excel/template";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const buffer = await generateQuizTemplate();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="savint-template.xlsx"',
    },
  });
}
