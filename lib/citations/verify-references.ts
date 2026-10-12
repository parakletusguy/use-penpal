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
  containerTitle: string | null;
  doi: string | null;
  firstAuthor: string | null;
  publicationYear: number | null;
  title: string | null;
};

type Candidate = {
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
const REFERENCE_HEADING_PATTERN = /(?:^|\n)\s*(?:references|bibliography)\s*(?:\n|$)/i;
const REFERENCE_START_PATTERN = /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:,|\s+&|\s+and\s+|\s+[A-Z]\.)[\s\S]{0,220}?(?:19|20)\d{2}[a-z]?/;

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
  const match = beforeYear.match(/[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]{1,80}/);
  return match?.[0] ?? null;
}

function inferTitle(value: string, publicationYear: number | null, doi: string | null) {
  const start = publicationYear ? value.indexOf(String(publicationYear)) + 4 : 0;
  const tail = value.slice(Math.max(0, start)).replace(doi ?? "", "").trim();
  const [candidate] = tail.replace(/^[a-z)?.,\s]+/i, "").split(/\.\s+(?=[A-Z])/);
  const title = candidate?.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim() ?? "";
  return title.length >= 5 ? title : null;
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
    const previous = entries.at(-1);
    if (!previous || REFERENCE_START_PATTERN.test(value)) {
      entries.push({ line: firstLine + index + 1, value });
    } else {
      previous.value = `${previous.value} ${value}`;
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
      containerTitle: text(containerTitles[0]),
      doi,
      firstAuthor: first ? text(first.family) : null,
      publicationYear: typeof firstDatePart === "number" ? firstDatePart : null,
      title,
    },
    provider: "crossref",
    providerUrl: doi ? `https://doi.org/${doi}` : null,
  };
}

function readOpenAlexCandidate(value: unknown): Candidate | null {
  const root = object(value);
  const results = root && Array.isArray(root.results) ? root.results : [];
  const item = object(results[0]);
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
      containerTitle: source ? text(source.display_name) : null,
      doi,
      firstAuthor: author ? text(author.display_name)?.split(/\s+/).at(-1) ?? null : null,
      publicationYear: typeof item.publication_year === "number" ? item.publication_year : null,
      title,
    },
    provider: "openalex",
    providerUrl: text(item.id),
  };
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

async function findCandidate(reference: ParsedReference) {
  const headers = crossrefHeaders();
  if (reference.doi) {
    const doiUrl = new URL(`https://api.crossref.org/works/${encodeURIComponent(reference.doi)}`);
    const byDoi = readCrossrefCandidate(await fetchJson(doiUrl, headers), "doi");
    if (byDoi) return byDoi;
  }

  const bibliographicUrl = new URL("https://api.crossref.org/works");
  bibliographicUrl.searchParams.set("query.bibliographic", reference.rawReference.slice(0, 1_200));
  bibliographicUrl.searchParams.set("rows", "1");
  const result = await fetchJson(bibliographicUrl, headers);
  const root = object(result);
  const message = root ? object(root.message) : null;
  const items = message && Array.isArray(message.items) ? message.items : [];
  const byBibliographic = readCrossrefCandidate({ message: items[0] }, "bibliographic");
  if (byBibliographic) return byBibliographic;

  if (!reference.title) return null;
  const openAlexUrl = new URL("https://api.openalex.org/works");
  openAlexUrl.searchParams.set("search.exact", reference.title.slice(0, 500));
  openAlexUrl.searchParams.set("per-page", "1");
  return readOpenAlexCandidate(await fetchJson(openAlexUrl, { Accept: "application/json" }));
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

async function verifyReference(reference: ParsedReference): Promise<ReferenceVerification> {
  const candidate = await findCandidate(reference);
  const score = scoreCandidate(reference, candidate);
  let status: VerificationStatus;
  let statusReason: string;

  if (!candidate) {
    status = reference.doi ? "invalid_doi" : "unlocatable";
    statusReason = reference.doi
      ? "The supplied DOI did not resolve through the approved metadata providers."
      : "No sufficiently specific bibliographic record was found through the approved metadata providers.";
  } else if (reference.doi && candidate.metadata.doi && score.doiMatch === false) {
    status = "invalid_doi";
    statusReason = "The supplied DOI identifies a different work than the supplied reference details.";
  } else if (score.confidence >= 0.86) {
    status = "verified";
    statusReason = "The supplied reference matches live bibliographic metadata.";
  } else if (score.confidence >= 0.7) {
    status = "verified_with_minor_metadata_difference";
    statusReason = "A likely live record was found, but one or more bibliographic details differ and need an editor check.";
  } else {
    status = "ambiguous_match";
    statusReason = "A possible record was found, but the metadata match is not strong enough to correct automatically.";
  }

  return {
    confidence: Number(score.confidence.toFixed(3)),
    lookupType: candidate?.lookupType ?? (reference.doi ? "doi" : "bibliographic"),
    matchedFields: {
      author: score.authorMatch,
      doi: score.doiMatch,
      titleSimilarity: Number(score.titleSimilarity.toFixed(3)),
      year: score.yearMatch,
    },
    provider: candidate?.provider ?? "crossref",
    providerUrl: candidate?.providerUrl ?? null,
    providerWorkId: candidate?.id ?? null,
    receivedMetadata: candidate?.metadata ?? {
      containerTitle: null,
      doi: null,
      firstAuthor: null,
      publicationYear: null,
      title: null,
    },
    referenceOrder: reference.order,
    requestFingerprint: fingerprint(reference),
    status,
    statusReason,
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
