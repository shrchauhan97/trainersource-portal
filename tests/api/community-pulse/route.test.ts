import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        overlaps: () => ({
          neq: () => ({
            order: () => ({
              order: () => ({
                limit: () => Promise.resolve({
                  data: [{
                    id: "1",
                    summary: "Great results with BPC-157",
                    representative_quote: "@a: 4 weeks in, full recovery.",
                    enthusiasm: 9,
                    forum_threads: { source: "excelmale", thread_title: "BPC log", thread_url: "https://x.test/1" },
                  }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
});

describe("GET /api/community-pulse/[productSlug]", () => {
  it("returns up to 4 cards for a known peptide slug", async () => {
    const { GET } = await import("@/app/api/community-pulse/[productSlug]/route");
    const req = new Request("https://test/api/community-pulse/bpc-157");
    const res = await GET(req, { params: Promise.resolve({ productSlug: "bpc-157" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.cards)).toBe(true);
    expect(body.cards[0]).toMatchObject({
      summary: expect.any(String),
      quote: expect.any(String),
      source: "excelmale",
      thread_url: expect.stringMatching(/^https?:\/\//),
    });
  });

  it("returns empty cards array for unknown slug", async () => {
    const { GET } = await import("@/app/api/community-pulse/[productSlug]/route");
    const req = new Request("https://test/api/community-pulse/unknown-peptide");
    const res = await GET(req, { params: Promise.resolve({ productSlug: "unknown-peptide" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cards).toEqual([]);
  });
});
