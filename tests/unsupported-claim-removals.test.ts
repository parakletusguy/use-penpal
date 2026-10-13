import assert from "node:assert/strict";
import test from "node:test";
import { buildUnsupportedClaimRemovals } from "../lib/citations/unsupported-claim-removals.ts";

test("removes a complete citation-dependent sentence once when several unresolved citations share it", () => {
  const text = "The evidence indicates that family disruption is associated with distress (Smith, 2020; Doe, 2021). The study used a descriptive design.";
  const removals = buildUnsupportedClaimRemovals(text, [
    { citationText: "(Smith, 2020; Doe, 2021)", sourceLocator: { end: 97, start: 73 } },
    { citationText: "(Smith, 2020; Doe, 2021)", sourceLocator: { end: 97, start: 73 } },
  ]);
  assert.equal(removals.length, 1);
  assert.equal(removals[0]?.originalText, "The evidence indicates that family disruption is associated with distress (Smith, 2020; Doe, 2021).");
  assert.equal(removals[0]?.citationTexts.length, 2);
});

test("does not create a deletion for an invalid citation location", () => {
  assert.deepEqual(buildUnsupportedClaimRemovals("A sentence with a citation (Smith, 2020).", [{ citationText: "(Smith, 2020)", sourceLocator: { end: 500, start: 490 } }]), []);
});
