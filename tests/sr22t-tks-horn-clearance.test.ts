import { expect, it } from "vitest";
import { auditTksElevators } from "./sr22t-tks-horn-clearance";

it("TKS tip feeds stay connected and clear the elevator sweep (AMM 55-20 PDF 2243–2244; Fig 30-07-2 PDF 1222)", () => {
  // AMM 6-00 PDF 117 / 27-30 PDF 1016: up 25 +0/-1°, down 15 +/-1°.
  const audit = auditTksElevators([-16, -15, -10, -5, 0, 5, 10, 15, 20, 25]);
  console.info(
    `TKS sweep: fixed gap ${(audit.minimum * 1000).toFixed(2)} mm; hardware ${(audit.weightMinimum * 1000).toFixed(2)} mm; joint ${(audit.jointMaximum * 1000).toFixed(4)} mm`,
  );
  expect(audit.failures).toEqual([]);
}, 120000);
