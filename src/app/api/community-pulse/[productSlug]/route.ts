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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ productSlug: string }> },
): Promise<Response> {
  const { productSlug } = await ctx.params;
  const tags = slugToPeptideTags(productSlug);
  if (tags.length === 0) {
    return Response.json(
      { cards: [] },
      { headers: { "cache-control": "public, max-age=86400" } },
    );
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
      return Response.json({ cards: [] }, { status: 200 });
    }

    const cards: Card[] = (data ?? []).map((row: any) => ({
      summary: row.summary,
      quote: row.representative_quote,
      source: row.forum_threads.source,
      thread_title: row.forum_threads.thread_title,
      thread_url: row.forum_threads.thread_url,
      enthusiasm: row.enthusiasm,
    }));

    return Response.json(
      { cards },
      { headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" } },
    );
  } catch (e) {
    console.error("[community-pulse] unexpected error", e);
    return Response.json({ cards: [] }, { status: 200 });
  }
}
