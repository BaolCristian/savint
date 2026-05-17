import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QuizMetadataSection } from "@/components/quiz/quiz-metadata-section";
import itMessages from "@/messages/it.json";

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("QuizMetadataSection", () => {
  const baseProps = {
    schoolLevel: null,
    subject: null,
    language: null,
    ageMin: null,
    ageMax: null,
    onChange: vi.fn(),
  };

  it("renders the four metadata controls", () => {
    renderWithIntl(<QuizMetadataSection {...baseProps} />);
    expect(screen.getByLabelText(/scolastico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/materia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lingua/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/età min/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/età max/i)).toBeInTheDocument();
  });

  it("fires onChange when schoolLevel changes", () => {
    const onChange = vi.fn();
    renderWithIntl(<QuizMetadataSection {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/scolastico/i), {
      target: { value: "PRIMARIA" },
    });
    expect(onChange).toHaveBeenCalledWith({ schoolLevel: "PRIMARIA" });
  });

  it("fires onChange with null when an empty value is selected", () => {
    const onChange = vi.fn();
    renderWithIntl(
      <QuizMetadataSection
        {...baseProps}
        schoolLevel="PRIMARIA"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/scolastico/i), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith({ schoolLevel: null });
  });

  it("fires onChange when subject changes", () => {
    const onChange = vi.fn();
    renderWithIntl(<QuizMetadataSection {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/materia/i), {
      target: { value: "matematica" },
    });
    expect(onChange).toHaveBeenCalledWith({ subject: "matematica" });
  });

  it("fires onChange with parsed integer for ageMin", () => {
    const onChange = vi.fn();
    renderWithIntl(<QuizMetadataSection {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/età min/i), {
      target: { value: "8" },
    });
    expect(onChange).toHaveBeenCalledWith({ ageMin: 8 });
  });

  it("fires onChange with null for cleared age", () => {
    const onChange = vi.fn();
    renderWithIntl(
      <QuizMetadataSection {...baseProps} ageMin={10} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText(/età min/i), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith({ ageMin: null });
  });
});
