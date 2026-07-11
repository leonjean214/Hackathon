import { describe, expect, it } from "vitest";
import {
  buildMediaContentBlocks,
  normalizeDeadline,
  parseJsonArray,
  parseJsonObject,
} from "../bedrock";

describe("normalizeDeadline", () => {
  it("returns a normalized deadline for a valid object", () => {
    expect(
      normalizeDeadline({
        title: "Submit renewal",
        due_date: "2026-08-15",
        description: "Renewal package is due.",
        confidence: 0.75,
      })
    ).toEqual({
      title: "Submit renewal",
      due_date: "2026-08-15",
      description: "Renewal package is due.",
      confidence: 0.75,
    });
  });

  it("returns null for a non-ISO date", () => {
    expect(
      normalizeDeadline({
        title: "Submit renewal",
        due_date: "August 15, 2026",
        confidence: 0.75,
      })
    ).toBeNull();
  });

  it("returns null for a missing title", () => {
    expect(
      normalizeDeadline({
        due_date: "2026-08-15",
        confidence: 0.75,
      })
    ).toBeNull();
  });

  it("clamps confidence to the inclusive zero-to-one range", () => {
    expect(
      normalizeDeadline({
        title: "Low confidence",
        due_date: "2026-08-15",
        confidence: -5,
      })?.confidence
    ).toBe(0);
    expect(
      normalizeDeadline({
        title: "High confidence",
        due_date: "2026-08-15",
        confidence: 5,
      })?.confidence
    ).toBe(1);
  });

  it("returns null for non-object garbage", () => {
    expect(normalizeDeadline(null)).toBeNull();
    expect(normalizeDeadline("garbage")).toBeNull();
    expect(normalizeDeadline(42)).toBeNull();
  });
});

describe("parseJsonArray", () => {
  it("parses a clean JSON array", () => {
    expect(parseJsonArray('[{"title":"A"}]')).toEqual([{ title: "A" }]);
  });

  it("parses an array wrapped in json fences and prose", () => {
    expect(
      parseJsonArray('Here are the deadlines:\n```json\n[{"title":"A"}]\n```\nDone.')
    ).toEqual([{ title: "A" }]);
  });

  it("parses an empty array", () => {
    expect(parseJsonArray("[]")).toEqual([]);
  });

  it("throws when no array is present", () => {
    expect(() => parseJsonArray("No deadlines found.")).toThrow(
      "Claude did not return a JSON array."
    );
  });
});

describe("parseJsonObject", () => {
  it("parses a clean JSON object", () => {
    expect(parseJsonObject('{"transcript":"A","deadlines":[]}')).toEqual({
      transcript: "A",
      deadlines: [],
    });
  });

  it("parses an object wrapped in prose", () => {
    expect(parseJsonObject('Result:\n```json\n{"transcript":"A"}\n```')).toEqual({
      transcript: "A",
    });
  });

  it("throws when no object is present", () => {
    expect(() => parseJsonObject("No JSON here.")).toThrow(
      "Claude did not return a JSON object."
    );
  });
});

describe("buildMediaContentBlocks", () => {
  it("builds a PDF document block for Anthropic messages on Bedrock", () => {
    const blocks = buildMediaContentBlocks("abc123", "application/pdf");

    expect(blocks[0]).toEqual({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: "abc123",
      },
    });
    expect(blocks[1]).toMatchObject({ type: "text" });
  });

  it("builds an image block for JPEG uploads", () => {
    const blocks = buildMediaContentBlocks("abc123", "image/jpeg");

    expect(blocks[0]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: "abc123",
      },
    });
    expect(blocks[1]).toMatchObject({ type: "text" });
  });
});
