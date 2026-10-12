/** Dual magnetos, eight shielded plug leads and separate starting hardware. Geometry schematic.
 * POH 11934-005 7-39; AMM 12137-002 74-00 p. 1, 74-10 pp. 2–5, 74-20 pp. 1–2, 80-00 p. 1.
 */
import { TorusGeometry } from "three";
import { magAnim, plugAnim, sparkPhase } from "@/lib/anims";
import { box, cyl, mergeGeos } from "@/lib/geometry";
import { CRANK_Y, CYLS, MAGNETO, SLICKSTART, STARTER, plugMag } from "../engine-anchors";
import { fires, part } from "./catalogue";

for (const c of CYLS) {
  for (const level of ["U", "L"] as const) {
    const mag = plugMag(c, level);
    part(() => cyl(0.017, 0.06, "x", 10), ["engine"], {
      parent: "cyl:" + c.n,
      pos: [-0.12, level === "U" ? 0.065 : -0.065, c.s * 0.13],
      color: "#DADFE2",
      anim: plugAnim(fires(mag), sparkPhase(`${c.n}${level}`)),
      name: `Spark plug — cyl ${c.n} ${level === "U" ? "upper" : "lower"}`,
      note: `Fired by the ${mag === "R" ? "right" : "left"} magneto via its shielded ignition lead (POH 7-39; AMM 74-00 p. 1). Lead and plug dimensions approximate.`,
      groups: ["ignition"],
    });
  }
}
for (const mag of ["R", "L"] as const) {
  part(() => cyl(0.05, 0.13, "x"), ["engine"], {
    pos: MAGNETO(mag),
    color: "#3E4A52",
    anim: magAnim(fires(mag)),
    name: mag === "R" ? "Right magneto" : "Left magneto",
    note:
      (mag === "R"
        ? "Fires lower-right and upper-left plugs; carries the magnetic tachometer pickup. "
        : "Fires lower-left and upper-right plugs; the maintenance manual describes a retard breaker for starting. ") +
      "Engine-driven, self-contained ignition independent of the aircraft electrical supply after starting. The ignition key grounds the P-lead to inhibit a magneto (POH 7-37, 7-39; AMM 74-00 p. 1). Body and mounting coordinates approximate.",
    pin: true,
    groups: ["ignition"],
  });
  part(() => cyl(0.045, 0.014, "x"), ["engine"], {
    pos: [MAGNETO(mag)[0] - 0.068, MAGNETO(mag)[1], MAGNETO(mag)[2]],
    color: "#7A8790",
    name: "Magneto harness cap — " + mag,
    note: "Harness cap distributes the magneto's high voltage to its four shielded leads (AMM 74-10 p. 2, 74-20 pp. 1–2). Shape and routing approximate.",
    groups: ["ignition"],
  });
}
part(() => box(0.055, 0.07, 0.075), ["engine", "electrical"], {
  pos: SLICKSTART,
  color: "#825848",
  name: "SlickSTART magneto booster",
  pin: true,
  note: "Separate start booster mounted to the air/oil separator bracket on the firewall (AMM 74-10 pp. 4–5, 79-20 pp. 8–10). Energized in START, adds spark energy and changes starting timing; deactivated when the key returns to BOTH (POH 7-39). The POH says both magnetos are activated in START; AMM 74-00 p. 1 says the right is grounded and the left retard breaker supplies starting spark. This study animation follows the POH. Geometry approximate.",
  groups: ["ignition"],
});
part(() => mergeGeos([cyl(0.044, 0.15, "x"), cyl(0.018, 0.035, "x").translate(0.085, 0.04, 0)]), ["engine"], {
  pos: STARTER,
  color: "#4B5860",
  name: "Starter motor",
  pin: true,
  note: "Separate electric starter below the left side of the engine (AMM 80-00 p. 1; Lycoming IOM-IO-390-C Jan2017 System Description p. 3 Fig6; MM-IO-390-C 72-70p237 Fig7). The 2 A STARTER breaker on NON ESS BUS supplies the starting control circuit; it is not a two-amp motor feed. Starting needs BAT 1 in this model (POH 7-39; electrical Fig 7-10). Shape and exact installation coordinates approximate.",
  groups: ["ignition"],
});
part(() => new TorusGeometry(0.143, 0.012, 8, 48).rotateY(Math.PI / 2), ["engine"], {
  pos: [3.57, CRANK_Y, 0],
  color: "#7E898E",
  name: "Flywheel / starter ring gear",
  note: "Forward drive assembly shown at the crankshaft nose (AMM Fig 21-50-1 sheets 2–3; Lycoming MM-IO-390-C Jan2017 72-70p238 Fig8; IPC-IO-390-C Rev1 June2025 72-20 Fig7 pp16–17). Ring-gear envelope and starter engagement are schematic, not a measured gear-tooth model.",
  groups: ["ignition"],
});
