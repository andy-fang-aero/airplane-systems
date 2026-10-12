import { SYS as sr20 } from "@/aircraft/sr20/systems";
import { SYS as sr22t } from "@/aircraft/sr22t/systems";
import { SYS as c172s } from "@/aircraft/c172s/systems";
import { SYS as c182t } from "@/aircraft/c182t/systems";
import { SYS as da40 } from "@/aircraft/da40/systems";
import { SYS as m20c } from "@/aircraft/m20c/systems";
import { AIRCRAFT_IDS, type AircraftId, type SysDef } from "./systems";

export const VIEW_SYSTEMS: Record<AircraftId, readonly SysDef[]> = { sr20, sr22t, c172s, c182t, da40, m20c };

/** Known view URLs for the static host's offline tests; / uses its default root object. */
export const VIEW_PATHS = [
  "/",
  ...AIRCRAFT_IDS.flatMap((ac) => [`/${ac}`, ...VIEW_SYSTEMS[ac].map((sys) => `/${ac}/${sys.id}`)]),
];
