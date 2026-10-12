/** Narrow preflight inspection regions. Imported last so all existing component ids remain stable. */
import { toVec3 } from "@/lib/math";
import { cutCowlInlets } from "@/lib/cowl";
import { useView } from "@/lib/view";
import { COWL_INLETS } from "../../cowl-inlets";
import { FUSE, FW, WR, loft, tubeGeo, wingP, wingSec } from "../geometry";
import { part, sided } from "./catalogue";

/** The skin already draws these regions; expose their overlay only while that region is spotlighted. */
const inspectionOnly = (name: string, side: number) => (mesh: { visible: boolean }) => {
  const spot = useView.getState().spot;
  mesh.visible = !!spot?.names.includes(name) && (!spot.side || spot.side === side);
};

for (const side of [1, -1]) {
  part(
    () =>
      loft(
        sided(
          [5.55, 5.65, 5.78, 5.81, 5.83, 5.84].map((z) => wingSec(side * z, 0, 1, 1.01)),
          side,
        ),
      ),
    ["airframe"],
    {
      name: "Wing tip",
      note: "Composite removable wing tip engages mounting clips and is secured by screws; disconnect its light harness and ground straps for removal (AMM 12137-002 Rev A1 57-20 pp. 1–4, Fig 57-20-1). This narrow preflight overlay follows the model's rounded tip skin; its inboard boundary and slight skin offset are approximate display choices.",
      fairing: true,
      ext: true,
      anim: inspectionOnly("Wing tip", side),
    },
  );
  part(
    () =>
      loft(
        sided(
          [0.65, 0.9, 1.6, 2.4, 3.2, 4, 4.6, 5.2, 5.55].map((z) => wingSec(side * z, 0, 0.035, 1.01)),
          side,
        ),
      ),
    ["airframe"],
    {
      name: "Wing leading edge",
      note: "Inspect the composite leading edge and stall-strip attachment/condition (POH 11934-005 4-7, 4-9; AMM 12137-002 Rev A1 57-20 p. 1). This narrow preflight overlay follows the leading 3.5% of the model's wing chord; its width and slight skin offset are display choices, not aircraft dimensions.",
      fairing: true,
      ext: true,
      anim: inspectionOnly("Wing leading edge", side),
    },
  );
  const strip = [0.95, 1.1, 1.25].map((z) => {
    const p = wingP(side * z, 0);
    p.x += 0.006;
    return toVec3(p);
  });
  part(() => tubeGeo(strip, 0.009), ["airframe"], {
    name: "Stall strips",
    note: "Stall strips on the inboard leading edge of the wing cuffs on both wings promote a more gradual stall and prolong aileron effectivity (AMM 12137-002 Rev A1 57-20 p. 1). The SR20 manual does not dimension their station, length or section: this short round depiction is schematic, not the SR22T outboard/porous-strip installation. Missing strips render the airplane unairworthy; removal/installation requires Cirrus disposition (57-20 p. 5). Inspect condition on preflight (POH 11934-005 4-7, 4-9).",
    color: "#454A4F",
    solidColor: "#454A4F",
    ext: true,
  });
}

/** The visible upper-wing/fuselage intersection; the highlight is a ribbon on the existing wing skin. */
const wingRootSpan = (xc: number) => {
  let inside = WR,
    outside = 1;
  for (let i = 0; i < 20; i++) {
    const z = (inside + outside) / 2;
    if (FUSE.inside(wingP(z, xc, 1))) inside = z;
    else outside = z;
  }
  return outside;
};

// Append after the six existing inspection parts: their ids and all earlier component ids remain stable.
for (const side of [1, -1]) {
  part(
    () =>
      loft(
        sided(
          Array.from({ length: 25 }, (_, i) => {
            const xc = 0.02 + (0.96 * i) / 24,
              root = wingRootSpan(xc);
            return [0, 0.045, 0.09, 0.135, 0.18].map((offset) => {
              const p = wingP(side * (root + offset), xc, 1);
              p.y += 0.002; // approximate: highlight offset, not fairing thickness
              return p;
            });
          }),
          side,
        ),
        { closed: false, caps: false },
      ),
    ["airframe"],
    {
      name: "Wing/fuselage fairing",
      note: "Check the wing/fuselage fairing (POH 11934-005 4-6). The model blends this junction into its wing and fuselage skins; this narrow highlight follows their visible upper-surface intersection. Its 0.18 m width and 2 mm skin offset are approximate display choices, not a separate fairing or measured attachment hardware.",
      fairing: true,
      ext: true,
      anim: inspectionOnly("Wing/fuselage fairing", side),
    },
  );
  part(
    () => {
      const arcStart = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const patch = loft(
        Array.from({ length: 25 }, (_, i) => {
          const x = FUSE.xNose - ((FUSE.xNose - FW) * i) / 24;
          // An open loft has no cap-volume correction; decreasing angle faces the nose-to-aft skin outward.
          return FUSE.ring(x, 1.006, 24, arcStart, arcStart + Math.PI, false).reverse();
        }),
        { closed: false, caps: false },
      );
      return cutCowlInlets(patch, COWL_INLETS.sr20);
    },
    ["airframe"],
    {
      name: "Cowling inspection region",
      note: "Cowling attachments must be secure (POH 11934-005 4-7, 4-8). This highlight follows only the model's cowling ahead of its firewall, on the inspected side, retaining the open inlet apertures. The shell blends into the fuselage; highlight boundaries and the 0.6% skin offset are approximate display choices, not separate fasteners or surveyed cowl geometry.",
      fairing: true,
      ext: true,
      anim: inspectionOnly("Cowling inspection region", side),
    },
  );
}
