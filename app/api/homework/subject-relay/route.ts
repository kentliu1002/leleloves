import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const preferredRegion = 'iad1';
export const maxDuration = 30;

export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: await request.text(),
      signal: AbortSignal.timeout(20000)
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' }
    });
  } catch (error: any) {
    console.error('[subject-relay] failed:', error.message, error.cause?.code);
    return NextResponse.json({ error: 'Subject relay unavailable' }, { status: 502 });
  }
}
