import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { QuizEditor } from "@/components/quiz/quiz-editor";

export default async function NewQuizPage() {
  const session = await auth();
  const hasConsent = session?.user?.id
    ? !!(await prisma.consent.findFirst({
        where: { userId: session.user.id, type: "QUIZ_PUBLISH_DECLARATION" },
      }))
    : false;

  return <QuizEditor hasConsent={hasConsent} />;
}
