/** Airframe shells: fuselage, spinner, wings, trailing edges, stabilizers and fin. */
import * as THREE from "three";
import { CRANK_Y } from "../engine-datum";
import {
  SPINNER_BASE_X,
  SPINNER_BASE_RADIUS,
  EF,
  HZ,
  WR,
  finCut,
  finHs,
  finSec,
  fuselageGeo,
  loft,
  stabSec,
  tubeGeo,
  wingSec,
} from "../geometry";
import { part, shell, sided } from "./catalogue";
import { stallStripPath, STALL_STRIP_RADIUS } from "../stall-strip-layout";
import { useSR22T } from "../store";

/* ---------- airframe shells ---------- */
shell(
  fuselageGeo,
  "Fuselage",
  "Composite monocoque with integral roll cage. Cabin runs from the firewall (FS 100) to the aft baggage bulkhead (FS 222).",
  true,
);
shell(
  () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector2(SPINNER_BASE_RADIUS * Math.sqrt(1 - t * t * 0.97), t * 0.42));
    }
    const g = new THREE.LatheGeometry(pts, 32);
    g.rotateZ(-Math.PI / 2);
    // AMM 13773-002 Rev 7 61-10 p. 1 (PDF 2438): the dome attaches to the rear prop-hub bulkhead.
    // Follow the registered crank/prop axis, rather than the copied airframe WL 100 datum.
    g.translate(SPINNER_BASE_X, CRANK_Y, 0);
    return g;
  },
  "Spinner",
  "Spinner dome on a bulkhead at the rear of the hub, coaxial with the crankshaft (AMM 13773-002 Rev 7 61-10 p. 1, PDF 2438). Size and scene registration approximate.",
);
const wingSpanSt = [WR, 0.9, 1.6, 2.4, 3.2, 4.0, 4.6, 5.2, 5.45, 5.55, 5.65, 5.72, 5.78, 5.84];
[1, -1].forEach((s) => {
  shell(
    () =>
      loft(
        sided(
          wingSpanSt.map((z) => wingSec(s * z, 0, 0.75)),
          s,
        ),
      ),
    s > 0 ? "Right wing" : "Left wing",
    "Composite torsion box: carbon spar, ribs and bonded skins. Holds a 47.25 gal integral fuel tank (46 gal usable) and the main gear.",
  );
  [
    [WR, 0.94],
    [3.62, 3.68],
    [5.0, 5.2, 5.45, 5.55, 5.65, 5.72, 5.78, 5.84],
  ].forEach((st) =>
    shell(
      () =>
        loft(
          sided(
            st.map((z) => wingSec(s * z, 0.75, 1)),
            s,
          ),
        ),
      "Wing trailing edge",
      "",
    ),
  );
  shell(
    () =>
      loft(
        sided(
          [0, 0.3, 1.0, 1.7, HZ].map((z) => stabSec(s * z, 0, EF)),
          s,
        ),
      ),
    "Horizontal stabilizer",
    "Single composite structure tip to tip.",
  );
});
shell(
  () => loft(finHs.map((h) => finSec(h, 0, finCut(h)))),
  "Vertical stabilizer",
  "Composite, integral with the fuselage shell; swept leading edge blends into a dorsal fillet.",
);

// Every SR22T has both strips; FIKI replaces only the inboard one (AMM Fig 57-20-2, PDF 2389).
for (const side of [-1, 1]) {
  const label = side < 0 ? "Left" : "Right";
  for (const section of ["inboard", "outboard"] as const) {
    const fitted = section === "inboard" ? () => !useSR22T.getState().s.equip.fiki : undefined;
    part(() => tubeGeo(stallStripPath(side, section), STALL_STRIP_RADIUS), ["airframe"], {
      name: `${label} ${section} stall strip`,
      note: `Plain ${section} stall strip on the wing leading edge (AMM 13773-002 Rev 7 57-20, PDF 2378; Fig 57-20-2 Detail ${section === "inboard" ? "B" : "A"}, PDF 2389; POH 13772-007 preflight 4-7, 4-9). ${section === "inboard" ? "Replaced by the porous strip with FIKI." : "Present with or without FIKI."} Span, size and round tube depiction approximate.`,
      ext: true,
      pin: true,
      fitted,
      anim: fitted
        ? (m) => {
            m.visible = fitted();
          }
        : undefined,
    });
  }
}
