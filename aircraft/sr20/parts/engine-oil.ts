/** SR20 wet-sump lubrication and propeller oil. POH 11934-005 7-38, 7-40; AMM 12137-002 ATA 61, 79. */
import { box, cyl, mergeGeos } from "@/lib/geometry";
import {
  GOVERNOR,
  OIL_COOLER,
  OIL_CONTROL,
  OIL_FILTER,
  OIL_PUMP,
  OIL_RELIEF,
  OIL_SCREEN,
  OIL_SEPARATOR,
  OIL_SUMP,
} from "../engine-anchors";
import { part } from "./catalogue";

part(() => box(0.55, 0.12, 0.26), ["engine"], {
  pos: OIL_SUMP,
  color: "#67757B",
  name: "Oil sump",
  pin: true,
  note: "Seven-quart wet sump below the crankcase. The oil supplies lubrication, piston cooling and the propeller governor (POH 7-38; AMM 79-00 p. 1). Shape and size approximate.",
  groups: ["oil"],
});
part(() => cyl(0.023, 0.05, "x"), ["engine"], {
  pos: OIL_SCREEN,
  color: "#BEA86B",
  name: "Oil suction screen",
  pin: true,
  note: "Suction strainer at the rear of the sump, accessed through its rear plug (POH 7-38; AMM 79-00 p. 1). Filters the pickup before oil is sent through the cooler and full-flow filter. Geometry approximate.",
  groups: ["oil"],
});
part(() => box(0.052, 0.045, 0.06), ["engine"], {
  pos: OIL_PUMP,
  color: "#897348",
  name: "Engine oil pump",
  note: "Oil pump mounted inside the rear accessory housing; a drive shaft turns its paired impellers (Lycoming MM-IO-390-C Jan 2017 72-25 p. 174, Figs 3–4; IOM System Description p. 5). The internal pickup and pumping route and exterior box explain circulation schematically; dimensions are approximate.",
  pin: true,
  groups: ["oil"],
});
part(() => box(0.08, 0.16, 0.12), ["engine"], {
  pos: OIL_COOLER,
  color: "#9A6A48",
  name: "Oil cooler",
  pin: true,
  note: "Remote-mounted cooler with feed and return hoses, diffuser and mounting bracket (POH 7-38; AMM 79-20 pp. 2–7, Fig 79-20-1). The AMM distinguishes standard and hot-weather installations; this represents the standard system. Cooler and diffuser coordinates approximate.",
  groups: ["oil"],
});
part(() => box(0.12, 0.12, 0.018), ["engine"], {
  pos: [OIL_COOLER[0], OIL_COOLER[1] - 0.03, OIL_COOLER[2] - 0.07],
  color: "#71808A",
  name: "Oil cooler diffuser / bracket",
  note: "Directs cooling air through and supports the remote oil cooler (AMM 79-20 Fig 79-20-1). Simplified plate envelope; its shape is approximate.",
  groups: ["oil"],
});
part(() => cyl(0.021, 0.035, "x"), ["engine"], {
  pos: OIL_CONTROL,
  color: "#D1AD59",
  name: "Oil cooler bypass valve",
  pin: true,
  note: "The POH describes cooler pressure-relief and temperature control: bypass below 170 °F or when cooler pressure drop exceeds 18 psi (POH 7-38). The Lycoming manual places the thermostatic valve in the oil-filter base (MM-IO-390-C Jan 2017 72-50 p. 222, Fig 9), represented here beside the filter. Its generic cooler specifications differ from the SR20 POH values; the POH governs these displayed values. Valve and coordinates schematic.",
  groups: ["oil"],
});
part(() => cyl(0.045, 0.11, "x"), ["engine"], {
  pos: OIL_FILTER,
  color: "#1F3A5A",
  name: "Oil filter (full-flow)",
  pin: true,
  note: "The POH oil route is suction screen → remote cooler or bypass → full-flow filter → pressure relief → oil galleries (POH 7-38). AMM 79-20 p. 2 refers servicing to the Lycoming engine manual. Canister size and mounting coordinates approximate.",
  groups: ["oil"],
});
part(() => cyl(0.017, 0.038, "z"), ["engine"], {
  pos: OIL_RELIEF,
  color: "#D1AD59",
  name: "Oil pressure relief valve",
  note: "Bypass or cooled oil passes through pressure relief before the engine galleries in the POH description (POH 7-38). Lycoming describes a spring and ball in the crankcase (MM-IO-390-C Jan 2017 72-50 p. 221, Figs 4–5). Internal valve represented schematically; no calibrated pressure simulation or measured installation is implied.",
  pin: true,
  groups: ["oil"],
});
part(() => mergeGeos([cyl(0.026, 0.017), cyl(0.006, 0.29).translate(0, -0.14, 0)]), ["engine"], {
  pos: [2.88, 0.09, 0.27],
  color: "#D1AD59",
  name: "Oil filler cap / dipstick",
  pin: true,
  note: "Right rear of the engine, reached through the top-right cowling access door (POH 7-38; AMM 79-30 p. 1). POH preflight calls for 6–7 quarts (4-7). Shape and coordinates approximate.",
  groups: ["oil"],
});
part(() => cyl(0.016, 0.025), ["engine"], {
  pos: [3.12, -0.453, 0],
  color: "#D1AD59",
  name: "Sump quick-drain valve",
  note: "Quick drain at the bottom of the engine oil sump (AMM 79-00 p. 1). Shape and position approximate.",
  groups: ["oil"],
});
part(() => cyl(0.032, 0.083), ["engine"], {
  pos: OIL_SEPARATOR,
  color: "#B6B8A9",
  name: "Air/oil separator",
  pin: true,
  note: "Mounted to a firewall bracket which also carries the separate magneto booster. Supply line, oil return line and overboard breather hose are distinct connections (AMM 79-20 pp. 8–10, Fig 79-20-2; 74-10 pp. 4–5). Shape and exact routing approximate.",
  groups: ["oil"],
});
part(() => box(0.015, 0.13, 0.12), ["engine"], {
  pos: [2.625, 0.015, 0.285],
  color: "#6E7E88",
  name: "Air/oil separator and booster bracket",
  note: "Common bracket attached to the firewall for the air/oil separator and magneto booster (AMM 79-20 pp. 8–10, 74-10 pp. 4–5). Schematic envelope.",
  groups: ["oil", "ignition"],
});
part(() => mergeGeos([box(0.035, 0.025, 0.1), cyl(0.035, 0.105).translate(0, 0.06, 0)]), ["engine", "propeller"], {
  pos: GOVERNOR,
  color: "#C0602F",
  name: "Propeller governor",
  pin: true,
  note: "Upper left forward crankcase (AMM 61-20 p. 1). Flyweights sense RPM; a cable from the power lever sets the target. Boosted engine oil moves the hub piston toward high pitch; draining oil allows low pitch (POH 7-40; AMM 61-10 p. 1). The C3B6 front governor differs from the C3A6 rear governor (Lycoming IOM-IO-390-C Jan 2017 System Description p. 1). Shape and mounting coordinates approximate.",
  groups: ["oil"],
});

part(() => box(0.07, 0.075, 0.07), ["engine"], {
  pos: [2.9, -0.045, 0.16],
  color: "#718086",
  name: "Oil filter base / thermostat housing",
  groups: ["oil"],
  note: "The full-flow filter and thermostatic bypass valve attach to the oil filter base (Lycoming MM-IO-390-C Jan2017 72-50p222 Fig9; IPC-IO-390-C Rev1 June2025 72-60 Fig24 pp58–59). Mounting shape and coordinates approximate.",
});
