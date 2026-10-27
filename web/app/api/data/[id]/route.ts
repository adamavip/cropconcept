import { NextRequest, NextResponse } from 'next/server';

// Proxies one dataset request to the FastAPI service on Cloud Run, adding the API key server-side.
// Browsers never see API_URL or API_KEY.
const API_URL = process.env.API_URL || 'http://localhost:8080';
const API_KEY = process.env.API_KEY || '';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9_]{1,64}$/.test(id)) return NextResponse.json({ detail: 'Bad dataset id' }, { status: 400 });
  const url = new URL(`${API_URL}/datasets/${id}`);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  try {
    const upstream = await fetch(url, { headers: API_KEY ? { 'X-API-Key': API_KEY } : {}, next: { revalidate: 60 } });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    return NextResponse.json({ detail: `API unreachable: ${err?.message || err}` }, { status: 502 });
  }
}
