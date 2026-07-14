export type RuleLifecycleStatus =
  | "CANDIDATE"
  | "SHADOW"
  | "VALIDATED"
  | "DEGRADED"
  | "REJECTED"
  | "RETIRED";

export type ProfileLifecycleStatus = Exclude<RuleLifecycleStatus, "RETIRED"> | "PAUSED";

export function initialProfileLifecycle(
  ruleLifecycle: RuleLifecycleStatus,
): ProfileLifecycleStatus {
  if (ruleLifecycle === "RETIRED") return "PAUSED";
  if (ruleLifecycle === "VALIDATED") return "SHADOW";
  return ruleLifecycle;
}

export function validationLifecycleTransition(
  prior: RuleLifecycleStatus,
  passed: boolean,
): { lifecycleStatus: RuleLifecycleStatus; restartShadow: boolean } {
  if (passed) {
    if (prior === "VALIDATED") {
      return { lifecycleStatus: "VALIDATED", restartShadow: false };
    }
    if (prior === "SHADOW") {
      return { lifecycleStatus: "SHADOW", restartShadow: false };
    }
    return { lifecycleStatus: "SHADOW", restartShadow: true };
  }

  if (prior === "SHADOW" || prior === "VALIDATED" || prior === "DEGRADED") {
    return { lifecycleStatus: "DEGRADED", restartShadow: false };
  }
  return { lifecycleStatus: "REJECTED", restartShadow: false };
}
