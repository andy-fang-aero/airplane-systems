// Existing OAT 2 outcome assertion moved from sr22t-depth-avionics-paths.test.ts to keep per-file runtime down.
// POH 13772-007 7-75; AMM 13773-002 Rev 7 Fig 34-10-6 PDF p. 1666; illustrative routing.
import { describe } from "vitest";
import { auditPathClearance } from "./sr22t-avionics-path-clearance";

describe("SR22T avionics data, power and cooling paths", () => {
  auditPathClearance(["oatData2"]);
});
