import mammoth from "mammoth";
import type { ApprovedEdit, RevisedDocument } from "@/lib/docx/revise-manuscript";
import { assessIjsdsDocxStructure } from "@/lib/ijsds/docx-structure";

export type RevisedDocumentValidation = {
  structureFindingCount: number;
  unconfirmedSuggestionIds: number[];
};

export async function verifyRevisedDocument(
  revisedDocument: RevisedDocument,
  approvedEdits: ApprovedEdit[],
): Promise<RevisedDocumentValidation> {
  const extraction = await mammoth.extractRawText({ buffer: revisedDocument.bytes });
  const revisedText = extraction.value.replace(/\s+\n/g, "\n").trim();
  const comparableRevisedText = revisedText.replace(/\s+/g, " ").trim();
  const appliedIds = new Set(revisedDocument.appliedSuggestionIds);
  const unconfirmedSuggestionIds = approvedEdits
    .filter((edit) => appliedIds.has(edit.id))
    .flatMap((edit) => {
      const comparableProposal = edit.proposedText?.replace(/\s+/g, " ").trim();
      if (comparableProposal) return comparableRevisedText.includes(comparableProposal) ? [] : [edit.id];
      const comparableOriginal = edit.originalText?.replace(/\s+/g, " ").trim();
      return comparableOriginal && !comparableRevisedText.includes(comparableOriginal) ? [] : [edit.id];
    });
  const structure = await assessIjsdsDocxStructure(revisedDocument.bytes, revisedText);

  return {
    structureFindingCount: structure.findings.length,
    unconfirmedSuggestionIds,
  };
}
