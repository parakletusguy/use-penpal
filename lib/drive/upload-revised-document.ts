import { JWT } from "google-auth-library";

// The service account is restricted by the output-folder ACL. The broader
// scope is required to locate and replace pre-existing files in that folder.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  type?: string;
};

export type UploadedDriveFile = {
  fileId: string;
  name: string;
  url: string;
};

type DriveAccess = {
  auth: JWT;
  folderId: string;
};

function outputFolderId() {
  const value = process.env.PENPAL_DRIVE_OUTPUT_FOLDER_ID?.trim();
  return value && /^[a-zA-Z0-9_-]{10,200}$/.test(value) ? value : null;
}

function credentialsFromEnvironment(): ServiceAccountCredentials | null {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Record<string, unknown>;
    const clientEmail = typeof candidate.client_email === "string" ? candidate.client_email : null;
    const privateKey = typeof candidate.private_key === "string" ? candidate.private_key : null;
    const privateKeyId = typeof candidate.private_key_id === "string" ? candidate.private_key_id : undefined;
    const type = typeof candidate.type === "string" ? candidate.type : undefined;
    if (!clientEmail || !privateKey || !clientEmail.endsWith(".gserviceaccount.com") || !privateKey.includes("BEGIN PRIVATE KEY")) return null;
    return { client_email: clientEmail, private_key: privateKey, private_key_id: privateKeyId, type };
  } catch {
    return null;
  }
}

export function isDriveUploadConfigured() {
  return Boolean(outputFolderId() && credentialsFromEnvironment());
}

function readableDriveError(status: number) {
  if (status === 401 || status === 403) return "Google Drive rejected the configured service account or its folder permission.";
  if (status === 404) return "The configured Google Drive output folder could not be found.";
  if (status === 429) return "Google Drive is temporarily rate-limiting uploads. Try again shortly.";
  return "Google Drive could not save the revised document.";
}

async function driveAccess(): Promise<DriveAccess> {
  const folderId = outputFolderId();
  const credentials = credentialsFromEnvironment();
  if (!folderId || !credentials) throw new Error("Google Drive output is not configured.");

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    keyId: credentials.private_key_id,
    scopes: [DRIVE_SCOPE],
  });
  return { auth, folderId };
}

async function accessToken(auth: JWT) {
  const accessToken = await auth.getAccessToken();
  if (!accessToken.token) throw new Error("Google Drive authentication could not obtain an access token.");
  return accessToken.token;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function uploadedDriveFile(file: Record<string, unknown>, fallbackName: string): UploadedDriveFile | null {
  const fileId = typeof file.id === "string" ? file.id : null;
  if (!fileId) return null;
  return {
    fileId,
    name: typeof file.name === "string" ? file.name : fallbackName,
    url: typeof file.webViewLink === "string" ? file.webViewLink : "https://drive.google.com/open?id=" + encodeURIComponent(fileId),
  };
}

async function findDriveFiles(auth: JWT, query: string, pageSize: number): Promise<Record<string, unknown>[]> {
  const token = await accessToken(auth);
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,webViewLink)");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(readableDriveError(response.status));
  const payload: unknown = await response.json().catch(() => null);
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const files = root && Array.isArray(root.files) ? root.files : [];
  return files.filter((file): file is Record<string, unknown> => Boolean(file && typeof file === "object"));
}

async function existingUpload(auth: JWT, artifactId: number): Promise<UploadedDriveFile | null> {
  const query = "appProperties has { key='penpal_artifact_id' and value='" + artifactId + "' }";
  const [file] = await findDriveFiles(auth, query, 1);
  return file ? uploadedDriveFile(file, "PenPal revised document") : null;
}

async function existingOutputWithName(auth: JWT, folderId: string, displayName: string): Promise<UploadedDriveFile | null> {
  const query = [
    "trashed = false",
    "'" + escapeDriveQueryValue(folderId) + "' in parents",
    "name = '" + escapeDriveQueryValue(displayName) + "'",
  ].join(" and ");
  const files = await findDriveFiles(auth, query, 2);
  if (files.length > 1) {
    throw new Error("More than one Drive file has this revised-document name. PenPal will not overwrite an ambiguous output.");
  }
  const [file] = files;
  return file ? uploadedDriveFile(file, displayName) : null;
}

async function folderIsInSharedDrive(auth: JWT, folderId: string): Promise<boolean> {
  const token = await accessToken(auth);
  const endpoint = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(folderId) + "?fields=id,mimeType,driveId&supportsAllDrives=true";
  const response = await fetch(endpoint, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(readableDriveError(response.status));
  const payload: unknown = await response.json().catch(() => null);
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (record?.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("The configured Google Drive output location is not a folder.");
  }
  return typeof record.driveId === "string" && record.driveId.length > 0;
}

async function saveDriveFile(input: {
  artifactId: number;
  bytes: Buffer;
  displayName: string;
  fileId?: string;
  folderId: string;
  token: string;
}): Promise<UploadedDriveFile> {
  const boundary = "penpal-" + crypto.randomUUID();
  const metadata = Buffer.from(JSON.stringify({
    appProperties: { penpal_artifact_id: String(input.artifactId) },
    mimeType: WORD_MIME,
    name: input.displayName,
    ...(input.fileId ? {} : { parents: [input.folderId] }),
  }));
  const body = Buffer.concat([
    Buffer.from("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"),
    metadata,
    Buffer.from("\r\n--" + boundary + "\r\nContent-Type: " + WORD_MIME + "\r\n\r\n"),
    input.bytes,
    Buffer.from("\r\n--" + boundary + "--\r\n"),
  ]);
  const endpoint = input.fileId
    ? "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(input.fileId) + "?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink"
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink";
  const response = await fetch(endpoint, {
    body,
    headers: {
      Authorization: "Bearer " + input.token,
      "Content-Type": "multipart/related; boundary=" + boundary,
    },
    method: input.fileId ? "PATCH" : "POST",
    signal: AbortSignal.timeout(60_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") throw new Error(readableDriveError(response.status));
  const uploaded = uploadedDriveFile(payload as Record<string, unknown>, input.displayName);
  if (!uploaded) throw new Error("Google Drive did not return an uploaded file identifier.");
  return uploaded;
}

export async function uploadRevisedDocumentToDrive(input: { artifactId: number; bytes: Buffer; displayName: string }): Promise<UploadedDriveFile> {
  const { auth, folderId } = await driveAccess();
  const existing = await existingUpload(auth, input.artifactId);
  if (existing) return existing;

  const legacyOutput = await existingOutputWithName(auth, folderId, input.displayName);
  if (!legacyOutput && !(await folderIsInSharedDrive(auth, folderId))) {
    throw new Error("The output folder is in personal Google Drive. PenPal can replace its existing matching revised files, but needs an IJSDS Shared Drive folder to create a new output.");
  }
  const token = await accessToken(auth);
  return saveDriveFile({
    artifactId: input.artifactId,
    bytes: input.bytes,
    displayName: input.displayName,
    fileId: legacyOutput?.fileId,
    folderId,
    token,
  });
}
