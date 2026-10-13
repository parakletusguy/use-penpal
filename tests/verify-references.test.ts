import assert from "node:assert/strict";
import test from "node:test";
import { assessReferenceCandidates, parseReferences, type Candidate, type ParsedReference } from "../lib/citations/verify-references.ts";

const reference: ParsedReference = {
  citationCount: 0,
  doi: "10.1234/example.1",
  firstAuthor: "Smith",
  order: 1,
  publicationYear: 2024,
  rawReference: "Smith, J. (2024). A careful study of reliable metadata. Journal of Records. https://doi.org/10.1234/example.1",
  sourceLocator: { line: 1 },
  title: "A careful study of reliable metadata",
};

function candidate(overrides: Partial<Candidate["metadata"]> = {}): Candidate {
  return {
    id: "10.1234/example.1",
    lookupType: "doi",
    metadata: {
      containerTitle: "Journal of Records",
      doi: "10.1234/example.1",
      firstAuthor: "Smith",
      publicationYear: 2024,
      title: "A careful study of reliable metadata",
      ...overrides,
    },
    provider: "crossref",
    providerUrl: "https://doi.org/10.1234/example.1",
  };
}

test("verifies only an exact DOI with matching reference metadata", () => {
  const result = assessReferenceCandidates(reference, [candidate()]);
  assert.equal(result.status, "verified");
  assert.equal(result.candidateCount, 1);
});

test("does not verify an exact DOI when the supplied title conflicts", () => {
  const result = assessReferenceCandidates(reference, [candidate({ title: "An unrelated work" })]);
  assert.equal(result.status, "ambiguous_match");
});

test("records ambiguity when distinct candidates are similarly plausible", () => {
  const alternate = candidate({ doi: "10.1234/example.2" });
  alternate.id = "10.1234/example.2";
  const result = assessReferenceCandidates({ ...reference, doi: null }, [candidate(), alternate]);
  assert.equal(result.status, "ambiguous_match");
  assert.equal(result.candidateCount, 2);
  assert.equal(result.runnerUpConfidence, result.confidence);
});

test("requires title, author, and year agreement for references without a DOI", () => {
  const result = assessReferenceCandidates({ ...reference, doi: null }, [candidate({ publicationYear: 2023 })]);
  assert.equal(result.status, "ambiguous_match");
});

test("repairs collapsed bibliography entries without inventing bibliographic content", () => {
  const parsed = parseReferences(`References\nMelgosa, J., & Melgosa, A. (2005). Short-term and medium-term consequences of divorce. Journal of Family Issues, 26(4), 522–540. https://doi.org/10.1111/j.1741-3737.2005.00223.x O’Connell Corcoran, M. (1997). Emotional divorce and psychological separation. Journal of Marriage and Family Therapy, 23(3), 275–289. https://doi.org/10.1111/j.1752-0606.1997.tb00201.x`);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.firstAuthor, "Melgosa");
  assert.equal(parsed[1]?.firstAuthor, "O’Connell");
  assert.equal(parsed[1]?.publicationYear, 1997);
});
