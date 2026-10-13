type CitationLocation = { end: number; start: number };

export type UnsupportedCitation = {
  citationText: string;
  sourceLocator: CitationLocation | null;
};

export type UnsupportedClaimRemoval = {
  citationTexts: string[];
  originalText: string;
  sourceLocators: CitationLocation[];
};

function sentenceAt(text: string, location: CitationLocation) {
  if (location.start < 0 || location.end < location.start || location.end > text.length) return null;
  const before = text.slice(0, location.start);
  const after = text.slice(location.end);
  const sentenceStart = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?")) + 1;
  const ending = after.search(/[.!?](?:\s|$)/);
  const sentenceEnd = ending === -1 ? text.indexOf("\n", location.end) : location.end + ending + 1;
  const value = text.slice(sentenceStart, sentenceEnd === -1 ? text.length : sentenceEnd).replace(/\s+/g, " ").trim();
  // A Word replacement cannot safely cross a paragraph boundary. Very short text is
  // usually a bare citation, not a claim that can be removed usefully.
  return value.length >= 25 && value.length <= 1_800 && !value.includes("\n") ? value : null;
}

function normalise(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildUnsupportedClaimRemovals(manuscriptText: string, citations: UnsupportedCitation[]) {
  const removals = new Map<string, UnsupportedClaimRemoval>();
  for (const citation of citations) {
    if (!citation.sourceLocator) continue;
    const originalText = sentenceAt(manuscriptText, citation.sourceLocator);
    if (!originalText) continue;
    const key = normalise(originalText);
    const current = removals.get(key);
    if (current) {
      current.citationTexts.push(citation.citationText);
      current.sourceLocators.push(citation.sourceLocator);
    } else {
      removals.set(key, {
        citationTexts: [citation.citationText],
        originalText,
        sourceLocators: [citation.sourceLocator],
      });
    }
  }
  return [...removals.values()];
}
