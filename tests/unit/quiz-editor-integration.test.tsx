import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QuizEditor } from "@/components/quiz/quiz-editor";
import itMessages from "@/messages/it.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderEditor(initialData?: Parameters<typeof QuizEditor>[0]["initialData"]) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <QuizEditor initialData={initialData} hasConsent={true} />
    </NextIntlClientProvider>,
  );
}

describe("QuizEditor metadata integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-id" }),
    }) as unknown as typeof fetch;
  });

  it("shows the metadata inputs inside Quiz settings when expanded", () => {
    renderEditor({
      title: "Test", questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    fireEvent.click(screen.getByText(/impostazioni quiz/i));
    expect(screen.getByLabelText(/grado scolastico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/materia/i)).toBeInTheDocument();
  });

  it("pre-fills metadata values from initialData", () => {
    renderEditor({
      title: "Pre",
      schoolLevel: "PRIMARIA",
      subject: "matematica",
      language: "it",
      ageMin: 7,
      ageMax: 10,
      questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    } as Parameters<typeof QuizEditor>[0]["initialData"]);
    fireEvent.click(screen.getByText(/impostazioni quiz/i));
    expect((screen.getByLabelText(/grado scolastico/i) as HTMLSelectElement).value).toBe("PRIMARIA");
    expect((screen.getByLabelText(/materia/i) as HTMLSelectElement).value).toBe("matematica");
    expect((screen.getByLabelText(/età min/i) as HTMLInputElement).value).toBe("7");
  });

  it("includes metadata in the POST payload when saving a new quiz", async () => {
    renderEditor({
      title: "Save", questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    fireEvent.click(screen.getByText(/impostazioni quiz/i));
    fireEvent.change(screen.getByLabelText(/grado scolastico/i), { target: { value: "SECONDARIA_II" } });
    fireEvent.change(screen.getByLabelText(/materia/i), { target: { value: "fisica" } });
    fireEvent.change(screen.getByLabelText(/età min/i), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: /salva/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.schoolLevel).toBe("SECONDARIA_II");
    expect(body.subject).toBe("fisica");
    expect(body.ageMin).toBe(14);
  });
});
