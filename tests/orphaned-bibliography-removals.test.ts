import assert from "node:assert/strict";
import test from "node:test";
import { buildOrphanedBibliographyRemovals } from "../lib/citations/orphaned-bibliography-removals.ts";

const reference = {
  doi: "10.1234/not-a-real-doi",
  id: 10,
  rawReference: "Smith, J. (2020). Unsupported article. Journal of Errors, 2(1), 1–5.",
  verificationStatus: "invalid_doi",
};

test("removes an invalid DOI entry only when every linked citation was removed", () => {
  const removals = buildOrphanedBibliographyRemovals([reference], [{ citationText: "(Smith, 2020)", referenceId: 10 }], ["(Smith, 2020)"]);
  assert.deepEqual(removals, [{ originalText: reference.rawReference, referenceId: 10 }]);
});

test("preserves a plausible source without a DOI", () => {
  const removals = buildOrphanedBibliographyRemovals([{ ...reference, doi: null }], [{ citationText: "(Smith, 2020)", referenceId: 10 }], ["(Smith, 2020)"]);
  assert.deepEqual(removals, []);
});

test("preserves a DOI reference when a citation remains in the manuscript", () => {
  const removals = buildOrphanedBibliographyRemovals([reference], [{ citationText: "(Smith, 2020)", referenceId: 10 }, { citationText: "Smith (2020)", referenceId: 10 }], ["(Smith, 2020)"]);
  assert.deepEqual(removals, []);
});
