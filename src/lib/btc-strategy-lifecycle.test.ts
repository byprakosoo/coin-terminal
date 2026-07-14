import { describe, expect, it } from "vitest";
import {
  initialProfileLifecycle,
  validationLifecycleTransition,
} from "@/lib/btc-strategy-lifecycle";

describe("BTC strategy lifecycle", () => {
  it("does not restart an accepted shadow period on periodic validation", () => {
    expect(validationLifecycleTransition("SHADOW", true)).toEqual({
      lifecycleStatus: "SHADOW",
      restartShadow: false,
    });
  });

  it("keeps a validated rule validated when periodic gates continue to pass", () => {
    expect(validationLifecycleTransition("VALIDATED", true)).toEqual({
      lifecycleStatus: "VALIDATED",
      restartShadow: false,
    });
  });

  it("degrades an accepted rule when a later validation fails", () => {
    expect(validationLifecycleTransition("VALIDATED", false)).toEqual({
      lifecycleStatus: "DEGRADED",
      restartShadow: false,
    });
  });

  it("starts a fresh shadow period after a candidate first passes", () => {
    expect(validationLifecycleTransition("CANDIDATE", true)).toEqual({
      lifecycleStatus: "SHADOW",
      restartShadow: true,
    });
  });

  it("initializes new users from the shared rule lifecycle", () => {
    expect(initialProfileLifecycle("SHADOW")).toBe("SHADOW");
    expect(initialProfileLifecycle("VALIDATED")).toBe("SHADOW");
    expect(initialProfileLifecycle("RETIRED")).toBe("PAUSED");
  });
});
