/** Individual four-cylinder indication sensors; POH 11934-005 7-37–7-38; AMM12137-002 ATA73/77/79. */
import { cyl } from "@/lib/geometry";
import {
  CYLS,
  ENGINE_HARNESS,
  MAGNETO,
  MAP_SENSOR,
  MAT_SENSOR,
  OIL_PRESSURE,
  OIL_TEMP,
  cylPoint,
  egtPoint,
} from "../engine-anchors";
import { part } from "./catalogue";
import { box } from "../geometry";

for (const c of CYLS) {
  part(() => cyl(0.011, 0.028), ["engine", "avionics"], {
    pos: cylPoint(c, [0.035, -0.108, c.s * 0.13]),
    color: "#79A5BD",
    name: "CHT sensor — cyl " + c.n,
    note: "One temperature sensor in each cylinder head; independent signal to GEA 71 for four CHT bars (POH 7-37; AMM 77-20 pp. 1, 6–8). Probe size and exact head port approximate.",
    groups: ["sensors"],
  });
  part(() => cyl(0.009, 0.052, "z"), ["engine", "avionics"], {
    pos: egtPoint(c),
    color: "#79A5BD",
    name: "EGT probe — cyl " + c.n,
    note: "One probe penetrates each cylinder's exhaust pipe before the collector; four EGT signals feed GEA 71 (POH 7-37; AMM 77-20 pp. 4–5, Fig 77-20-2). Size and distance below the port approximate.",
    groups: ["sensors"],
  });
}
for (const item of [
  {
    name: "MAP sensor",
    pos: MAP_SENSOR,
    axis: "y" as const,
    note: "Mounted on the bottom of the induction manifold near the throttle body (POH 7-38); AMM 77-10 p. 1 describes aft right underside of the plenum. Sends pressure to GEA 71. Port placement and body approximate.",
  },
  {
    name: "MAT sensor",
    pos: MAT_SENSOR,
    axis: "z" as const,
    note: "Manifold air temperature probe in the induction manifold; used in the target fuel-flow calculation and percent-power indication (POH 4-20; AMM 77-20 p. 1). Port and body placement approximate.",
  },
  {
    name: "Oil pressure sensor",
    pos: OIL_PRESSURE,
    axis: "y" as const,
    note: "Aft engine near the right magneto, signals GEA 71 (POH 7-37–7-38; AMM 79-30 p. 1). AMM Fig 79-30-2 distinguishes direct-mounted and remote-mounted sensors; this depicts direct mounting. Shape and coordinates approximate.",
  },
  {
    name: "Oil temperature sensor",
    pos: OIL_TEMP,
    axis: "x" as const,
    note: "Rear engine case just forward of the oil filter; signals GEA 71 (POH 7-37; AMM 79-30 p. 1, Fig 79-30-3). Shape and exact mounting coordinates approximate.",
  },
  {
    name: "Tachometer pickup",
    pos: [MAGNETO("R")[0], MAGNETO("R")[1] + 0.06, MAGNETO("R")[2]] as [number, number, number],
    axis: "y" as const,
    note: "Magnetic speed pickup screwed into the right magneto, separate from its ignition P-lead; signals GEA 71 (POH 7-37; AMM 77-10 pp. 1–3, Fig 77-10-1). Dimensions and clocking approximate.",
  },
]) {
  part(() => cyl(0.013, 0.037, item.axis), ["engine", "avionics"], {
    pos: item.pos,
    color: "#79A5BD",
    name: item.name,
    note: item.note,
    pin: true,
    groups: ["sensors"],
  });
}
part(() => box(0.023, 0.07, 0.05), ["engine", "avionics"], {
  pos: ENGINE_HARNESS,
  color: "#79A5BD",
  name: "Engine sensor harness / firewall connector",
  pin: true,
  note: "Engine probes connect through the firewall-forward harness to the GEA 71 Engine Airframe Unit. The display acquires sensor data; it does not generate the magnetos' ignition power (POH 7-35, 7-37–7-38; AMM 71-50 pp. 1–2, 77-40 p. 1). Representative connector; routing approximate.",
  groups: ["sensors"],
});
