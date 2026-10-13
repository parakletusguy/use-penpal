import assert from "node:assert/strict";
import test from "node:test";
import { buildCitationRemediationPacket, citationRemediationSummary, type CitationRemediationPacket } from "../lib/citations/remediation-plan.ts";

const packet: CitationRemediationPacket = {
  attentionReferenceCount: 1,
  citationCount: 2,
  citations: [{ citationText: "(Smith, 2024)", reconciliationStatus: "missing_reference", sourceLocator: { end: 42, start: 29 } }],
  manuscriptTitle: "Example manuscript",
  referenceCount: 1,
  references: [{ citationCount: 1, rawReference: "Jones, R. (2023). Incomplete study.", referenceOrder: 1, verificationReason: "No uniquely matching source record was found.", verificationStatus: "unlocatable" }],
  verifiedReferenceCount: 0,
};

test("creates source-specific author queries without proposing a replacement", () => {
  const output = buildCitationRemediationPacket(packet);
  assert.match(output, /Jones, R\. \(2023\)\. Incomplete study\./);
  assert.match(output, /\(Smith, 2024\)/);
  assert.match(output, /authoritative, complete reference entry/);
  assert.doesNotMatch(output, /Suggested replacement/);
});

test("flags a missing reference list as a structural author query", () => {
  const structuralPacket = { ...packet, referenceCount: 0, references: [] };
  const summary = citationRemediationSummary(structuralPacket);
  assert.equal(summary.needsReferenceListRepair, true);
  assert.match(buildCitationRemediationPacket(structuralPacket), /reference-list structure/);
});
