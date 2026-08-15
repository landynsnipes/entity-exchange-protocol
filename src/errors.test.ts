import { describe, expect, it } from "vitest";
import { ExpError, parseRetryAfter } from "./errors.js";

describe("EXP runtime errors", () => {
  it("classifies retryable HTTP statuses and preserves metadata", () => {
    const error = new ExpError("REQUEST_REJECTED", "rate limited", {
      status: 429,
      requestId: "request-1",
      retryAfterMs: 2_000,
    });
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(429);
    expect(error.requestId).toBe("request-1");
    expect(error.retryAfterMs).toBe(2_000);
  });

  it("classifies permanent authorization-style HTTP failures", () => {
    expect(new ExpError("REQUEST_REJECTED", "forbidden", { status: 403 }).retryable).toBe(false);
    expect(parseRetryAfter("3")).toBe(3_000);
    expect(parseRetryAfter("invalid")).toBeUndefined();
  });
});
