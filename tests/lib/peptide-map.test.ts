import { describe, it, expect } from "vitest";
import { slugToPeptideTags } from "@/lib/peptide-map";

describe("slugToPeptideTags", () => {
  it("includes the canonical PascalCase tag the classifier emits", () => {
    expect(slugToPeptideTags("bpc-157")).toContain("BPC-157");
  });

  it("emits multiple case variants for case-insensitive matching", () => {
    const tags = slugToPeptideTags("bpc-157");
    expect(tags).toContain("BPC-157");
    expect(tags).toContain("bpc-157");
  });

  it("handles synonyms (body-protective-compound-157)", () => {
    expect(slugToPeptideTags("body-protective-compound-157")).toContain("BPC-157");
  });

  it("returns empty array for unknown slug", () => {
    expect(slugToPeptideTags("nonexistent-peptide")).toEqual([]);
  });

  it("is case-insensitive on input", () => {
    expect(slugToPeptideTags("BPC-157")).toContain("BPC-157");
  });
});
