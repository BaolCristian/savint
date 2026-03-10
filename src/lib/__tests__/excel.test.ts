import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateQuizTemplate, SHEETS } from "@/lib/excel/template";
import { parseExcelQuiz } from "@/lib/excel/parser";

// ---------------------------------------------------------------------------
// Helper: build a workbook with one sheet for parser tests
// ---------------------------------------------------------------------------
async function buildWorkbook(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName);
  sheet.addRow(headers); // row 1 = header
  sheet.addRow([]); // row 2 = example (skipped by parser)
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ===========================================================================
// Template tests
// ===========================================================================
describe("generateQuizTemplate", () => {
  it("creates a workbook with 5 sheets with the correct names", async () => {
    const buffer = await generateQuizTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual([
      "Scelta Multipla",
      "Vero o Falso",
      "Risposta Aperta",
      "Ordinamento",
      "Stima Numerica",
    ]);
  });

  it("each sheet has a header row and an example row (rowCount = 2)", async () => {
    const buffer = await generateQuizTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    for (const sheetDef of SHEETS) {
      const ws = wb.getWorksheet(sheetDef.name);
      expect(ws, `Sheet "${sheetDef.name}" should exist`).toBeDefined();
      expect(ws!.rowCount).toBe(2);
    }
  });
});

// ===========================================================================
// Parser tests
// ===========================================================================
describe("parseExcelQuiz", () => {
  const MC_HEADERS = [
    "Domanda",
    "Tempo (sec)",
    "Punti",
    "Confidenza (S/N)",
    "Opzione1",
    "Opzione2",
    "Opzione3",
    "Opzione4",
    "Opzione5",
    "Opzione6",
    "Corretta",
  ];

  const TF_HEADERS = [
    "Domanda",
    "Tempo (sec)",
    "Punti",
    "Confidenza (S/N)",
    "Risposta (V/F)",
  ];

  const OA_HEADERS = [
    "Domanda",
    "Tempo (sec)",
    "Punti",
    "Confidenza (S/N)",
    "Risposta1",
    "Risposta2",
    "Risposta3",
  ];

  const ORD_HEADERS = [
    "Domanda",
    "Tempo (sec)",
    "Punti",
    "Confidenza (S/N)",
    "Elemento1",
    "Elemento2",
    "Elemento3",
    "Elemento4",
    "Elemento5",
    "Elemento6",
  ];

  const NE_HEADERS = [
    "Domanda",
    "Tempo (sec)",
    "Punti",
    "Confidenza (S/N)",
    "Valore Corretto",
    "Tolleranza",
    "Range Massimo",
    "Unità",
  ];

  it("parses MULTIPLE_CHOICE correctly (3 options, 1 correct)", async () => {
    const buf = await buildWorkbook("Scelta Multipla", MC_HEADERS, [
      ["Capitale d'Italia?", 30, 1000, "N", "Roma", "Milano", "Napoli", "", "", "", "1"],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);

    const q = questions[0];
    expect(q.type).toBe("MULTIPLE_CHOICE");
    expect(q.text).toBe("Capitale d'Italia?");
    expect(q.options).toEqual({
      choices: [
        { text: "Roma", isCorrect: true },
        { text: "Milano", isCorrect: false },
        { text: "Napoli", isCorrect: false },
      ],
    });
  });

  it("parses TRUE_FALSE correctly (V → true)", async () => {
    const buf = await buildWorkbook("Vero o Falso", TF_HEADERS, [
      ["La Terra è rotonda", 20, 1000, "N", "V"],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe("TRUE_FALSE");
    expect(questions[0].options).toEqual({ correct: true });
  });

  it("parses OPEN_ANSWER correctly (2 accepted answers, skips empty)", async () => {
    const buf = await buildWorkbook("Risposta Aperta", OA_HEADERS, [
      ["Capitale della Francia?", 30, 1000, "N", "Parigi", "parigi", ""],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe("OPEN_ANSWER");
    expect(questions[0].options).toEqual({
      acceptedAnswers: ["Parigi", "parigi"],
    });
  });

  it("parses ORDERING correctly (3 items, correctOrder=[0,1,2])", async () => {
    const buf = await buildWorkbook("Ordinamento", ORD_HEADERS, [
      ["Ordina i pianeti", 45, 1000, "N", "Mercurio", "Venere", "Terra", "", "", ""],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe("ORDERING");
    expect(questions[0].options).toEqual({
      items: ["Mercurio", "Venere", "Terra"],
      correctOrder: [0, 1, 2],
    });
  });

  it("parses NUMERIC_ESTIMATION correctly (with unit)", async () => {
    const buf = await buildWorkbook("Stima Numerica", NE_HEADERS, [
      ["Abitanti Italia?", 30, 1000, "N", 59, 2, 10, "milioni"],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe("NUMERIC_ESTIMATION");
    expect(questions[0].options).toEqual({
      correctValue: 59,
      tolerance: 2,
      maxRange: 10,
      unit: "milioni",
    });
  });

  it("skips empty rows (no errors, no questions)", async () => {
    const buf = await buildWorkbook("Vero o Falso", TF_HEADERS, [
      ["", "", "", "", ""],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(0);
  });

  it("reports validation errors (TRUE_FALSE with 'X' instead of V/F)", async () => {
    const buf = await buildWorkbook("Vero o Falso", TF_HEADERS, [
      ["Domanda test", 20, 1000, "N", "X"],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(questions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].sheet).toBe("Vero o Falso");
    expect(errors[0].row).toBe(3); // row 1=header, 2=example, 3=data
    expect(errors[0].message).toContain("V");
  });

  it("uses default values when optional fields are empty (timeLimit=30, points=1000, confidenceEnabled=false)", async () => {
    const buf = await buildWorkbook("Vero o Falso", TF_HEADERS, [
      ["Domanda default", "", "", "", "F"],
    ]);
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].timeLimit).toBe(30);
    expect(questions[0].points).toBe(1000);
    expect(questions[0].confidenceEnabled).toBe(false);
  });

  it("assigns sequential order across sheets", async () => {
    // Build a workbook with two sheets
    const wb = new ExcelJS.Workbook();

    const tf = wb.addWorksheet("Vero o Falso");
    tf.addRow(TF_HEADERS);
    tf.addRow([]); // example row
    tf.addRow(["Domanda 1", 20, 1000, "N", "V"]);

    const oa = wb.addWorksheet("Risposta Aperta");
    oa.addRow(OA_HEADERS);
    oa.addRow([]); // example row
    oa.addRow(["Domanda 2", 30, 1000, "N", "risposta", "", ""]);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const { questions, errors } = await parseExcelQuiz(buf);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(2);
    expect(questions[0].order).toBe(0);
    expect(questions[1].order).toBe(1);
  });
});
