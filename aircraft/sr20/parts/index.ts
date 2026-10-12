/**
 * Declarative catalogue of every modelled SR20 component, one file per system group.
 * Geometry is built lazily (browser only). Positions are in airplane coordinates unless the
 * part has a `parent`, in which case they are relative to that moving group.
 * - catalogue.ts — `CAT` and its label lists, the `part`/`shell`/`surface`/`onSurf` wrappers and the per-frame animation
 *   helpers the sections share (no parts)
 * - airframe.ts — fuselage, spinner, wing, trailing-edge, stabilizer and fin shells
 * - surfaces.ts — flaps, ailerons, elevator and rudder, and the details on them (wicks, horn balances, hinges, trim tabs)
 * - cowl.ts — cowl inlets
 * - gear.ts — main and nose gear, wheels, brakes, parking brake, rudder pedals / toe brakes
 * - engine.ts — propeller and engine: ignition, governor, oil, induction, exhaust, alternators, starter
 * - structure.ts — firewall, aft bulkhead, spar, roll cage, wing attach points
 * - cabin.ts — cockpit / cabin: panel, bolster switches, console, seats, side yokes and trim, flap drive and switch, fuel
 *   selector, CAPS handle, safety equipment
 * - electrical.ts — electrical hardware: MCU, batteries, ground power
 * - avionics.ts — avionics, antennas, magnetometer
 * - pitot.ts — pitot-static and stall warning
 * - fuel.ts — fuel system hardware
 * - environment.ts — environmental system
 * - caps.ts — CAPS canister and harness
 * - lights.ts — interior and exterior lights
 * - controls.ts — flight-control mechanisms (POH Figures 7-1, 7-2, 7-3)
 *
 * The sections are imported below in registration order. Part ids come from a running counter and the first part with a
 * given name gets the label pin, so keep this order, and never import a section from one that comes before it here.
 * Shared constants go in catalogue.ts.
 */
export { CAT, STALL_Z, chanOfKey, surfacePivot } from "./catalogue";
import "./airframe";
import "./surfaces";
import "./cowl";
export { MG, NOSE_CASTER, NOSE_GEAR } from "./gear";
export { CYLS, PROP, MUFFLER, OIL_FILTER } from "./engine";
import "./engine-ignition";
import "./engine-oil";
import "./engine-air";
import "./engine-installation";
import "./engine-sensors";
import "./structure";
export { FT, YOKES, YOKE_X, YOKE_Y } from "./cabin";
import "./doors";
import "./cockpit";
import "./electrical";
import "./avionics";
export { PITOT_Z, SPX, pitotBase, statR } from "./pitot";
import "./fuel";
export { TANK_CHORD, TANK_SPAN } from "./fuel";
import "./environment";
import "./aircon";
export { CAPS_BOX, HARNESS, ROCKET_T, TAUT_T, strapOut, strapPeel } from "./caps";
export { LIGHTS } from "./lights";
import "./controls";
import "./controls-trim";
import "./electrical-harness";
import "./walk-inspection";

export { FIN } from "../geometry";
export type { PartSpec } from "@/lib/catalogue";
