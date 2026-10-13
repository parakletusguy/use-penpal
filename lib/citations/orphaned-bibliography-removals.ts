export type BibliographyReference = {
  doi: string | null;
  id: number;
  rawReference: string;
  verificationStatus: string;
};

export type LinkedCitation = {
  citationText: string;
  referenceId: number | null;
};

export type OrphanedBibliographyRemoval = {
  originalText: string;
  referenceId: number;
};

function normalise(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Keep non-DOI sources: books, reports, and local publications often have no
 * Crossref/OpenAlex record. A bibliography entry is removed only when its DOI
 * is already unsupported and every parser-linked in-text citation was removed
 * from the revised manuscript under the editor's standing instruction.
 */
export function buildOrphanedBibliographyRemovals(
  references: BibliographyReference[],
  citations: LinkedCitation[],
  removedCitationTexts: Iterable<string>,
) {
  const removed = new Set([...removedCitationTexts].map(normalise));
  const citationsByReference = new Map<number, LinkedCitation[]>();
  for (const citation of citations) {
    if (citation.referenceId === null) continue;
    const linked = citationsByReference.get(citation.referenceId) ?? [];
    linked.push(citation);
    citationsByReference.set(citation.referenceId, linked);
  }

  return references.flatMap<OrphanedBibliographyRemoval>((reference) => {
    if (!reference.doi || !["invalid_doi", "unlocatable"].includes(reference.verificationStatus)) return [];
    const linkedCitations = citationsByReference.get(reference.id) ?? [];
    if (!linkedCitations.length || !linkedCitations.every((citation) => removed.has(normalise(citation.citationText)))) return [];
    return [{ originalText: reference.rawReference, referenceId: reference.id }];
  });
}
