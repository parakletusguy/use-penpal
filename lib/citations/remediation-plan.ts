export type RemediationReference = {
  citationCount: number;
  rawReference: string;
  referenceOrder: number;
  verificationReason: string | null;
  verificationStatus: string;
};

export type RemediationCitation = {
  citationText: string;
  reconciliationStatus: string;
  sourceLocator: unknown;
};

export type CitationRemediationPacket = {
  attentionReferenceCount: number;
  citationCount: number;
  citations: RemediationCitation[];
  manuscriptTitle: string;
  referenceCount: number;
  references: RemediationReference[];
  verifiedReferenceCount: number;
};

export type CitationRemediationSummary = {
  authorQueryCount: number;
  needsReferenceListRepair: boolean;
  unresolvedCitationCount: number;
  unresolvedReferenceCount: number;
};

function markdownValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sourceLocation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "recorded location in the source";
  const locator = value as Record<string, unknown>;
  const line = typeof locator.line === "number" ? locator.line : null;
  const start = typeof locator.start === "number" ? locator.start : null;
  const end = typeof locator.end === "number" ? locator.end : null;
  if (line !== null) return `source line ${line}`;
  if (start !== null && end !== null) return `source characters ${start}-${end}`;
  return "recorded location in the source";
}

function unresolvedReferences(packet: CitationRemediationPacket) {
  return packet.references.filter((reference) => reference.verificationStatus !== "verified");
}

function unresolvedCitations(packet: CitationRemediationPacket) {
  return packet.citations.filter((citation) => citation.reconciliationStatus !== "matched");
}

export function citationRemediationSummary(packet: CitationRemediationPacket): CitationRemediationSummary {
  const references = unresolvedReferences(packet);
  const citations = unresolvedCitations(packet);
  return {
    authorQueryCount: references.length + citations.length + (packet.referenceCount === 0 && citations.length ? 1 : 0),
    needsReferenceListRepair: packet.referenceCount === 0 && citations.length > 0,
    unresolvedCitationCount: citations.length,
    unresolvedReferenceCount: references.length,
  };
}

export function buildCitationRemediationPacket(packet: CitationRemediationPacket) {
  const unresolvedReferenceItems = unresolvedReferences(packet);
  const unresolvedCitationItems = unresolvedCitations(packet);
  const summary = citationRemediationSummary(packet);
  const title = markdownValue(packet.manuscriptTitle) || "Untitled manuscript";
  const lines = [
    `# Citation remediation packet: ${title}`,
    "",
    "This packet is an editorial worklist generated from PenPal's latest reference-verification run. It does not create, replace, or approve any citation. Use an author-supplied authoritative source record, or obtain an explicit editorial decision to revise or remove the dependent claim.",
    "",
    "## Current record",
    "",
    `- Parsed references: ${packet.referenceCount}`,
    `- Uniquely verified references: ${packet.verifiedReferenceCount}`,
    `- References needing a source response: ${summary.unresolvedReferenceCount}`,
    `- In-text citations needing reconciliation: ${summary.unresolvedCitationCount}`,
    "",
  ];

  if (summary.needsReferenceListRepair) {
    lines.push(
      "## Priority author query: reference-list structure",
      "",
      "PenPal found in-text citations but could not parse a usable References or Bibliography list. Please provide the complete reference list as editable text, preserving one full entry per source. If a cited work has no supporting source, identify the dependent claim for revision or removal.",
      "",
    );
  }

  if (unresolvedReferenceItems.length) {
    lines.push("## Author queries: bibliography entries", "");
    for (const reference of unresolvedReferenceItems) {
      const usage = reference.citationCount
        ? ` It is cited ${reference.citationCount} time${reference.citationCount === 1 ? "" : "s"} in the manuscript.`
        : " It was not linked to a unique in-text citation by the parser.";
      lines.push(
        `### R${reference.referenceOrder} · ${reference.verificationStatus.replaceAll("_", " ")}`,
        "",
        `**Source text:** ${markdownValue(reference.rawReference)}`,
        "",
        `**Why this needs a response:** ${markdownValue(reference.verificationReason ?? "PenPal could not uniquely verify this record.")}${usage}`,
        "",
        "**Requested author response:** Please provide the authoritative, complete reference entry and its DOI or stable publisher/source URL. If this source cannot support the associated claim, identify the claim for revision or removal. Do not substitute a different work without editorial approval.",
        "",
      );
    }
  }

  if (unresolvedCitationItems.length) {
    lines.push("## Author queries: in-text citations", "");
    for (const citation of unresolvedCitationItems) {
      lines.push(
        `### ${markdownValue(citation.citationText)}`,
        "",
        `**Location:** ${sourceLocation(citation.sourceLocator)}`,
        "",
        `**Reconciliation status:** ${citation.reconciliationStatus.replaceAll("_", " ")}`,
        "",
        "**Requested author response:** Provide the complete, authoritative bibliography entry for this cited work, including DOI or stable source URL where available. If no source can be provided, identify the dependent claim for revision or removal.",
        "",
      );
    }
  }

  if (!summary.authorQueryCount) {
    lines.push("## No outstanding citation queries", "", "PenPal found no unresolved bibliography or in-text citation items in this verification run.", "");
  }

  lines.push("## Editorial safeguard", "", "Apply a bibliography change only after the supplied source is checked against the manuscript. PenPal deliberately does not use search results to rewrite a reference or make a substantive claim.", "");
  return lines.join("\n");
}
