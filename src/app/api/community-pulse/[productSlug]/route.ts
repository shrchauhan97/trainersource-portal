import { createClient } from "@supabase/supabase-js";
import { slugToPeptideTags } from "@/lib/peptide-map";

export const runtime = "edge";
export const revalidate = 86400;

interface Card {
  summary: string;
  quote: string;
  source: string;
  thread_title: string;
  thread_url: string;
  enthusiasm: number;
}

// CORS allowlist for the cross-origin widget fetch from the BC storefront.
// The endpoint serves public, non-sensitive classifier output (no PII, no
// auth state); allow the UP storefront and its preview/staging domains.
const ALLOWED_ORIGINS = new Set<string>([
  "https://ultimate-peptides.com",
  "https://www.ultimate-peptides.com",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ultimate-peptides.com";
  return {
    "access-control-allow-origin": allow,
    "vary": "Origin",
  };
}

function jsonResponse(body: unknown, init: { status?: number; cache?: string; origin: string | null }): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...corsHeaders(init.origin),
  };
  if (init.cache) headers["cache-control"] = init.cache;
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export async function OPTIONS(req: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req.headers.get("origin")),
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ productSlug: string }> },
): Promise<Response> {
  const origin = req.headers.get("origin");
  const { productSlug } = await ctx.params;
  const tags = slugToPeptideTags(productSlug);
  if (tags.length === 0) {
    return jsonResponse({ cards: [] }, { cache: "public, max-age=86400", origin });
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const sb = createClient(url, key);

    const { data, error } = await sb
      .from("forum_classifications")
      .select(`
        id, summary, representative_quote, enthusiasm,
        forum_threads!inner ( source, thread_title, thread_url )
      `)
      .overlaps("peptide_tags", tags)
      .neq("manual_override", "force_exclude")
      .order("enthusiasm", { ascending: false })
      .order("credibility", { ascending: false })
      .limit(4);

    if (error) {
      console.error("[community-pulse] db error", error);
      return jsonResponse({ cards: [] }, { origin });
    }

    const cards: Card[] = (data ?? []).map((row: any) => ({
      summary: row.summary,
      quote: row.representative_quote,
      source: row.forum_threads.source,
      thread_title: row.forum_threads.thread_title,
      thread_url: row.forum_threads.thread_url,
      enthusiasm: row.enthusiasm,
    }));

    return jsonResponse(
      { cards },
      { cache: "public, max-age=86400, stale-while-revalidate=604800", origin },
    );
  } catch (e) {
    console.error("[community-pulse] unexpected error", e);
    return jsonResponse({ cards: [] }, { origin });
  }
}
