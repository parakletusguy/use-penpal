import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createRevisedDocument } from "../lib/docx/revise-manuscript.ts";

async function sourceDocument(text: string) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("removes an approved unsupported reference when its replacement is deliberately empty", async () => {
  const result = await createRevisedDocument(await sourceDocument("Unverified reference."), [{ id: 7, originalText: "Unverified reference.", proposedText: "" }]);
  const revised = await JSZip.loadAsync(result.bytes);
  const documentXml = await revised.file("word/document.xml")?.async("string");

  assert.deepEqual(result.appliedSuggestionIds, [7]);
  assert.equal(result.skippedEdits.length, 0);
  assert.doesNotMatch(documentXml ?? "", /Unverified reference/);
});
