import assert from "node:assert/strict";
import test from "node:test";
import { createCitationProposals } from "../lib/ai/citation-proposals.ts";

const reference = {
  citationCount: 1,
  doi: "10.1234/example.1",
  firstAuthor: "Smith",
  order: 1,
  publicationYear: 2024,
  rawReference: "Smith, J. (2024). A careful study of reliable metadata. Journal of Records. https://doi.org/10.1234/example.1",
  referenceId: 42,
  sourceLocator: { line: 1 },
  title: "A careful study of reliable metadata",
};

const crossrefWork = {
  message: {
    DOI: "10.1234/example.1",
    author: [{ family: "Smith" }],
    issued: { "date-parts": [[2024]] },
    title: ["A careful study of reliable metadata"],
    "container-title": ["Journal of Records"],
  },
};

function installFetch(proposedReference: string) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.crossref.org/works/")) return new Response(JSON.stringify(crossrefWork), { status: 200 });
    if (url.startsWith("https://api.crossref.org/works")) return new Response(JSON.stringify({ message: { items: [] } }), { status: 200 });
    if (url.startsWith("https://api.openalex.org/works")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
    if (url === "https://api.openai.com/v1/responses") {
      return new Response(JSON.stringify({
        output: [{ content: [{ text: JSON.stringify({ proposals: [{
          formattedReference: proposedReference,
          modelConfidence: 0.98,
          rationale: "DOI, author, title, and year align with the provider record.",
          recommendation: "propose",
          referenceOrder: 1,
          selectedCandidateIndex: 1,
        }] }), type: "output_text" }] }],
      }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return () => { globalThis.fetch = previous; };
}

test("creates an editor-review proposal only from provider-backed metadata", async () => {
  const restore = installFetch("Smith, J. (2024). A careful study of reliable metadata. Journal of Records. https://doi.org/10.1234/example.1");
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const proposals = await createCitationProposals([reference]);
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].autoApplyEligible, true);
    assert.equal(proposals[0].candidate.provider, "crossref");
  } finally {
    restore();
    process.env.OPENAI_API_KEY = previousKey;
  }
});

test("rejects a model-formatted reference that omits provider evidence", async () => {
  const restore = installFetch("Smith, J. (2024). Unrelated article.");
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    assert.deepEqual(await createCitationProposals([reference]), []);
  } finally {
    restore();
    process.env.OPENAI_API_KEY = previousKey;
  }
});
