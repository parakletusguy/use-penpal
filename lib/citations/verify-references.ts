import { createHash } from "node:crypto";

export type VerificationStatus =
  | "verified"
  | "verified_with_minor_metadata_difference"
  | "ambiguous_match"
  | "unlocatable"
  | "invalid_doi";

export type CitationReconciliationStatus = "matched" | "ambiguous" | "missing_reference" | "manual_review";

export type ParsedReference = {
  citationCount: number;
  doi: string | null;
  firstAuthor: string | null;
  order: number;
  publicationYear: number | null;
  rawReference: string;
  sourceLocator: { line: number };
  title: string | null;
};

export type CitationOccurrence = {
  citedAuthor: string | null;
  citedYear: number | null;
  citationText: string;
  reconciliationStatus: CitationReconciliationStatus;
  referenceOrder: number | null;
  sourceLocator: { end: number; start: number };
};

type Provider = "crossref" | "openalex";
type LookupType = "doi" | "bibliographic" | "title";

type ProviderMetadata = {
  authors: string[];
  containerTitle: string | null;
  doi: string | null;
  firstAuthor: string | null;
  issue: string | null;
  page: string | null;
  publicationYear: number | null;
  title: string | null;
  volume: string | null;
};

export type Candidate = {
  id: string | null;
  lookupType: LookupType;
  metadata: ProviderMetadata;
  provider: Provider;
  providerUrl: string | null;
};

export type ReferenceVerification = {
  confidence: number;
  matchedFields: Record<string, boolean | number | null>;
  provider: Provider;
  providerUrl: string | null;
  providerWorkId: string | null;
  receivedMetadata: ProviderMetadata;
  referenceOrder: number;
  requestFingerprint: string;
  status: VerificationStatus;
  statusReason: string;
  lookupType: LookupType;
};

export type CandidateAssessment = {
  candidate: Candidate | null;
  candidateCount: number;
  confidence: number;
  matchedFields: Record<string, boolean | number | null>;
  runnerUpConfidence: number | null;
  status: VerificationStatus;
  statusReason: string;
};

export type CitationVerificationResult = {
  citations: CitationOccurrence[];
  references: Array<ParsedReference & {
    verificationReason: string;
    verificationStatus: VerificationStatus;
  }>;
  verifications: ReferenceVerification[];
};

const DOI_PATTERN = /(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[\-._;()/:A-Z0-9]+)(?=[\s)>\]}.;,]|$)/i;
const PARENTHETICAL_CITATION_PATTERN = /\(([^()]{1,320}?(?:19|20)\d{2}[a-z]?[^()]*)\)/gi;
const NARRATIVE_CITATION_PATTERN = /\b([A-Z][A-Za-z'’\-]{1,80})\s*\((19|20)(\d{2})[a-z]?\)/g;
const REFERENCE_HEADING_PATTERN = /(?:^|\n)\s*(?:references|reference\s+list|works\s+cited|bibliography)\s*(?:\n|$)/i;
// This deliberately requires a name followed closely by a year. It recognizes compound
// surnames (for example, “O’Connell Corcoran”) that the earlier, comma-only matcher
// treated as continuations of the preceding entry.
const REFERENCE_START_PATTERN = /^(?:\[?\d+[.)\]]?\s+)?\p{Lu}[\p{L}'’\-]*(?:\s+\p{Lu}[\p{L}'’\-]*){0,4},\s*[\s\S]{0,120}?\(?\s*(?:19|20)\d{2}[a-z]?\s*\)?/u;
const INLINE_REFERENCE_START = /(?:^|\s)(\p{Lu}[\p{L}'\-]*(?:\s+\p{Lu}[\p{L}'\-]*){0,3},\s*(?:[A-Z]\.\s*)+\(\s*(?:19|20)\d{2}[a-z]?\s*\))/gu;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalise(value: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDoi(value: string | null) {
  if (!value) return null;
  const match = value.match(DOI_PATTERN);
  return match?.[1]?.replace(/[.,;]+$/, "").toLowerCase() ?? null;
}

function parseYear(value: string) {
  const match = value.match(/(?:^|[^\d])((?:19|20)\d{2})[a-z]?(?:[^\d]|$)/);
  return match ? Number(match[1]) : null;
}

function firstAuthor(value: string, publicationYear: number | null) {
  const beforeYear = publicationYear ? value.slice(0, Math.max(0, value.indexOf(String(publicationYear)))) : value;
  const match = beforeYear.match(/\p{Lu}[\p{L}'’\-]{1,80}/u);
  return match?.[0] ?? null;
}

function inferTitle(value: string, publicationYear: number | null, doi: string | null) {
  const start = publicationYear ? value.indexOf(String(publicationYear)) + 4 : 0;
  const tail = value.slice(Math.max(0, start)).replace(doi ?? "", "").trim();
  const [candidate] = tail.replace(/^[a-z)?.,\s]+/i, "").split(/\.\s+(?=[A-Z])/);
  const title = candidate?.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim() ?? "";
  return title.length >= 5 ? title : null;
}

function splitCollapsedReferenceEntries(value: string) {
  const starts: number[] = [];
  // Smart quotes are common in Word exports. Replacing them only for boundary
  // detection keeps string offsets intact, so the original reference text is saved.
  const scanValue = value.replace(/[’‘]/g, "'");

  for (const match of scanValue.matchAll(INLINE_REFERENCE_START)) {
    const candidate = match[1];
    if (!candidate || match.index === undefined) continue;
    const start = match.index + match[0].lastIndexOf(candidate);
    if (!start) continue;

    const prefix = scanValue.slice(0, start).trimEnd();
    // A name preceded by “&” is a co-author, not another reference. A collapsed
    // entry must follow a completed sentence or a DOI, both of which can be checked
    // without relying on a model to invent a boundary.
    if (/[&;,]$/.test(prefix)) continue;
    if (!(/[.)\]]$/.test(prefix) || /10\.\d{4,9}\/[\-._;()/:A-Z0-9]+$/i.test(prefix))) continue;
    starts.push(start);
  }

  if (!starts.length) return [value];
  return [value.slice(0, starts[0]), ...starts.map((start, index) => value.slice(start, starts[index + 1]))]
    .map((fragment) => fragment.trim())
    .filter(Boolean);
}

function findReferenceLines(manuscriptText: string) {
  const heading = REFERENCE_HEADING_PATTERN.exec(manuscriptText);
  if (!heading || heading.index === undefined) return [];
  const beforeHeading = manuscriptText.slice(0, heading.index);
  const headingEnd = heading.index + heading[0].length;
  const lines = manuscriptText.slice(headingEnd).split("\n");
  const firstLine = beforeHeading.split("\n").length + 1;
  const entries: Array<{ line: number; value: string }> = [];

  for (const [index, originalLine] of lines.entries()) {
    const value = originalLine.replace(/\s+/g, " ").trim();
    if (!value) continue;

    // DOCX extraction occasionally collapses two bibliography paragraphs into one line.
    // Preserve their source line while splitting only at another author/year fingerprint.
    const fragments = splitCollapsedReferenceEntries(value);
    for (const fragment of fragments) {
      const previous = entries.at(-1);
      if (!previous || REFERENCE_START_PATTERN.test(fragment)) {
        entries.push({ line: firstLine + index + 1, value: fragment });
      } else {
        previous.value = `${previous.value} ${fragment}`;
      }
    }
  }

  return entries;
}

export function parseReferences(manuscriptText: string): ParsedReference[] {
  return findReferenceLines(manuscriptText)
    .map(({ line, value }, index) => {
      const doi = cleanDoi(value);
      const publicationYear = parseYear(value);
      return {
        citationCount: 0,
        doi,
        firstAuthor: firstAuthor(value, publicationYear),
        order: index + 1,
        publicationYear,
        rawReference: value,
        sourceLocator: { line },
        title: inferTitle(value, publicationYear, doi),
      };
    })
    .filter((reference) => reference.rawReference.length >= 16);
}

function tokenSimilarity(left: string | null, right: string | null) {
  const leftTokens = new Set(normalise(left).split(" ").filter((item) => item.length > 2));
  const rightTokens = new Set(normalise(right).split(" ").filter((item) => item.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / new Set([...leftTokens, ...rightTokens]).size;
}

function readCrossrefCandidate(value: unknown, lookupType: LookupType): Candidate | null {
  const root = object(value);
  const message = root ? object(root.message) : null;
  if (!message) return null;
  const titles = Array.isArray(message.title) ? message.title : [];
  const authors = Array.isArray(message.author) ? message.author : [];
  const first = object(authors[0]);
  const authorNames = authors.flatMap((value) => {
    const author = object(value);
    if (!author) return [];
    const family = text(author.family);
    const given = text(author.given);
    const literal = text(author.name);
    if (family && given) return [`${family}, ${given}`];
    return [family ?? literal].filter((name): name is string => Boolean(name));
  });
  const issued = object(message.issued) ?? object(message["published-print"]) ?? object(message["published-online"]);
  const dateParts = issued && Array.isArray(issued["date-parts"]) ? issued["date-parts"] : [];
  const firstDatePart = Array.isArray(dateParts[0]) ? dateParts[0][0] : null;
  const containerTitles = Array.isArray(message["container-title"]) ? message["container-title"] : [];
  const doi = cleanDoi(text(message.DOI));
  const title = text(titles[0]);
  if (!doi && !title) return null;

  return {
    id: doi,
    lookupType,
    metadata: {
      authors: authorNames,
      containerTitle: text(containerTitles[0]),
      doi,
      firstAuthor: first ? text(first.family) : null,
      issue: text(message.issue),
      page: text(message.page),
      publicationYear: typeof firstDatePart === "number" ? firstDatePart : null,
      title,
      volume: text(message.volume),
    },
    provider: "crossref",
    providerUrl: doi ? `https://doi.org/${doi}` : null,
  };
}

function readCrossrefCandidates(value: unknown, lookupType: LookupType) {
  const root = object(value);
  const message = root ? object(root.message) : null;
  const items = message && Array.isArray(message.items) ? message.items : [];
  return items.flatMap((item) => {
    const candidate = readCrossrefCandidate({ message: item }, lookupType);
    return candidate ? [candidate] : [];
  });
}

function readOpenAlexCandidate(value: unknown, itemIndex = 0): Candidate | null {
  const root = object(value);
  const results = root && Array.isArray(root.results) ? root.results : [];
  const item = object(results[itemIndex]);
  if (!item) return null;
  const authorships = Array.isArray(item.authorships) ? item.authorships : [];
  const firstAuthorship = object(authorships[0]);
  const author = firstAuthorship ? object(firstAuthorship.author) : null;
  const location = object(item.primary_location);
  const source = location ? object(location.source) : null;
  const doi = cleanDoi(text(item.doi));
  const title = text(item.title);
  if (!doi && !title) return null;

  return {
    id: text(item.id),
    lookupType: "title",
    metadata: {
      authors: authorships.flatMap((authorship) => {
        const record = object(authorship);
        const recordAuthor = record ? object(record.author) : null;
        const displayName = recordAuthor ? text(recordAuthor.display_name) : null;
        return displayName ? [displayName] : [];
      }),
      containerTitle: source ? text(source.display_name) : null,
      doi,
      firstAuthor: author ? text(author.display_name)?.split(/\s+/).at(-1) ?? null : null,
      issue: text(item.biblio && object(item.biblio)?.issue),
      page: text(item.biblio && object(item.biblio)?.first_page),
      publicationYear: typeof item.publication_year === "number" ? item.publication_year : null,
      title,
      volume: text(item.biblio && object(item.biblio)?.volume),
    },
    provider: "openalex",
    providerUrl: text(item.id),
  };
}

function readOpenAlexCandidates(value: unknown) {
  const root = object(value);
  const results = root && Array.isArray(root.results) ? root.results : [];
  return results.flatMap((_item, index) => {
    const candidate = readOpenAlexCandidate(value, index);
    return candidate ? [candidate] : [];
  });
}

async function fetchJson(url: URL, headers: HeadersInit) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function crossrefHeaders() {
  const mailto = process.env.CROSSREF_MAILTO?.trim();
  return {
    Accept: "application/json",
    "User-Agent": mailto ? `PenPal/0.1 (mailto:${mailto})` : "PenPal/0.1",
  };
}

function candidateKey(candidate: Candidate) {
  return candidate.metadata.doi
    ? `doi:${candidate.metadata.doi}`
    : candidate.id
      ? `${candidate.provider}:${candidate.id}`
      : `${candidate.provider}:${normalise(candidate.metadata.title)}:${candidate.metadata.publicationYear ?? ""}`;
}

function distinctCandidates(candidates: Candidate[]) {
  return [...new Map(candidates.map((candidate) => [candidateKey(candidate), candidate])).values()];
}

export async function findReferenceCandidates(reference: ParsedReference) {
  const headers = crossrefHeaders();
  const candidates: Candidate[] = [];
  if (reference.doi) {
    const doiUrl = new URL(`https://api.crossref.org/works/${encodeURIComponent(reference.doi)}`);
    const byDoi = readCrossrefCandidate(await fetchJson(doiUrl, headers), "doi");
    if (byDoi) candidates.push(byDoi);
  }

  const bibliographicUrl = new URL("https://api.crossref.org/works");
  bibliographicUrl.searchParams.set("query.bibliographic", reference.rawReference.slice(0, 1_200));
  bibliographicUrl.searchParams.set("rows", "5");
  const result = await fetchJson(bibliographicUrl, headers);
  candidates.push(...readCrossrefCandidates(result, "bibliographic"));

  if (reference.title) {
    const openAlexUrl = new URL("https://api.openalex.org/works");
    openAlexUrl.searchParams.set("search.exact", reference.title.slice(0, 500));
    openAlexUrl.searchParams.set("per-page", "5");
    candidates.push(...readOpenAlexCandidates(await fetchJson(openAlexUrl, { Accept: "application/json" })));
  }

  return distinctCandidates(candidates);
}

function fingerprint(reference: ParsedReference) {
  return createHash("sha256").update(reference.rawReference).digest("hex");
}

function scoreCandidate(reference: ParsedReference, candidate: Candidate | null) {
  if (!candidate) return { authorMatch: null, confidence: 0, doiMatch: null, titleSimilarity: 0, yearMatch: null };
  const titleSimilarity = tokenSimilarity(reference.title, candidate.metadata.title);
  const authorMatch = reference.firstAuthor && candidate.metadata.firstAuthor
    ? normalise(reference.firstAuthor) === normalise(candidate.metadata.firstAuthor)
    : null;
  const yearMatch = reference.publicationYear && candidate.metadata.publicationYear
    ? reference.publicationYear === candidate.metadata.publicationYear
    : null;
  const doiMatch = reference.doi && candidate.metadata.doi
    ? reference.doi === candidate.metadata.doi
    : null;
  const confidence = doiMatch === true
    ? Math.max(0.82, 0.82 + titleSimilarity * 0.18)
    : Math.min(1, titleSimilarity * 0.65 + (authorMatch === true ? 0.2 : 0) + (yearMatch === true ? 0.15 : 0));
  return { authorMatch, confidence, doiMatch, titleSimilarity, yearMatch };
}

export type RankedCandidate = Candidate & {
  score: {
    authorMatch: boolean | null;
    confidence: number;
    doiMatch: boolean | null;
    titleSimilarity: number;
    yearMatch: boolean | null;
  };
};

export function rankReferenceCandidates(reference: ParsedReference, candidates: Candidate[]): RankedCandidate[] {
  return distinctCandidates(candidates)
    .map((candidate) => ({ ...candidate, score: scoreCandidate(reference, candidate) }))
    .sort((left, right) => right.score.confidence - left.score.confidence);
}

function matchesRequiredReferenceFields(score: ReturnType<typeof scoreCandidate>, reference: ParsedReference) {
  return (!reference.title || score.titleSimilarity >= 0.72)
    && (!reference.firstAuthor || score.authorMatch === true)
    && (!reference.publicationYear || score.yearMatch === true);
}

function isStrictMatch(reference: ParsedReference, score: ReturnType<typeof scoreCandidate>) {
  if (reference.doi) return score.doiMatch === true && matchesRequiredReferenceFields(score, reference);
  return score.confidence >= 0.9
    && score.titleSimilarity >= 0.9
    && score.authorMatch === true
    && score.yearMatch === true;
}

export function assessReferenceCandidates(reference: ParsedReference, candidates: Candidate[]): CandidateAssessment {
  const scored = rankReferenceCandidates(reference, candidates).map((candidate) => ({ candidate, score: candidate.score }));
  const best = scored[0];
  const runnerUp = scored[1];
  const matchedFields = best
    ? {
      author: best.score.authorMatch,
      doi: best.score.doiMatch,
      titleSimilarity: Number(best.score.titleSimilarity.toFixed(3)),
      year: best.score.yearMatch,
      candidateCount: scored.length,
      runnerUpConfidence: runnerUp ? Number(runnerUp.score.confidence.toFixed(3)) : null,
    }
    : { author: null, doi: null, titleSimilarity: 0, year: null, candidateCount: 0, runnerUpConfidence: null };
  const confidence = best ? Number(best.score.confidence.toFixed(3)) : 0;
  const unique = Boolean(best && (!runnerUp || best.score.confidence - runnerUp.score.confidence >= 0.08));

  if (!best) {
    return {
      candidate: null,
      candidateCount: 0,
      confidence,
      matchedFields,
      runnerUpConfidence: null,
      status: reference.doi ? "invalid_doi" : "unlocatable",
      statusReason: reference.doi
        ? "The supplied DOI did not resolve through the approved metadata providers."
        : "No sufficiently specific bibliographic record was found through the approved metadata providers.",
    };
  }
  if (reference.doi && best.score.doiMatch === false) {
    return {
      candidate: best.candidate,
      candidateCount: scored.length,
      confidence,
      matchedFields,
      runnerUpConfidence: runnerUp ? Number(runnerUp.score.confidence.toFixed(3)) : null,
      status: "invalid_doi",
      statusReason: "The supplied DOI identifies a different work than the supplied reference details.",
    };
  }
  if (isStrictMatch(reference, best.score) && unique) {
    return {
      candidate: best.candidate,
      candidateCount: scored.length,
      confidence,
      matchedFields,
      runnerUpConfidence: runnerUp ? Number(runnerUp.score.confidence.toFixed(3)) : null,
      status: "verified",
      statusReason: "A uniquely identified live record matches the supplied reference metadata. No bibliographic replacement was made.",
    };
  }

  return {
    candidate: best.candidate,
    candidateCount: scored.length,
    confidence,
    matchedFields,
    runnerUpConfidence: runnerUp ? Number(runnerUp.score.confidence.toFixed(3)) : null,
    status: "ambiguous_match",
    statusReason: unique
      ? "A possible live record was found, but it does not meet PenPal's strict metadata-match threshold; no bibliographic replacement was made."
      : "More than one live record is similarly plausible, so this reference requires manual review; no bibliographic replacement was made.",
  };
}

async function verifyReference(reference: ParsedReference): Promise<ReferenceVerification> {
  const assessment = assessReferenceCandidates(reference, await findReferenceCandidates(reference));
  const candidate = assessment.candidate;

  return {
    confidence: assessment.confidence,
    lookupType: candidate?.lookupType ?? (reference.doi ? "doi" : "bibliographic"),
    matchedFields: assessment.matchedFields,
    provider: candidate?.provider ?? "crossref",
    providerUrl: candidate?.providerUrl ?? null,
    providerWorkId: candidate?.id ?? null,
    receivedMetadata: candidate?.metadata ?? {
      authors: [],
      containerTitle: null,
      doi: null,
      firstAuthor: null,
      issue: null,
      page: null,
      publicationYear: null,
      title: null,
      volume: null,
    },
    referenceOrder: reference.order,
    requestFingerprint: fingerprint(reference),
    status: assessment.status,
    statusReason: assessment.statusReason,
  };
}

function parseCitationCandidates(value: string) {
  const candidates = [...value.matchAll(/([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]{1,80})(?:\s+(?:and|&)\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]{1,80})?(?:\s+et al\.)?\s*,?\s*((?:19|20)\d{2})[a-z]?/g)];
  return candidates.map((match) => ({
    citedAuthor: match[1] ?? null,
    citedYear: match[2] ? Number(match[2]) : null,
  }));
}

export function parseCitationOccurrences(manuscriptText: string, references: ParsedReference[]) {
  const referenceHeading = REFERENCE_HEADING_PATTERN.exec(manuscriptText);
  const body = referenceHeading?.index === undefined ? manuscriptText : manuscriptText.slice(0, referenceHeading.index);
  const matches: Array<{ citationText: string; end: number; start: number }> = [];
  const seen = new Set<string>();
  const append = (citationText: string, start: number, end: number) => {
    const key = `${start}:${end}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ citationText, end, start });
    }
  };

  for (const match of body.matchAll(PARENTHETICAL_CITATION_PATTERN)) {
    if (match.index !== undefined) append(match[0], match.index, match.index + match[0].length);
  }
  for (const match of body.matchAll(NARRATIVE_CITATION_PATTERN)) {
    if (match.index !== undefined) append(match[0], match.index, match.index + match[0].length);
  }

  return matches.flatMap(({ citationText, start, end }) => parseCitationCandidates(citationText).flatMap(({ citedAuthor, citedYear }) => {
    if (!citedAuthor || !citedYear) return [];
    const matchedReferences = references.filter((reference) =>
      normalise(reference.firstAuthor) === normalise(citedAuthor) && reference.publicationYear === citedYear,
    );
    const referenceOrder = matchedReferences.length === 1 ? matchedReferences[0].order : null;
    const reconciliationStatus: CitationReconciliationStatus = matchedReferences.length === 1
      ? "matched"
      : matchedReferences.length > 1
        ? "ambiguous"
        : "missing_reference";
    return [{
      citedAuthor,
      citedYear,
      citationText,
      reconciliationStatus,
      referenceOrder,
      sourceLocator: { end, start },
    }];
  }));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const output: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const current = next;
      next += 1;
      output[current] = await work(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

export async function verifyManuscriptReferences(manuscriptText: string): Promise<CitationVerificationResult> {
  const parsedReferences = parseReferences(manuscriptText);
  const verifications = parsedReferences.length ? await mapWithConcurrency(parsedReferences, 3, verifyReference) : [];
  const verificationByOrder = new Map(verifications.map((verification) => [verification.referenceOrder, verification]));
  const citations = parseCitationOccurrences(manuscriptText, parsedReferences);
  const citationCountByOrder = new Map<number, number>();
  for (const citation of citations) {
    if (citation.referenceOrder) citationCountByOrder.set(citation.referenceOrder, (citationCountByOrder.get(citation.referenceOrder) ?? 0) + 1);
  }

  return {
    citations,
    references: parsedReferences.map((reference) => {
      const verification = verificationByOrder.get(reference.order);
      return {
        ...reference,
        citationCount: citationCountByOrder.get(reference.order) ?? 0,
        verificationReason: verification?.statusReason ?? "This reference could not be verified.",
        verificationStatus: verification?.status ?? "unlocatable",
      };
    }),
    verifications,
  };
}
