import JSZip from "jszip";

export type ApprovedEdit = {
  id: number;
  originalText: string | null;
  proposedText: string | null;
};

export type SkippedEdit = {
  id: number;
  reason: string;
};

export type RevisedDocument = {
  appliedSuggestionIds: number[];
  bytes: Buffer;
  skippedEdits: SkippedEdit[];
};

type TextNode = {
  end: number;
  openTag: string;
  start: number;
  text: string;
};

const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const textNodePattern = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)<\/w:t>/g;

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function encodeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textElement(openTag: string, value: string) {
  const needsSpacePreserve = /^[\t\n\r ]|[\t\n\r ]$/.test(value);
  const tag = needsSpacePreserve && !/\sxml:space=/.test(openTag)
    ? `${openTag.slice(0, -1)} xml:space="preserve">`
    : openTag;
  return `${tag}${encodeXml(value)}</w:t>`;
}

function replaceOneInParagraph(paragraph: string, originalText: string, proposedText: string) {
  const nodes: TextNode[] = [];
  let cursor = 0;

  for (const match of paragraph.matchAll(textNodePattern)) {
    const text = decodeXml(match[2]);
    nodes.push({ end: cursor + text.length, openTag: match[1], start: cursor, text });
    cursor += text.length;
  }

  const paragraphText = nodes.map((node) => node.text).join("");
  const start = paragraphText.indexOf(originalText);
  if (start === -1) return { changed: false, paragraph };
  const end = start + originalText.length;
  let nodeIndex = 0;

  const revised = paragraph.replace(textNodePattern, (_whole, openTag: string, encodedText: string) => {
    const node = nodes[nodeIndex++];
    if (node.end <= start || node.start >= end) return `${openTag}${encodedText}</w:t>`;

    const localStart = Math.max(0, start - node.start);
    const localEnd = Math.min(node.text.length, end - node.start);
    const insert = start >= node.start && start < node.end ? proposedText : "";
    return textElement(node.openTag, `${node.text.slice(0, localStart)}${insert}${node.text.slice(localEnd)}`);
  });

  return { changed: true, paragraph: revised };
}

function replaceOneInDocument(documentXml: string, originalText: string, proposedText: string) {
  let changed = false;
  const revised = documentXml.replace(paragraphPattern, (paragraph) => {
    if (changed) return paragraph;
    const result = replaceOneInParagraph(paragraph, originalText, proposedText);
    changed = result.changed;
    return result.paragraph;
  });
  return { changed, documentXml: revised };
}

export async function createRevisedDocument(source: ArrayBuffer | Buffer, edits: ApprovedEdit[]): Promise<RevisedDocument> {
  const zip = await JSZip.loadAsync(source);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("The source is not a readable Word document.");

  let documentXml = await documentFile.async("string");
  const appliedSuggestionIds: number[] = [];
  const skippedEdits: SkippedEdit[] = [];

  for (const edit of edits) {
    if (!edit.originalText?.trim() || !edit.proposedText?.trim()) {
      skippedEdits.push({ id: edit.id, reason: "The proposal does not contain both source and replacement text." });
      continue;
    }

    const result = replaceOneInDocument(documentXml, edit.originalText, edit.proposedText);
    if (!result.changed) {
      skippedEdits.push({ id: edit.id, reason: "The exact source passage could not be found safely in the Word document." });
      continue;
    }

    documentXml = result.documentXml;
    appliedSuggestionIds.push(edit.id);
  }

  zip.file("word/document.xml", documentXml);
  const bytes = await zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    type: "nodebuffer",
  });

  return { appliedSuggestionIds, bytes, skippedEdits };
}

export function revisedFileName(sourceFileName: string) {
  const stem = sourceFileName.replace(/\.docx$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "manuscript";
  return `${stem}-penpal-revised.docx`;
}
