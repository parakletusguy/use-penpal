import type { EditorialFinding } from "@/lib/ai/editorial-review";

export const IJSDS_TECHNICAL_PROFILE_VERSION = "ijsds-author-guide-2026-10-v2";

type ProfileAssessment = {
  findings: EditorialFinding[];
  summary: string;
};

type ReferenceFingerprint = {
  author: string | null;
  year: number | null;
  yearSuffix: string | null;
};

const ABSTRACT_HEADING = /^\s*(?:\d+(?:\.\d+)*\.?\s+)?abstract\s*$/im;
const KEYWORDS_HEADING = /^\s*key\s*words?\s*[:.]\s*(.+)$/im;
const REFERENCES_HEADING = /^\s*(?:\d+(?:\.\d+)*\.?\s+)?(?:references|bibliography)\s*$/im;
const ACKNOWLEDGEMENTS_HEADING = /^\s*(?:\d+(?:\.\d+)*\.?\s+)?acknowledg(?:e)?ments?\s*$/im;
const NUMBERED_SECTION_HEADING = /^\s*\d+(?:\.\d+)*\.?\s+\S+/m;
const REFERENCE_YEAR = /(?:^|[^\d])((?:19|20)\d{2})([a-z])?(?:[^\d]|$)/i;
const REFERENCE_AUTHOR = /^\s*([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]{1,80})/;

function cleanExcerpt(value: string) {
  return value.trim().slice(0, 240);
}

function documentExcerpt(manuscriptText: string) {
  return cleanExcerpt(manuscriptText.slice(0, 240)) || "Manuscript text";
}

function finding(
  manuscriptText: string,
  options: Omit<EditorialFinding, "evidenceExcerpt"> & { evidenceExcerpt?: string },
): EditorialFinding {
  return {
    ...options,
    evidenceExcerpt: options.evidenceExcerpt ? cleanExcerpt(options.evidenceExcerpt) : documentExcerpt(manuscriptText),
  };
}

function sectionIndex(manuscriptText: string, expression: RegExp) {
  const match = expression.exec(manuscriptText);
  return match?.index ?? -1;
}

function extractAbstract(manuscriptText: string) {
  const match = ABSTRACT_HEADING.exec(manuscriptText);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const following = manuscriptText.slice(start);
  const endCandidates = [
    KEYWORDS_HEADING.exec(following)?.index,
    /^\s*(?:\d+(?:\.\d+)*\.?\s+)?introduction\s*$/im.exec(following)?.index,
  ].filter((value): value is number => typeof value === "number" && value >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : following.length;
  return following.slice(0, end).trim();
}

function extractKeywordCount(manuscriptText: string) {
  const match = KEYWORDS_HEADING.exec(manuscriptText);
  if (!match?.[1]) return null;
  return match[1]
    .split(/[;,]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean).length;
}

function referenceFingerprints(manuscriptText: string): ReferenceFingerprint[] {
  const heading = REFERENCES_HEADING.exec(manuscriptText);
  if (!heading || heading.index === undefined) return [];
  return manuscriptText.slice(heading.index + heading[0].length)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 12)
    .map((line) => {
      const year = REFERENCE_YEAR.exec(line);
      const author = REFERENCE_AUTHOR.exec(line);
      return {
        author: author?.[1]?.toLocaleLowerCase() ?? null,
        year: year?.[1] ? Number(year[1]) : null,
        yearSuffix: year?.[2]?.toLocaleLowerCase() ?? null,
      };
    });
}

function hasAlphabeticalReferenceOrder(references: ReferenceFingerprint[]) {
  const authors = references.map((reference) => reference.author).filter((author): author is string => Boolean(author));
  return authors.every((author, index) => index === 0 || authors[index - 1].localeCompare(author) <= 0);
}

function hasMissingSameYearSuffix(references: ReferenceFingerprint[]) {
  const counts = new Map<string, ReferenceFingerprint[]>();
  for (const reference of references) {
    if (!reference.author || !reference.year) continue;
    const key = `${reference.author}:${reference.year}`;
    counts.set(key, [...(counts.get(key) ?? []), reference]);
  }
  return [...counts.values()].some((group) => group.length > 1 && group.some((reference) => !reference.yearSuffix));
}

export function assessIjsdsTechnicalProfile(manuscriptText: string): ProfileAssessment {
  const findings: EditorialFinding[] = [];
  const abstract = extractAbstract(manuscriptText);
  const keywordCount = extractKeywordCount(manuscriptText);
  const referencesAt = sectionIndex(manuscriptText, REFERENCES_HEADING);
  const acknowledgementsAt = sectionIndex(manuscriptText, ACKNOWLEDGEMENTS_HEADING);

  if (!abstract) {
    findings.push(finding(manuscriptText, {
      description: "The IJSDS author guide requires a concise factual abstract, limited to 200 words.",
      findingType: "technical",
      recommendedAction: "Ask the author to add a concise factual abstract that states the purpose, principal results, and major conclusions, within 200 words.",
      requiresEditorDecision: true,
      severity: "high",
      title: "Abstract heading or content could not be found",
    }));
  } else {
    const words = abstract.match(/\b[\p{L}\p{N}'’-]+\b/gu)?.length ?? 0;
    if (words > 200) {
      findings.push(finding(manuscriptText, {
        description: `The abstract contains ${words} words; the IJSDS author guide sets a maximum of 200 words.`,
        evidenceExcerpt: abstract,
        findingType: "technical",
        recommendedAction: "Ask the author to reduce the abstract to 200 words or fewer without changing the study's claims.",
        requiresEditorDecision: true,
        severity: "warning",
        title: "Abstract exceeds the IJSDS word limit",
      }));
    }
  }

  if (keywordCount === null) {
    findings.push(finding(manuscriptText, {
      description: "The IJSDS author guide asks for keywords immediately after the abstract, with no more than five terms.",
      findingType: "technical",
      recommendedAction: "Ask the author to add up to five specific keywords immediately after the abstract.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Keywords could not be found",
    }));
  } else if (keywordCount > 5) {
    findings.push(finding(manuscriptText, {
      description: `The keyword line contains ${keywordCount} terms; the IJSDS author guide permits a maximum of five.`,
      evidenceExcerpt: KEYWORDS_HEADING.exec(manuscriptText)?.[0] ?? undefined,
      findingType: "technical",
      recommendedAction: "Ask the author to retain no more than five specific keywords.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Too many keywords for the IJSDS profile",
    }));
  }

  if (!NUMBERED_SECTION_HEADING.test(manuscriptText)) {
    findings.push(finding(manuscriptText, {
      description: "The IJSDS author guide asks for clearly defined, numbered sections and subsections (for example, 1, 1.1, 1.1.1).",
      findingType: "formatting",
      recommendedAction: "Ask the author to apply a consistent numbered heading structure; do not infer or rewrite the article structure automatically.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Numbered section structure could not be confirmed",
    }));
  }

  if (referencesAt < 0) {
    findings.push(finding(manuscriptText, {
      description: "A References section could not be found. The IJSDS author guide requires a references list.",
      findingType: "citation",
      recommendedAction: "Ask the author to provide a references section, then run PenPal's reference verification before any citation metadata is changed.",
      requiresEditorDecision: true,
      severity: "high",
      title: "References heading could not be found",
    }));
  }

  if (acknowledgementsAt >= 0 && referencesAt >= 0 && acknowledgementsAt > referencesAt) {
    findings.push(finding(manuscriptText, {
      description: "The IJSDS author guide places acknowledgements, including grant information, before the references section.",
      evidenceExcerpt: manuscriptText.slice(acknowledgementsAt, acknowledgementsAt + 240),
      findingType: "formatting",
      recommendedAction: "Ask the author to move the acknowledgements section before the references; preserve its wording unless the author confirms a substantive change.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Acknowledgements appear after references",
    }));
  }

  const references = referenceFingerprints(manuscriptText);
  if (references.length > 1 && !hasAlphabeticalReferenceOrder(references)) {
    findings.push(finding(manuscriptText, {
      description: "The parsed reference entries do not appear to be arranged alphabetically by first author, as requested by the IJSDS author guide.",
      findingType: "citation",
      recommendedAction: "Ask the editor to confirm the parsed order in Word and, if appropriate, request an author correction. Do not reorder records automatically.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Reference list may not be alphabetically ordered",
    }));
  }

  if (hasMissingSameYearSuffix(references)) {
    findings.push(finding(manuscriptText, {
      description: "The parsed list contains multiple entries with the same first author and year, but at least one entry has no a/b/c year suffix.",
      findingType: "citation",
      recommendedAction: "Confirm whether the entries are distinct works by the same author in the same year, then request matching a/b/c labels in both citations and references if needed.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Same-author, same-year references may need suffixes",
    }));
  }

  const summary = findings.length
    ? `IJSDS technical profile raised ${findings.length} item${findings.length === 1 ? "" : "s"} for editor confirmation. These are submission-preparation checks, not an acceptance decision.`
    : "IJSDS technical profile found no deterministic issues in the checks it can make from extracted text. This is not an acceptance decision or a complete submission check.";
  return { findings, summary };
}
