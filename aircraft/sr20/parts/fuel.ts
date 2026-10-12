/** SR20 G6 storage and airframe fuel distribution; POH 11934-005 and AMM 12137-002 Rev A1. */
import { mergeGeos } from "@/lib/geometry";
import { V, toVec3, type Vec3 } from "@/lib/math";
import { FW, botY, box, cyl, loft, tubeGeo, wingP, wingSec } from "../geometry";
import { part, sided } from "./catalogue";

/** Tank bounds are approximate; skins, spar, aft shear web and fuel ribs bound the wet bay
 * (AMM 12137-002 Rev A1 28-10 p. 1). Forward bound follows the model's main spar. */
export const TANK_SPAN = [0.95, 4.5] as const;
export const TANK_CHORD = [0.3, 0.6] as const;
export const COLLECTOR = (s: number) => toVec3(wingP(s * 0.72, 0.45, 0));
export const FLAPPER = (s: number) => toVec3(wingP(s * 0.84, 0.45, 0));
export const TANK_STRAINERS = (s: number): Vec3[] => [0.37, 0.53].map((xc) => toVec3(wingP(s * TANK_SPAN[0], xc, 0)));
export const NACA_FUEL_VENT = (s: number) => toVec3(wingP(s * 5.1, 0.45, -1).add(V(0, -0.006, 0)));
/** Vent connections to the tank and collector tops; fraction follows the rendered tank thickness. */
export const tankTop = (s: number, span: number = TANK_SPAN[0]) =>
  toVec3(wingP(s * span, 0.45, 0).lerp(wingP(s * span, 0.45, 1), 0.85));
export const collectorTop = (s: number): Vec3 => {
  const p = COLLECTOR(s);
  return [p[0], p[1] + 0.035, p[2]];
};

[1, -1].forEach((s) => {
  part(() => box(0.2, 0.07, 0.16), ["fuel"], {
    pos: COLLECTOR(s),
    name: (s > 0 ? "Right" : "Left") + " collector tank / sump",
    note: "Integral collector at the inboard wing root: about 2.8 gal (10.6 L), within the airplane's stated capacity. Collects sediment/water and retains fuel during uncoordinated maneuvering through a swing-check flapper (AMM 12137-002 Rev A1 28-10 p. 1; POH 11934-005 7-41). Size and station approximate.",
    pin: true,
  });
  part(() => box(0.08, 0.012, 0.12), ["fuel"], {
    pos: NACA_FUEL_VENT(s),
    color: "#2F7FE6",
    name: "NACA fuel vent",
    note: "Independent vent for each tank, in a lower-wing access panel near the tip. Keeps positive pressure in the tank; blockage can cause decreasing fuel flow, starvation and engine stoppage (POH 11934-005 7-41; AMM 12137-002 Rev A1 28-10 pp. 1–2). Position approximate.",
    ext: true,
    pin: s < 0,
  });
  part(() => cyl(0.018, 0.012), ["fuel"], {
    pos: toVec3(wingP(s * 1.3, 0.3, -1)),
    color: "#0B3A80",
    name: "Tank drain",
    note: "At the integral tank's inboard access panel. One of five fuel drains: two tank, two collector and one gascolator; sample all before every flight (POH 11934-005 7-42, 8-17; AMM 12137-002 Rev A1 28-10 p. 2). Station and dimensions approximate.",
    ext: true,
  });
  const cap = toVec3(wingP(s * 2.7, 0.38, 1));
  part(() => cyl(0.045, 0.012), ["fuel"], {
    pos: cap,
    color: "#2F7FE6",
    name: "Filler cap",
    note: "Forward slope of each wing: 28 gal usable per tank, 56 gal usable total; filling to the tab gives 13 gal usable per side. Viton o-ring; approximately 100 ohm resistive bonding to the airframe (POH 11934-005 7-41, 8-15; AMM 12137-002 Rev A1 28-10 p. 1).",
    ext: true,
  });
  part(() => cyl(0.038, 0.055), ["fuel"], {
    pos: [cap[0], cap[1] - 0.038, cap[2]],
    name: "Fuel filler neck",
    note: "Filler neck with the reduced-fuel tab integrated below the cap. Tab indicates 13.0 gal usable (49.2 L) per tank (POH 11934-005 7-41; AMM 12137-002 Rev A1 28-10 p. 1). Neck size and tab height illustrative.",
    fairing: true,
  });
  part(() => box(0.025, 0.004, 0.028), ["fuel"], {
    pos: [cap[0], cap[1] - 0.045, cap[2]],
    name: "Reduced-fuel tab",
    note: "Visible below the filler: 13 gal usable per side, 26 gal usable total in all flight conditions. This is a servicing level, not a separate reserve tank (POH 11934-005 7-41; AMM 12137-002 Rev A1 28-10 p. 1). Tab size and height illustrative.",
    pin: s < 0,
  });
  part(() => cyl(0.018, 0.012), ["fuel"], {
    pos: toVec3(wingP(s * 0.72, 0.45, -1)),
    name: "Collector drain",
    note: "Flush drain at the collector's low point. Push inward with the sampler to check for water and sediment. One of five fuel drains (POH 11934-005 7-42, 8-17; AMM 12137-002 Rev A1 28-10 pp. 1–2). Size and position approximate.",
    ext: true,
    pin: s < 0,
  });
  TANK_STRAINERS(s).forEach((pos, i) =>
    part(() => cyl(0.022, 0.075, "z"), ["fuel"], {
      pos,
      name: "Tank outlet strainer",
      note: "One of two 1/16-inch mesh stainless-steel strainers at the tank's inboard-rib ports. Accessible through the inboard tank cover; filters gravity feed toward the collector (AMM 12137-002 Rev A1 28-10 p. 1). Shape, spacing and size approximate.",
      pin: i === 0 && s < 0,
    }),
  );
  part(() => cyl(0.026, 0.06, "z"), ["fuel"], {
    pos: FLAPPER(s),
    name: "Flapper valve",
    note: "Swing-check assembly between tank and collector: retains collector fuel during uncoordinated maneuvering (POH 11934-005 7-41; AMM 12137-002 Rev A1 28-10 p. 1). No separate return-to-tank circuit is modelled for the Lycoming IO-390. Position and dimensions approximate.",
    pin: s > 0,
  });
  [2.1, 3.3].forEach((z, i) =>
    part(
      () => {
        const center = wingP(s * z, 0.45, 0);
        return loft(
          sided(
            [z - 0.008, z + 0.008].map((az) => wingSec(s * az, ...TANK_CHORD, 0.8).map((p) => p.sub(center))),
            s,
          ),
        );
      },
      ["fuel"],
      {
        pos: toVec3(wingP(s * z, 0.45, 0)),
        name: "Fuel baffle rib",
        note: "Two integral baffle ribs per tank reduce slosh (AMM 12137-002 Rev A1 28-10 p. 1). Stations, solid shape and thickness approximate; lightening openings omitted.",
        plate: true,
        pin: i === 0 && s > 0,
      },
    ),
  );
  TANK_SPAN.forEach((z, i) => {
    const inward = i === 0 ? s : -s;
    part(
      () =>
        mergeGeos([
          cyl(0.035, 0.015, "z"),
          tubeGeo([V(0, 0, 0), V(0, -0.035, inward * 0.07), V(0.06, -0.035, inward * 0.16)], 0.005),
          cyl(0.018, 0.06, "x").translate(0.06, -0.035, inward * 0.16),
        ]),
      ["fuel"],
      {
        pos: toVec3(wingP(s * z, 0.48, 0)),
        name: i === 0 ? "Fuel quantity sensor (inboard)" : "Fuel quantity sensor (outboard)",
        note: `Float-type sender on the ${i === 0 ? "inboard" : "outboard"} fuel rib, two per tank. Sends measured level to GEA 71; the independent totalizer instead integrates fuel flow from its pilot-entered starting quantity. 5 A FUEL QTY on MAIN BUS 1 per POH Hour Meters; AMM says 3 A, so the POH governs (POH 11934-005 7-44–7-45, 7-95; AMM 12137-002 Rev A1 28-40 pp. 1–2, Fig 28-40-2 p. 10). Float pose, rib stations and dimensions illustrative.`,
        pin: s < 0,
      },
    );
  });
});

// Import-free airframe fuel anchors. The engine pump/servo/divider are registered in engine.ts.
export const FUEL_SELECTOR: Vec3 = [1.24, -0.28, 0];
export const FUEL_PUMP: Vec3 = [FW + 0.07, -0.43, 0.22];
export const GASCOLATOR: Vec3 = [FW + 0.09, -0.52, 0.08];
export const FIREWALL_FUEL: Vec3 = [FW - 0.035, -0.6, 0.15];
export const DRAIN_MANIFOLD: Vec3 = [FW + 0.07, -0.61, 0];
export const GASCOLATOR_DRAIN: Vec3 = [FW + 0.07, botY(FW + 0.07) - 0.008, 0];
export const INDUCTION_DRAIN_CHECK: Vec3 = [3.07, -0.47, 0];
part(() => box(0.1, 0.08, 0.1), ["fuel"], {
  pos: FUEL_PUMP,
  name: "Electric boost pump",
  note: "Forward side of firewall. Single-speed: continuous 23 psi boost for priming, hot-fuel vapor suppression and emergency engine-pump backup. 28 VDC through 5 A FUEL PUMP on MAIN BUS 2 (POH 11934-005 7-42; AMM 12137-002 Rev A1 28-20 p. 1, Fig 28-20-2 p. 9). Position and dimensions approximate.",
  pin: true,
});
part(() => cyl(0.045, 0.1), ["fuel"], {
  pos: GASCOLATOR,
  name: "Gascolator",
  note: "Forward firewall, downstream of electric pump and upstream of engine pump: 100–140 micron filtration, 4.9 fl oz (144.89 mL) bowl. Bowl drains through a tube to the preflight drain valve. Clean filtration screen after the first 25 hours, then every 50 hours or as conditions dictate (AMM 12137-002 Rev A1 28-20 p. 1, Fig 28-20-1 p. 5; POH 11934-005 8-16). Station and dimensions approximate.",
  pin: true,
});
part(() => cyl(0.028, 0.045), ["fuel"], {
  pos: [GASCOLATOR[0], GASCOLATOR[1] + 0.015, GASCOLATOR[2]],
  name: "Gascolator filter screen",
  note: "Removable screen retained in the gascolator base, above the sump bowl. 100–140 micron filtration; retaining ring and bowl o-ring shown separately in AMM Fig 28-20-1 (AMM 12137-002 Rev A1 28-20 pp. 1, 3–5). Shape and size illustrative.",
});
part(() => box(0.18, 0.16, 0.18), ["fuel"], {
  pos: [1.24, -0.36, 0],
  name: "Selector valve enclosure",
  note: "Vented and drained enclosure around cabin fittings isolates selector leakage from the cabin; selector permits only LEFT, RIGHT or OFF, with positive detents and a lift release for OFF (POH 11934-005 7-42; AMM 12137-002 Rev A1 28-00 p. 1, 28-20 pp. 1–2). Body and station approximate.",
  fairing: true,
  pin: true,
});
part(() => box(0.05, 0.14, 0.18), ["fuel"], {
  pos: FIREWALL_FUEL,
  name: "Firewall fuel enclosure",
  note: "Aft-side firewall enclosure prevents fuel leaking from cabin fittings into the cabin. Cabin fittings are vented and drained (AMM 12137-002 Rev A1 28-00 p. 1, 28-20 p. 2). Shape and station approximate; supply passes through this enclosure.",
  fairing: true,
  pin: true,
});
part(() => cyl(0.02, 0.09), ["fuel", "engine"], {
  pos: DRAIN_MANIFOLD,
  name: "Drain manifold",
  note: "Bottom centre of firewall: receives electric-pump, gascolator, engine-pump and induction-plenum drain hoses (AMM 12137-002 Rev A1 28-20 p. 2). The drain plumbing is drawn static; it is not a continuously flowing fuel supply. Position and size approximate.",
  pin: true,
});
part(() => cyl(0.013, 0.025), ["fuel"], {
  pos: GASCOLATOR_DRAIN,
  name: "Gascolator drain",
  note: "One of five sampling drains. Exits lower engine cowl just forward of firewall near centreline; connected to gascolator bowl by drain tube (POH 11934-005 7-42, 8-17; AMM 12137-002 Rev A1 Fig 28-20-1 p. 5). Shape and placement approximate.",
  ext: true,
  pin: true,
});
part(() => cyl(0.012, 0.035), ["fuel", "engine"], {
  pos: INDUCTION_DRAIN_CHECK,
  name: "Induction drain check valve",
  note: "On the induction plenum drain: closes when manifold pressure is below ambient to prevent loss of manifold pressure; drain hose leads to firewall drain manifold (AMM 12137-002 Rev A1 28-20 p. 2). Position and dimensions approximate.",
});
