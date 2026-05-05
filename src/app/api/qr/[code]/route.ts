import QRCode from 'qrcode';

export const runtime = 'nodejs';

const CODE_RE = /^[A-Z0-9-]{4,40}$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  if (!CODE_RE.test(code)) {
    return new Response('invalid code', { status: 400 });
  }
  const upBase = process.env.NEXT_PUBLIC_UP_BASE_URL ?? 'https://ultimate-peptides.com';
  const deepLink = `${upBase}/code/${code}`;
  const buffer = await QRCode.toBuffer(deepLink, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
