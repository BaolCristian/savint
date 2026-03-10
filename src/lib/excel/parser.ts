import ExcelJS from "exceljs";
import type { QuestionInput } from "@/lib/validators/quiz";

export interface ParseError {
  sheet: string;
  row: number;
  message: string;
}

export interface ParseResult {
  questions: QuestionInput[];
  errors: ParseError[];
}

/** Read a cell value as a trimmed string, or empty string if blank. */
function cellStr(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  if (cell.value === null || cell.value === undefined) return "";
  return String(cell.value).trim();
}

/** Read a cell value as a number, or undefined if not numeric. */
function cellNum(row: ExcelJS.Row, col: number): number | undefined {
  const raw = cellStr(row, col);
  if (raw === "") return undefined;
  const n = Number(raw);
  return isNaN(n) ? undefined : n;
}

/** Parse common columns (1-4) shared by all sheet types. */
function parseCommonColumns(
  row: ExcelJS.Row,
  sheetName: string,
  rowNumber: number,
  errors: ParseError[],
): { text: string; timeLimit: number; points: number; confidenceEnabled: boolean } | null {
  const text = cellStr(row, 1);
  if (!text) return null; // skip empty rows

  const timeLimit = cellNum(row, 2) ?? 30;
  const points = cellNum(row, 3) ?? 1000;
  const confRaw = cellStr(row, 4).toUpperCase();
  const confidenceEnabled = confRaw === "S";

  return { text, timeLimit, points, confidenceEnabled };
}

function parseSceltaMultipla(
  row: ExcelJS.Row,
  rowNumber: number,
  sheetName: string,
  errors: ParseError[],
): Omit<QuestionInput, "order"> | null {
  const common = parseCommonColumns(row, sheetName, rowNumber, errors);
  if (!common) return null;

  // Cols 5-10 = option texts
  const optionTexts: string[] = [];
  for (let col = 5; col <= 10; col++) {
    const val = cellStr(row, col);
    if (val) optionTexts.push(val);
  }

  if (optionTexts.length < 2) {
    errors.push({ sheet: sheetName, row: rowNumber, message: "Servono almeno 2 opzioni" });
    return null;
  }

  // Col 11 = correct indices (1-based, comma-separated)
  const correttaRaw = cellStr(row, 11);
  if (!correttaRaw) {
    errors.push({ sheet: sheetName, row: rowNumber, message: "Colonna 'Corretta' mancante" });
    return null;
  }

  const correctIndices = correttaRaw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  if (correctIndices.length === 0) {
    errors.push({ sheet: sheetName, row: rowNumber, message: "Nessuna risposta corretta indicata" });
    return null;
  }

  const choices = optionTexts.map((text, i) => ({
    text,
    isCorrect: correctIndices.includes(i + 1),
  }));

  if (!choices.some((c) => c.isCorrect)) {
    errors.push({ sheet: sheetName, row: rowNumber, message: "Nessuna risposta corretta valida (indici fuori range)" });
    return null;
  }

  return {
    type: "MULTIPLE_CHOICE",
    text: common.text,
    timeLimit: common.timeLimit,
    points: common.points,
    confidenceEnabled: common.confidenceEnabled,
    options: { choices },
  } as Omit<QuestionInput, "order">;
}

function parseVeroFalso(
  row: ExcelJS.Row,
  rowNumber: number,
  sheetName: string,
  errors: ParseError[],
): Omit<QuestionInput, "order"> | null {
  const common = parseCommonColumns(row, sheetName, rowNumber, errors);
  if (!common) return null;

  const vf = cellStr(row, 5).toUpperCase();
  if (vf !== "V" && vf !== "F") {
    errors.push({ sheet: sheetName, row: rowNumber, message: "Il valore deve essere 'V' o 'F'" });
    return null;
  }

  return {
    type: "TRUE_FALSE",
    text: common.text,
    timeLimit: common.timeLimit,
    points: common.points,
    confidenceEnabled: common.confidenceEnabled,
    options: { correct: vf === "V" },
  } as Omit<QuestionInput, "order">;
}

function parseRispostaAperta(
  row: ExcelJS.Row,
  rowNumber: number,
  sheetName: string,
  errors: ParseError[],
): Omit<QuestionInput, "order"> | null {
  const common = parseCommonColumns(row, sheetName, rowNumber, errors);
  if (!common) return null;

  const answers: string[] = [];
  for (let col = 5; col <= 7; col++) {
    const val = cellStr(row, col);
    if (val) answers.push(val);
  }

  if (answers.length === 0) {
    errors.push({ sheet: sheetName, row: rowNumber, message: "Servono almeno 1 risposta accettata" });
    return null;
  }

  return {
    type: "OPEN_ANSWER",
    text: common.text,
    timeLimit: common.timeLimit,
    points: common.points,
    confidenceEnabled: common.confidenceEnabled,
    options: { acceptedAnswers: answers },
  } as Omit<QuestionInput, "order">;
}

function parseOrdinamento(
  row: ExcelJS.Row,
  rowNumber: number,
  sheetName: string,
  errors: ParseError[],
): Omit<QuestionInput, "order"> | null {
  const common = parseCommonColumns(row, sheetName, rowNumber, errors);
  if (!common) return null;

  const items: string[] = [];
  for (let col = 5; col <= 10; col++) {
    const val = cellStr(row, col);
    if (val) items.push(val);
  }

  if (items.length < 2) {
    errors.push({ sheet: sheetName, row: rowNumber, message: "Servono almeno 2 elementi da ordinare" });
    return null;
  }

  return {
    type: "ORDERING",
    text: common.text,
    timeLimit: common.timeLimit,
    points: common.points,
    confidenceEnabled: common.confidenceEnabled,
    options: {
      items,
      correctOrder: items.map((_, i) => i),
    },
  } as Omit<QuestionInput, "order">;
}

function parseStimaNumerica(
  row: ExcelJS.Row,
  rowNumber: number,
  sheetName: string,
  errors: ParseError[],
): Omit<QuestionInput, "order"> | null {
  const common = parseCommonColumns(row, sheetName, rowNumber, errors);
  if (!common) return null;

  const correctValue = cellNum(row, 5);
  const tolerance = cellNum(row, 6);
  const maxRange = cellNum(row, 7);
  const unit = cellStr(row, 8) || undefined;

  if (correctValue === undefined || tolerance === undefined || maxRange === undefined) {
    errors.push({
      sheet: sheetName,
      row: rowNumber,
      message: "correctValue, tolerance e maxRange sono obbligatori",
    });
    return null;
  }

  return {
    type: "NUMERIC_ESTIMATION",
    text: common.text,
    timeLimit: common.timeLimit,
    points: common.points,
    confidenceEnabled: common.confidenceEnabled,
    options: { correctValue, tolerance, maxRange, ...(unit ? { unit } : {}) },
  } as Omit<QuestionInput, "order">;
}

/** Sheet name → parser function mapping. */
const SHEET_PARSERS: Record<
  string,
  (row: ExcelJS.Row, rowNumber: number, sheetName: string, errors: ParseError[]) => Omit<QuestionInput, "order"> | null
> = {
  "Scelta Multipla": parseSceltaMultipla,
  "Vero o Falso": parseVeroFalso,
  "Risposta Aperta": parseRispostaAperta,
  "Ordinamento": parseOrdinamento,
  "Stima Numerica": parseStimaNumerica,
};

export async function parseExcelQuiz(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const questions: QuestionInput[] = [];
  const errors: ParseError[] = [];
  let order = 0;

  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name;
    const parser = SHEET_PARSERS[sheetName];
    if (!parser) return; // skip unrecognized sheets

    worksheet.eachRow((row, rowNumber) => {
      // Skip row 1 (header) and row 2 (example)
      if (rowNumber <= 2) return;

      const result = parser(row, rowNumber, sheetName, errors);
      if (result) {
        questions.push({ ...result, order: order++ } as QuestionInput);
      }
    });
  });

  return { questions, errors };
}
