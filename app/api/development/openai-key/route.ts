import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function isLocalDevelopmentRequest(request: Request) {
  const requestUrl = new URL(request.url);

  return (
    process.env.NODE_ENV === "development" &&
    requestUrl.protocol === "http:" &&
    (requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1")
  );
}

export async function POST(request: Request) {
  if (!isLocalDevelopmentRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (origin !== requestUrl.origin) {
    return NextResponse.json({ error: "This setup is available only from PenPal on this computer." }, { status: 403 });
  }

  let body: { apiKey?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a valid OpenAI API key." }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    return NextResponse.json({ error: "Enter a valid OpenAI API key." }, { status: 400 });
  }

  // Deliberately runtime-only: never persist an API key to a file, database, or client response.
  process.env.OPENAI_API_KEY = apiKey;

  return NextResponse.json({ configured: true });
}
