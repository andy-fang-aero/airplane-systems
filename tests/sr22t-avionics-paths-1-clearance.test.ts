// Existing solid-clearance outcome cases moved from sr22t-depth-avionics-paths.test.ts to keep per-file runtime down.
// POH 13772-007 Fig 7-17 (7-73), 7-74–7-90; AMM 13773-002 Rev 7 31-40 PDF pp. 1326–1327; illustrative routing.
import { describe } from "vitest";
import { auditPathClearance, NEW_KEYS } from "./sr22t-avionics-path-clearance";

describe("SR22T avionics data, power and cooling paths", () => {
  auditPathClearance(NEW_KEYS.slice(0, 9));
});
