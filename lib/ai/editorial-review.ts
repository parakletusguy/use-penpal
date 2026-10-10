export type FindingType = "citation" | "ethical" | "formatting" | "language" | "metadata" | "technical";
export type Severity = "blocking" | "high" | "info" | "warning";
export type SuggestionType = "author_query" | "citation" | "clarity" | "consistency" | "formatting" | "grammar";

export type EditorialFinding = {
  description: string;
  evidenceExcerpt: string;
  findingType: FindingType;
  recommendedAction: string;
  requiresEditorDecision: boolean;
  severity: Severity;
  title: string;
};

export type EditorialSuggestion = {
  originalText: string;
  proposedText: string;
  rationale: string;
  suggestionType: SuggestionType;
};

export type EditorialReview = {
  findings: EditorialFinding[];
  suggestions: EditorialSuggestion[];
  summary: string;
};

const editorialInstructions = `You are PenPal, an editorial assistant for an academic journal editor. Analyse only the manuscript text supplied by the editor.

Your task is limited to technical and editorial preparation: document structure, language, clarity, consistency, citation/reference matching, metadata and ethical disclosure checks. Do not claim that a paper will be accepted, score publication quality, assess scientific novelty, conduct peer review, invent sources, rewrite substantive findings, or alter facts, data, methods, results, or citations.

Every finding must quote an exact evidence excerpt copied from the manuscript. Every edit suggestion must use an exact originalText copied from the manuscript and make a narrow grammar, clarity, formatting, citation, consistency, or author-query change. If a substantive change is needed, use an author_query rather than supplying replacement prose. Keep the review concise, prioritised, and actionable.`;

const findingTypes = new Set<FindingType>(["citation", "ethical", "formatting", "language", "metadata", "technical"]);
const severities = new Set<Severity>(["blocking", "high", "info", "warning"]);
const suggestionTypes = new Set<SuggestionType>(["author_query", "citation", "clarity", "consistency", "formatting", "grammar"]);

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          findingType: { type: "string", enum: [...findingTypes] },
          severity: { type: "string", enum: [...severities] },
          title: { type: "string" },
          description: { type: "string" },
          evidenceExcerpt: { type: "string" },
          recommendedAction: { type: "string" },
          requiresEditorDecision: { type: "boolean" },
        },
        required: ["findingType", "severity", "title", "description", "evidenceExcerpt", "recommendedAction", "requiresEditorDecision"],
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          suggestionType: { type: "string", enum: [...suggestionTypes] },
          originalText: { type: "string" },
          proposedText: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["suggestionType", "originalText", "proposedText", "rationale"],
      },
    },
  },
  required: ["summary", "findings", "suggestions"],
} as const;

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxLength) : null;
}

function parseFinding(value: unknown, manuscriptText: string): EditorialFinding | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const findingType = item.findingType;
  const severity = item.severity;
  const title = stringValue(item.title, 280);
  const description = stringValue(item.description, 3_000);
  const evidenceExcerpt = stringValue(item.evidenceExcerpt, 2_000);
  const recommendedAction = stringValue(item.recommendedAction, 2_000);

  if (
    typeof findingType !== "string" || !findingTypes.has(findingType as FindingType) ||
    typeof severity !== "string" || !severities.has(severity as Severity) ||
    !title || !description || !evidenceExcerpt || !recommendedAction ||
    !manuscriptText.includes(evidenceExcerpt) ||
    typeof item.requiresEditorDecision !== "boolean"
  ) return null;

  return { findingType: findingType as FindingType, severity: severity as Severity, title, description, evidenceExcerpt, recommendedAction, requiresEditorDecision: item.requiresEditorDecision };
}

function parseSuggestion(value: unknown, manuscriptText: string): EditorialSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const suggestionType = item.suggestionType;
  const originalText = stringValue(item.originalText, 2_000);
  const proposedText = stringValue(item.proposedText, 2_000);
  const rationale = stringValue(item.rationale, 1_500);

  if (
    typeof suggestionType !== "string" || !suggestionTypes.has(suggestionType as SuggestionType) ||
    !originalText || !proposedText || !rationale || originalText === proposedText || !manuscriptText.includes(originalText)
  ) return null;

  return { suggestionType: suggestionType as SuggestionType, originalText, proposedText, rationale };
}

function parseReview(value: unknown, manuscriptText: string): EditorialReview {
  if (!value || typeof value !== "object") throw new Error("The model returned an invalid review.");
  const response = value as Record<string, unknown>;
  const summary = stringValue(response.summary, 4_000);
  if (!summary || !Array.isArray(response.findings) || !Array.isArray(response.suggestions)) {
    throw new Error("The model returned an incomplete review.");
  }

  return {
    summary,
    findings: response.findings.slice(0, 40).flatMap((item) => {
      const parsed = parseFinding(item, manuscriptText);
      return parsed ? [parsed] : [];
    }),
    suggestions: response.suggestions.slice(0, 60).flatMap((item) => {
      const parsed = parseSuggestion(item, manuscriptText);
      return parsed ? [parsed] : [];
    }),
  };
}

function readOpenAiOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as Record<string, unknown>).output;
  if (!Array.isArray(output)) return null;

  const text = output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];

    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const value = part as Record<string, unknown>;
      return value.type === "output_text" && typeof value.text === "string" ? [value.text] : [];
    });
  }).join("\n").trim();

  return text || null;
}

function readOpenAiErrorDetails(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return {};

  const details = error as Record<string, unknown>;
  return {
    code: typeof details.code === "string" ? details.code : undefined,
    type: typeof details.type === "string" ? details.type : undefined,
  };
}

export async function createEditorialReview(manuscriptText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) throw new Error("OpenAI is not configured.");

  const limitedText = manuscriptText.slice(0, 120_000);
  const input = `MANUSCRIPT START
${limitedText}
MANUSCRIPT END`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input,
      instructions: editorialInstructions,
      max_output_tokens: 8_000,
      model,
      store: false,
      text: {
        format: {
          name: "penpal_editorial_review",
          schema: responseSchema,
          strict: true,
          type: "json_schema",
        },
      },
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const errorPayload: unknown = await response.json().catch(() => null);
    const errorDetails = readOpenAiErrorDetails(errorPayload);
    console.error("OpenAI editorial review request failed.", {
      status: response.status,
      ...errorDetails,
    });
    if (response.status === 429 && errorDetails.code === "credit_balance_exhausted") {
      throw new Error("OpenAI API credit balance is exhausted. Add API credits, then try the review again.");
    }
    throw new Error("OpenAI could not generate a review.");
  }
  const payload: unknown = await response.json();
  const outputText = readOpenAiOutputText(payload);
  if (!outputText) throw new Error("OpenAI returned no usable review.");

  try {
    return parseReview(JSON.parse(outputText), limitedText);
  } catch {
    throw new Error("OpenAI returned a review that PenPal could not validate.");
  }
}
