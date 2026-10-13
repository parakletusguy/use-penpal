import { findReferenceCandidates, rankReferenceCandidates, type ParsedReference } from "../citations/verify-references.ts";

type SourceReference = ParsedReference & { referenceId: number };

type CandidateForModel = {
  index: number;
  metadata: {
    containerTitle: string | null;
    doi: string | null;
    firstAuthor: string | null;
    publicationYear: number | null;
    title: string | null;
  };
  provider: "crossref" | "openalex";
  providerUrl: string | null;
  score: number;
};

type ModelProposal = {
  formattedReference: string;
  modelConfidence: number;
  rationale: string;
  recommendation: "propose" | "abstain";
  referenceOrder: number;
  selectedCandidateIndex: number | null;
};

export type CitationProposal = {
  autoApplyEligible: boolean;
  candidate: CandidateForModel;
  formattedReference: string;
  modelConfidence: number;
  rationale: string;
  referenceId: number;
  referenceOrder: number;
  sourceReference: string;
};

function normalise(value: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string" && root.output_text.trim()) return root.output_text.trim();
  if (!Array.isArray(root.output)) return null;
  return root.output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const value = part as Record<string, unknown>;
      return value.type === "output_text" && typeof value.text === "string" ? [value.text] : [];
    });
  }).join("\n").trim() || null;
}

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function decimal(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

const proposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          referenceOrder: { type: "integer" },
          recommendation: { type: "string", enum: ["propose", "abstain"] },
          selectedCandidateIndex: { anyOf: [{ type: "integer" }, { type: "null" }] },
          modelConfidence: { type: "number" },
          formattedReference: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["referenceOrder", "recommendation", "selectedCandidateIndex", "modelConfidence", "formattedReference", "rationale"],
      },
    },
  },
  required: ["proposals"],
} as const;

function buildModelInput(references: Array<{ reference: SourceReference; candidates: CandidateForModel[] }>) {
  return {
    references: references.map(({ reference, candidates }) => ({
      candidates,
      parsedReference: {
        doi: reference.doi,
        firstAuthor: reference.firstAuthor,
        publicationYear: reference.publicationYear,
        rawReference: reference.rawReference,
        title: reference.title,
      },
      referenceOrder: reference.order,
    })),
  };
}

async function askModel(references: Array<{ reference: SourceReference; candidates: CandidateForModel[] }>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: process.env.OPENAI_CITATION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      store: false,
      max_output_tokens: 5_000,
      instructions: "You are a bibliographic adjudication assistant. You may select only an explicitly supplied candidate record. Never infer a missing title, author, year, DOI, publisher, volume, issue, pages, or URL. For each reference, return propose only when one candidate is the strongest bibliographic match. Otherwise abstain. When proposing, format the selected candidate as a complete, neutral journal reference using only its supplied fields; omit unavailable fields. The rationale must name the matching fields and any uncertainty. This is a proposal for editor review, never an automatic approval.",
      input: JSON.stringify(buildModelInput(references)),
      text: { format: { type: "json_schema", name: "citation_candidate_proposals", strict: true, schema: proposalSchema } },
    }),
  });
  if (!response.ok) throw new Error("OpenAI could not assess the source candidates.");
  const output = readOutputText(await response.json() as unknown);
  if (!output) throw new Error("OpenAI returned no usable citation proposals.");
  try {
    return JSON.parse(output) as { proposals?: unknown };
  } catch {
    throw new Error("OpenAI returned invalid citation proposals.");
  }
}

function validateModelProposal(value: unknown): ModelProposal | null {
  if (!value || typeof value !== "object") return null;
  const proposal = value as Record<string, unknown>;
  const referenceOrder = typeof proposal.referenceOrder === "number" && Number.isSafeInteger(proposal.referenceOrder)
    ? proposal.referenceOrder
    : null;
  const recommendation = proposal.recommendation;
  const selectedCandidateIndex = proposal.selectedCandidateIndex === null
    ? null
    : typeof proposal.selectedCandidateIndex === "number" && Number.isSafeInteger(proposal.selectedCandidateIndex)
      ? proposal.selectedCandidateIndex
      : undefined;
  const modelConfidence = decimal(proposal.modelConfidence);
  const formattedReference = stringValue(proposal.formattedReference, 2_000);
  const rationale = stringValue(proposal.rationale, 1_500);
  if (!referenceOrder || selectedCandidateIndex === undefined || (recommendation !== "propose" && recommendation !== "abstain") || modelConfidence === null || !formattedReference || !rationale) return null;
  if (recommendation === "propose" && (!selectedCandidateIndex || selectedCandidateIndex < 1)) return null;
  if (recommendation === "abstain" && selectedCandidateIndex !== null) return null;
  return { formattedReference, modelConfidence, rationale, recommendation, referenceOrder, selectedCandidateIndex };
}

function supportsFormattedReference(formattedReference: string, candidate: CandidateForModel) {
  const rendered = normalise(formattedReference);
  const title = normalise(candidate.metadata.title);
  const author = normalise(candidate.metadata.firstAuthor);
  const year = candidate.metadata.publicationYear ? String(candidate.metadata.publicationYear) : null;
  const doi = normalise(candidate.metadata.doi);
  return Boolean(title && rendered.includes(title) && author && rendered.includes(author) && year && rendered.includes(year) && (!doi || rendered.includes(doi)));
}

function isAutoApplyEligible(reference: SourceReference, candidate: CandidateForModel, modelConfidence: number) {
  return candidate.score >= 0.93
    && modelConfidence >= 0.93
    && Boolean(reference.doi && candidate.metadata.doi && normalise(reference.doi) === normalise(candidate.metadata.doi));
}

export async function createCitationProposals(references: SourceReference[]): Promise<CitationProposal[]> {
  const candidatesByReference = await Promise.all(references.map(async (reference) => {
    const candidates = rankReferenceCandidates(reference, await findReferenceCandidates(reference))
      .slice(0, 5)
      .map((candidate, index) => ({
        index: index + 1,
        metadata: candidate.metadata,
        provider: candidate.provider,
        providerUrl: candidate.providerUrl,
        score: Number(candidate.score.confidence.toFixed(3)),
      }));
    return { candidates, reference };
  }));
  const proposed: CitationProposal[] = [];

  for (let offset = 0; offset < candidatesByReference.length; offset += 8) {
    const batch = candidatesByReference.slice(offset, offset + 8).filter((item) => item.candidates.length);
    if (!batch.length) continue;
    const response = await askModel(batch);
    const responseItems = Array.isArray(response.proposals) ? response.proposals : [];
    const byOrder = new Map(batch.map((item) => [item.reference.order, item]));
    for (const rawProposal of responseItems) {
      const proposal = validateModelProposal(rawProposal);
      if (!proposal || proposal.recommendation !== "propose" || !proposal.selectedCandidateIndex) continue;
      const item = byOrder.get(proposal.referenceOrder);
      const candidate = item?.candidates.find((current) => current.index === proposal.selectedCandidateIndex);
      if (!item || !candidate || !supportsFormattedReference(proposal.formattedReference, candidate)) continue;
      proposed.push({
        autoApplyEligible: isAutoApplyEligible(item.reference, candidate, proposal.modelConfidence),
        candidate,
        formattedReference: proposal.formattedReference,
        modelConfidence: proposal.modelConfidence,
        rationale: proposal.rationale,
        referenceId: item.reference.referenceId,
        referenceOrder: item.reference.order,
        sourceReference: item.reference.rawReference,
      });
    }
  }

  return proposed;
}
