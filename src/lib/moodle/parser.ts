import type { QuestionInput } from "@/lib/validators/quiz";

export interface MoodleParseError {
  question: number;
  message: string;
}

export interface MoodleParseResult {
  questions: QuestionInput[];
  errors: MoodleParseError[];
  skipped: { type: string; count: number }[];
}

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Simple XML tag content extractor (no dependencies) */
function getTagContent(xml: string, tag: string): string | null {
  // Handle CDATA sections
  const cdataRe = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1];

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

/** Get attribute value from an XML tag */
function getAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}\\s*=\\s*"([^"]*)"`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

/** Get the full raw block for a tag (including the tag itself) */
function getTagBlock(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[0] : null;
}

/** Get all matching tag blocks */
function getAllTags(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  let match;
  while ((match = re.exec(xml)) !== null) {
    results.push(match[0]);
  }
  return results;
}

/** Build a map of filename → data URI from <file> tags in a questiontext block */
function buildFileMap(questiontextBlock: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<file\s+name="([^"]+)"[^>]*encoding="base64"[^>]*>([^<]+)<\/file>/gi;
  let m;
  while ((m = re.exec(questiontextBlock)) !== null) {
    const name = m[1];
    const base64 = m[2].trim();
    const ext = name.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "gif" ? "image/gif"
      : ext === "svg" ? "image/svg+xml"
      : "image/png";
    map.set(name, `data:${mime};base64,${base64}`);
  }
  return map;
}

/** Replace @@PLUGINFILE@@/filename references with data URIs */
function resolvePluginFiles(html: string, fileMap: Map<string, string>): string {
  return html.replace(/@@PLUGINFILE@@\/([^"'\s]+)/g, (_, filename) => {
    return fileMap.get(decodeURIComponent(filename)) ?? `@@PLUGINFILE@@/${filename}`;
  });
}

/** Extract the first valid image URL from HTML content */
function extractImageUrl(html: string): string | null {
  const match = html.match(/<img[^>]+src\s*=\s*"([^"]+)"/i);
  if (!match) return null;
  const url = match[1];
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return null;
}

/** Extract question text and optional image from Moodle XML question block */
function getQuestionTextAndImage(questionXml: string): { text: string; mediaUrl: string | null } {
  // Use the full questiontext block (not just CDATA) to find <file> tags
  const questiontextBlock = getTagBlock(questionXml, "questiontext");
  if (!questiontextBlock) return { text: "", mediaUrl: null };
  const rawText = getTagContent(questiontextBlock, "text");
  if (!rawText) return { text: "", mediaUrl: null };

  // Resolve @@PLUGINFILE@@ references to data URIs
  const fileMap = buildFileMap(questiontextBlock);
  const resolvedHtml = fileMap.size > 0 ? resolvePluginFiles(rawText, fileMap) : rawText;

  const mediaUrl = extractImageUrl(resolvedHtml);
  const text = stripHtml(resolvedHtml);
  return { text, mediaUrl };
}

/** Parse a multichoice question */
function parseMultichoice(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const { text, mediaUrl } = getQuestionTextAndImage(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  if (answerBlocks.length < 2) {
    errors.push({ question: index, message: "Multiple choice needs at least 2 answers" });
    return null;
  }

  const choices = answerBlocks.map((a) => {
    const fraction = getAttr(a, "answer", "fraction");
    const ansText = getTagContent(a, "text");
    return {
      text: ansText ? stripHtml(ansText) : "",
      isCorrect: fraction !== null && parseFloat(fraction) > 0,
    };
  }).filter((c) => c.text);

  if (!choices.some((c) => c.isCorrect)) {
    errors.push({ question: index, message: "No correct answer found" });
    return null;
  }

  return {
    type: "MULTIPLE_CHOICE",
    text,
    mediaUrl,
    timeLimit: 30,
    points: 1000,
    confidenceEnabled: false,
    options: { choices },
  };
}

/** Parse a truefalse question */
function parseTrueFalse(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const { text, mediaUrl } = getQuestionTextAndImage(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  let correct = true;

  for (const a of answerBlocks) {
    const fraction = getAttr(a, "answer", "fraction");
    const ansText = getTagContent(a, "text");
    if (fraction && parseFloat(fraction) === 100 && ansText) {
      correct = stripHtml(ansText).toLowerCase() === "true";
    }
  }

  return {
    type: "TRUE_FALSE",
    text,
    mediaUrl,
    timeLimit: 20,
    points: 1000,
    confidenceEnabled: false,
    options: { correct },
  };
}

/** Parse a shortanswer question */
function parseShortAnswer(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const { text, mediaUrl } = getQuestionTextAndImage(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  const acceptedAnswers: string[] = [];

  for (const a of answerBlocks) {
    const fraction = getAttr(a, "answer", "fraction");
    if (fraction && parseFloat(fraction) > 0) {
      const ansText = getTagContent(a, "text");
      if (ansText) acceptedAnswers.push(stripHtml(ansText));
    }
  }

  if (acceptedAnswers.length === 0) {
    errors.push({ question: index, message: "No accepted answers found" });
    return null;
  }

  return {
    type: "OPEN_ANSWER",
    text,
    mediaUrl,
    timeLimit: 30,
    points: 1000,
    confidenceEnabled: false,
    options: { acceptedAnswers },
  };
}

/** Parse a matching question */
function parseMatching(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const { text, mediaUrl } = getQuestionTextAndImage(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const subquestions = getAllTags(xml, "subquestion");
  const pairs: { left: string; right: string }[] = [];

  for (const sq of subquestions) {
    const sqText = getTagContent(sq, "text");
    const answer = getTagContent(sq, "answer");
    if (sqText && answer) {
      const left = stripHtml(sqText);
      // answer tag inside subquestion contains another text tag
      const rightText = getTagContent(answer, "text");
      const right = rightText ? stripHtml(rightText) : stripHtml(answer);
      if (left && right) {
        pairs.push({ left, right });
      }
    }
  }

  if (pairs.length < 2) {
    errors.push({ question: index, message: "Matching needs at least 2 pairs" });
    return null;
  }

  return {
    type: "MATCHING",
    text,
    mediaUrl,
    timeLimit: 45,
    points: 1000,
    confidenceEnabled: false,
    options: { pairs },
  };
}

/** Parse a numerical question */
function parseNumerical(
  xml: string,
  index: number,
  errors: MoodleParseError[]
): Omit<QuestionInput, "order"> | null {
  const { text, mediaUrl } = getQuestionTextAndImage(xml);
  if (!text) {
    errors.push({ question: index, message: "Missing question text" });
    return null;
  }

  const answerBlocks = getAllTags(xml, "answer");
  let correctValue: number | undefined;
  let tolerance = 0;

  for (const a of answerBlocks) {
    const fraction = getAttr(a, "answer", "fraction");
    if (fraction && parseFloat(fraction) === 100) {
      const ansText = getTagContent(a, "text");
      if (ansText) correctValue = parseFloat(stripHtml(ansText));
      const tolTag = getTagContent(a, "tolerance");
      if (tolTag) tolerance = parseFloat(tolTag);
    }
  }

  if (correctValue === undefined || isNaN(correctValue)) {
    errors.push({ question: index, message: "Missing correct numeric value" });
    return null;
  }

  return {
    type: "NUMERIC_ESTIMATION",
    text,
    mediaUrl,
    timeLimit: 30,
    points: 1000,
    confidenceEnabled: false,
    options: {
      correctValue,
      tolerance,
      maxRange: tolerance * 3 || 10,
    },
  };
}

/** Parse a Moodle XML string into SAVINT questions */
export function parseMoodleXml(xmlString: string): MoodleParseResult {
  const questions: QuestionInput[] = [];
  const errors: MoodleParseError[] = [];
  const skippedMap = new Map<string, number>();
  let order = 0;

  // Extract all <question> blocks
  const questionBlocks = getAllTags(xmlString, "question");

  for (let i = 0; i < questionBlocks.length; i++) {
    const block = questionBlocks[i];
    const type = getAttr(block, "question", "type");

    if (!type || type === "category") continue;

    let parsed: Omit<QuestionInput, "order"> | null = null;

    switch (type) {
      case "multichoice":
        parsed = parseMultichoice(block, i + 1, errors);
        break;
      case "truefalse":
        parsed = parseTrueFalse(block, i + 1, errors);
        break;
      case "shortanswer":
        parsed = parseShortAnswer(block, i + 1, errors);
        break;
      case "matching":
        parsed = parseMatching(block, i + 1, errors);
        break;
      case "numerical":
        parsed = parseNumerical(block, i + 1, errors);
        break;
      default:
        skippedMap.set(type, (skippedMap.get(type) || 0) + 1);
        break;
    }

    if (parsed) {
      questions.push({ ...parsed, order: order++ } as QuestionInput);
    }
  }

  const skipped = [...skippedMap.entries()].map(([type, count]) => ({
    type,
    count,
  }));

  return { questions, errors, skipped };
}
