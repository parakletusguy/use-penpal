import assert from "node:assert/strict";
import test from "node:test";
import { assessReferenceCandidates, type Candidate, type ParsedReference } from "../lib/citations/verify-references.ts";

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
