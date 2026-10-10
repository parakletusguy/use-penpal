import "server-only";

type ReviewReadyAlert = {
  findingCount: number;
  manuscriptId: number;
  suggestionCount: number;
  title: string;
};

type ReviewFailedAlert = {
  manuscriptId: number;
  title: string;
};

type EmailConfiguration = {
  apiKey: string;
  from: string;
  to: string;
};

function getConfiguration(): EmailConfiguration | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PENPAL_ALERT_FROM?.trim();
  const to = process.env.PENPAL_EDITOR_EMAIL?.trim();

  return apiKey && from && to ? { apiKey, from, to } : null;
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function manuscriptUrl(manuscriptId: number) {
  const appUrl = process.env.PENPAL_APP_URL?.trim().replace(/\/$/, "");
  return appUrl ? `${appUrl}/manuscripts/${manuscriptId}` : null;
}

async function sendAlert(subject: string, html: string) {
  const configuration = getConfiguration();
  if (!configuration) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({ from: configuration.from, html, subject, to: [configuration.to] }),
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("PenPal editorial alert was not accepted by Resend.");
      return false;
    }

    return true;
  } catch {
    console.error("PenPal editorial alert could not be sent.");
    return false;
  }
}

export function sendReviewReadyAlert({ findingCount, manuscriptId, suggestionCount, title }: ReviewReadyAlert) {
  const safeTitle = escapeHtml(cleanText(title, 180));
  const url = manuscriptUrl(manuscriptId);
  const action = url
    ? `<p><a href="${escapeHtml(url)}">Open this manuscript in PenPal</a></p>`
    : "";

  return sendAlert(
    `Review ready: ${cleanText(title, 120)}`,
    `<h1>Editorial review ready</h1><p><strong>${safeTitle}</strong> has completed PenPal's editorial checks.</p><ul><li>${findingCount} finding${findingCount === 1 ? "" : "s"}</li><li>${suggestionCount} proposed edit${suggestionCount === 1 ? "" : "s"}</li></ul>${action}`,
  );
}

export function sendReviewFailedAlert({ manuscriptId, title }: ReviewFailedAlert) {
  const safeTitle = escapeHtml(cleanText(title, 180));
  const url = manuscriptUrl(manuscriptId);
  const action = url
    ? `<p><a href="${escapeHtml(url)}">Open this manuscript in PenPal</a></p>`
    : "";

  return sendAlert(
    `Analysis needs attention: ${cleanText(title, 120)}`,
    `<h1>Editorial analysis needs attention</h1><p><strong>${safeTitle}</strong> could not complete its PenPal editorial checks. No changes were made to the manuscript.</p>${action}`,
  );
}
