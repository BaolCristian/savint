// Stub — flesh out in Task 12. Kept side-effect-free so admin-actions tests
// can pass without real templates yet.
export const quizSuspendedTemplate = {
  subject: (_locale: string) => "Your quiz has been suspended",
  body: (_p: { quizTitle: string; reason: string; appealEmail: string }, _l: string) =>
    "stub",
};
