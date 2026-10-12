import JSZip from "jszip";
import type { EditorialFinding } from "@/lib/ai/editorial-review";

export type DocxStructureAssessment = {
  findings: EditorialFinding[];
};

function documentExcerpt(manuscriptText: string) {
  return manuscriptText.slice(0, 240).trim() || "Document structure could not be read.";
}

function makeFinding(
  manuscriptText: string,
  options: Omit<EditorialFinding, "evidenceExcerpt"> & { evidenceExcerpt?: string },
): EditorialFinding {
  return {
    ...options,
    evidenceExcerpt: options.evidenceExcerpt?.trim().slice(0, 240) || documentExcerpt(manuscriptText),
  };
}

function occurrenceCount(value: string, expression: RegExp) {
  return [...value.matchAll(expression)].length;
}

function labelsInOrder(manuscriptText: string, label: "Table" | "Figure") {
  const labels = [...manuscriptText.matchAll(new RegExp(`\\b${label}\\s+(\\d+)\\b`, "gi"))]
    .map((match) => Number(match[1]))
    .filter(Number.isSafeInteger);
  return [...new Set(labels)].sort((left, right) => left - right);
}

function areConsecutive(labels: number[]) {
  return labels.every((label, index) => index === 0 || label === labels[index - 1] + 1);
}

function firstLabelExcerpt(manuscriptText: string, label: "Table" | "Figure") {
  const match = manuscriptText.match(new RegExp(`\\b${label}\\s+\\d+[^\\n]*`, "i"));
  return match?.[0] ?? undefined;
}

function hasVerticalTableBorders(documentXml: string) {
  const borderTags = documentXml.match(/<w:(?:left|right|insideV)\b[^>]*>/g) ?? [];
  return borderTags.some((tag) => !/w:val="(?:nil|none)"/i.test(tag));
}

export async function assessIjsdsDocxStructure(source: ArrayBuffer | Buffer, manuscriptText: string): Promise<DocxStructureAssessment> {
  const zip = await JSZip.loadAsync(source);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) {
    return {
      findings: [makeFinding(manuscriptText, {
        description: "The uploaded file could not be inspected as a Word document, so document-level IJSDS checks were not completed.",
        findingType: "technical",
        recommendedAction: "Open the source in Word, confirm that it is a valid .docx file, and upload a fresh private copy.",
        requiresEditorDecision: true,
        severity: "high",
        title: "Word document structure could not be inspected",
      })],
    };
  }

  const findings: EditorialFinding[] = [];
  const tableCount = occurrenceCount(documentXml, /<w:tbl(?:\s|>)/g);
  const imageCount = Object.keys(zip.files).filter((name) => /^word\/media\/[^/]+$/i.test(name)).length;
  const tableLabels = labelsInOrder(manuscriptText, "Table");
  const figureLabels = labelsInOrder(manuscriptText, "Figure");

  if (tableCount && !tableLabels.length) {
    findings.push(makeFinding(manuscriptText, {
      description: `The Word document contains ${tableCount} table${tableCount === 1 ? "" : "s"}, but no numbered Table caption was found in the extracted text. The IJSDS guide asks for tables to be numbered consecutively according to their appearance.`,
      findingType: "formatting",
      recommendedAction: "Confirm that each table has a visible, consecutive caption in Word. Ask the author to correct missing captions rather than adding content automatically.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Table captions could not be confirmed",
    }));
  } else if (tableLabels.length && !areConsecutive(tableLabels)) {
    findings.push(makeFinding(manuscriptText, {
      description: "The detected Table labels are not consecutive. The IJSDS guide asks for tables to be numbered in their order of appearance.",
      evidenceExcerpt: firstLabelExcerpt(manuscriptText, "Table"),
      findingType: "formatting",
      recommendedAction: "Confirm the order in Word and ask the author to correct the table numbering if needed.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Table numbering may not be consecutive",
    }));
  }

  if (tableCount && hasVerticalTableBorders(documentXml)) {
    findings.push(makeFinding(manuscriptText, {
      description: "The Word table markup includes vertical borders. The IJSDS guide asks authors to avoid vertical rules in tables.",
      evidenceExcerpt: firstLabelExcerpt(manuscriptText, "Table"),
      findingType: "formatting",
      recommendedAction: "Review the table formatting in Word and remove vertical rules where appropriate; do not alter the tabular data automatically.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Vertical table rules detected",
    }));
  }

  if (imageCount && !figureLabels.length) {
    findings.push(makeFinding(manuscriptText, {
      description: `The Word document embeds ${imageCount} image${imageCount === 1 ? "" : "s"}, but no numbered Figure caption was found in the extracted text. The IJSDS guide asks for a caption for each illustration.`,
      findingType: "formatting",
      recommendedAction: "Confirm that each illustration has a separate, numbered caption and that its source image is suitable for submission.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Figure captions could not be confirmed",
    }));
  } else if (figureLabels.length && !areConsecutive(figureLabels)) {
    findings.push(makeFinding(manuscriptText, {
      description: "The detected Figure labels are not consecutive. The IJSDS guide asks for figures to be clearly captioned and ordered.",
      evidenceExcerpt: firstLabelExcerpt(manuscriptText, "Figure"),
      findingType: "formatting",
      recommendedAction: "Confirm the order in Word and ask the author to correct the figure numbering if needed.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Figure numbering may not be consecutive",
    }));
  }

  const footnotesXml = await zip.file("word/footnotes.xml")?.async("string");
  const footnoteCount = footnotesXml
    ? occurrenceCount(footnotesXml, /<w:footnote\b(?![^>]*w:type="(?:separator|continuationSeparator)")/g)
    : 0;
  if (footnoteCount > 5) {
    findings.push(makeFinding(manuscriptText, {
      description: `The Word document contains ${footnoteCount} footnotes. The IJSDS guide asks that footnotes be used sparingly.`,
      findingType: "formatting",
      recommendedAction: "Review whether every footnote is necessary and ensure that no reference-list entries are placed in footnotes.",
      requiresEditorDecision: true,
      severity: "info",
      title: "Footnote use needs an editorial check",
    }));
  }

  const trackedChangeCount = occurrenceCount(documentXml, /<w:(?:ins|del)\b/g);
  if (trackedChangeCount) {
    findings.push(makeFinding(manuscriptText, {
      description: "The uploaded Word file already contains tracked insertions or deletions. PenPal preserves source formatting and does not accept or reject pre-existing Word revisions.",
      findingType: "technical",
      recommendedAction: "Resolve or preserve the existing Word revisions deliberately before using the generated copy as a submission file.",
      requiresEditorDecision: true,
      severity: "warning",
      title: "Existing Word tracked changes detected",
    }));
  }

  return { findings };
}
