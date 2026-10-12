"use client";
import type { Vec3 } from "@/lib/math";
import type { Chan } from "@/lib/systems";
import { useView } from "@/lib/view";
import { live } from "../model";
import { CAT } from "../parts";
import { useSR20 } from "../store";
import { SYS } from "../systems";
import {
  BtnRow,
  Caution,
  Check,
  Ctl,
  Facts,
  H3,
  Notes,
  PartsList,
  Readouts,
  Seg,
  Slider,
  useTicker,
} from "@/components/ui/controls";

const dir = (v: number, pos: string, neg: string, mid: string, dz = 0.02) => (v > dz ? pos : v < -dz ? neg : mid);

/** Camera framing for each control channel. */
const CHAN_CAM: Record<Chan, [Vec3, Vec3]> = {
  elevator: [
    [-1.6, 2.4, -10.2],
    [-0.6, -0.35, 0],
  ],
  aileron: [
    [-4.2, 10.5, 0.4],
    [0.4, -0.4, 0],
  ],
  rudder: [
    [-1.6, 2.4, 10.2],
    [-0.6, -0.35, 0],
  ],
};

const RUNS: Record<Chan, { fig: string; steps: string[] }> = {
  elevator: {
    fig: "POH Figure 7-1",
    steps: [
      "Pulling a yoke slides its tube aft in a bearing carriage.",
      "A drop link from each yoke tube rotates a lever on the lateral elevator torque tube under the panel.",
      "The forward sector on that torque tube drives a crossed cable pair down to the forward double pulley under the floor.",
      "A single cable loop runs aft under the cabin floor, over the intermediate double pulley and past the turnbuckles, to the aft sector pulley in the tailcone.",
      "A push-pull tube from the aft sector pulley moves the elevator bellcrank between the two elevator halves.",
    ],
  },
  aileron: {
    fig: "POH Figure 7-2",
    steps: [
      "Turning a yoke rotates it in its pivoting bearing carriage.",
      "Push rods link both carriages to the centrally located pulley sector.",
      "Two cables drop to the floor double pulley and run aft under the floor, aft of the rear spar, to the turning pulleys.",
      "From there one cable runs out each wing to a vertical sector / crank arm, which turns the aileron through a right-angle conical drive arm.",
      "A balance cable joins the two wing sectors through cable guides, closing the loop — one aileron goes up as the other goes down.",
    ],
  },
  rudder: {
    fig: "POH Figure 7-3",
    steps: [
      "Pushing a pedal swings the pedal links and the rudder cable horn on the pedal torque tube.",
      "A single cable system runs aft under the floor over the forward and intermediate double pulleys.",
      "It ends at the aft rudder sector, next to the elevator sector pulley in the aft fuselage.",
      "A push-pull tube from that sector drives the rudder bellcrank at the bottom of the rudder.",
      "Springs and a ground-adjustable spring cartridge on the pedal assembly centre the rudder (yaw trim).",
    ],
  },
};

export function Controls() {
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E),
    up = useSR20((x) => x.update);
  const ctrlFocus = useView((x) => x.ctrlFocus),
    flyTo = useView((x) => x.flyTo);
  const focus = (v: Chan | "all") => {
    useView.getState().set({ ctrlFocus: v });
    const [p, t] = v === "all" ? SYS.find((d) => d.id === "controls")!.cam : CHAN_CAM[v];
    flyTo(p, t);
  };
  return (
    <>
      <p className="lead">
        Two single-handed side yokes drive conventional ailerons, elevator and rudder through push rods, cables and
        bellcranks. Pitch and roll trim move the neutral point of spring cartridges electrically; yaw trim is set on the
        ground.
      </p>
      <H3>Try it</H3>
      <Ctl>
        <Seg
          id="chan"
          label="Show cable run"
          options={[
            ["all", "All"],
            ["elevator", "Elevator"],
            ["aileron", "Aileron"],
            ["rudder", "Rudder"],
          ]}
          value={ctrlFocus}
          onChange={focus}
        />
        <Slider
          id="ctlPitch"
          label="Yoke pitch (push ↔ pull)"
          min={-1}
          max={1}
          step={0.01}
          value={s.ctrl.pitch}
          onChange={(v) =>
            up((d) => {
              d.ctrl.pitch = v;
            })
          }
          fmt={(v) => dir(v, "Nose up", "Nose down", "Neutral")}
        />
        <Slider
          id="ctlRoll"
          label="Yoke roll"
          min={-1}
          max={1}
          step={0.01}
          value={s.ctrl.roll}
          onChange={(v) =>
            up((d) => {
              d.ctrl.roll = v;
            })
          }
          fmt={(v) => dir(v, "Right", "Left", "Neutral")}
        />
        <Slider
          id="ctlYaw"
          label="Rudder pedals"
          min={-1}
          max={1}
          step={0.01}
          value={s.ctrl.yaw}
          onChange={(v) =>
            up((d) => {
              d.ctrl.yaw = v;
            })
          }
          fmt={(v) => dir(v, "Right", "Left", "Neutral")}
        />
        <BtnRow>
          <button
            type="button"
            className="btn"
            onClick={() =>
              up((d) => {
                d.ctrl = { pitch: 0, roll: 0, yaw: 0 };
              })
            }
          >
            Center controls
          </button>
        </BtnRow>
        <Readouts
          items={[
            ["Pitch trim", E.pitchTrim ? "ESS 2 · ON" : ["NO PWR", "bad"]],
            ["Roll trim", E.rollTrim ? "ESS 2 · ON" : ["NO PWR", "bad"]],
            ["Yaw trim", "Ground adj."],
            ["Control geometry", "Illustrative travel"],
          ]}
        />
      </Ctl>
      {ctrlFocus !== "all" && (
        <>
          <H3>
            {ctrlFocus[0].toUpperCase() + ctrlFocus.slice(1)} run · {RUNS[ctrlFocus].fig}
          </H3>
          <ol className="notes">
            {RUNS[ctrlFocus].steps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </>
      )}
      <H3>Mechanisms &amp; surface details — tap to locate</H3>
      <PartsList parts={CAT.pinned("controls")} />
      <H3>Details</H3>
      <Facts
        rows={[
          [
            "Pitch",
            "Yoke tube → drop link → torque tube & forward sector → cable loop → aft sector pulley → push-pull tube → bellcrank",
          ],
          [
            "Roll",
            "Yoke carriages → push rod → central sector → floor & turning pulleys → wing sectors → conical drive arms; balance cable",
          ],
          ["Yaw", "Pedals → cable horn → forward & intermediate pulleys → aft sector → push-pull tube → bellcrank"],
          ["Trim switch", "Conical button on each yoke"],
          ["Pitch / roll trim", "2 A each, ESS BUS 2"],
          ["Takeoff trim", "Mark on yoke tube aligns with bolster tab"],
          ["Trim tabs", "Ground-adjustable on elevator, right aileron, rudder"],
          ["Pitch spring", "Motor at FS 306 → spring cartridge → aft elevator bellcrank"],
          ["Roll spring", "Spar-mounted motor → cartridge → LH aileron actuation pulley"],
          ["Yaw spring", "Left pedal torque tube → console; adjusted on ground"],
          ["Autopilot drive", "GSA 81 servos → GSM 86 slip clutch / capstan → bridle clamps on primary cables"],
          ["Servo locations", "Pitch: below baggage floor CF5 · roll: below passenger seat CF4C"],
          ["Pitch trim adapter", "GTA 82 below passenger seat; yoke trim routes through adapter"],
        ]}
      />
      <H3>Pilot notes</H3>
      <Notes
        items={[
          "Normal control force easily overrides full trim or autopilot inputs.",
          "Pitch and roll trim double as backup control if a primary cable fails — as long as the surface isn't jammed.",
          "There are no gust locks: the trim spring cartridges damp gusts without locking the surfaces (POH 7-11).",
          "Pitch and roll bias come from captured springs. The small surface tabs are factory-set ground adjustments, separate from electric cockpit trim (POH 7-6–11).",
          "Aileron actuation-pulley stops and elevator empennage-bellcrank stops limit primary travel. Retainers prevent cables fouling their pulleys (AMM 12137-002 27-10 / 27-30 p. 1).",
          "AMM trim checks specify roll 6 ± 1°, pitch nose-down −10.5 ± 1° and at least +17° nose-up. The study model illustrates spring attachment and primary-control movement; it does not simulate trim bias or servo engagement (AMM 27-10 pp. 33–34; 27-30 pp. 16–17).",
          "Sources: POH 11934-005 7-6–11, Figs 7-1/2/3; AMM 12137-002 Reissue A / A1, 22-10 pp. 3–4, 21, 26; 27-10 pp. 31–38; 27-20 p. 22; 27-30 pp. 15–21. Hardware dimensions and routes are approximate.",
        ]}
      />
    </>
  );
}

export function Flaps() {
  useTicker(200);
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E),
    up = useSR20((x) => x.update);
  const at = Math.abs(live.flapAng - s.flaps.cmd * 0.32) < 0.3 && E.flapsPwr;
  return (
    <>
      <p className="lead">
        Electric single-slotted flaps share one linear actuator and torque-tube interconnect. Pushrods drive the inboard
        flap arms. Three proximity switches identify actuator travel, stop it at the selected detent and light the
        matching position lamp.
      </p>
      <H3>FLAPS switch</H3>
      <Ctl>
        <Seg
          id="flapSel"
          label="Select"
          options={[
            [0, "UP 0%"],
            [50, "50% · VFE 150"],
            [100, "100% · VFE 110"],
          ]}
          value={s.flaps.cmd}
          onChange={(v) =>
            up((d) => {
              d.flaps.cmd = v as 0 | 50 | 100;
            })
          }
        />
        <div className="lights3">
          {(
            [
              [0, "UP", "g"],
              [50, "50%", "y"],
              [100, "100%", "y"],
            ] as const
          ).map(([v, t, k]) => (
            <span key={v}>
              <i className={at && s.flaps.cmd === v ? k : ""} />
              {t}
            </span>
          ))}
        </div>
        <Readouts
          items={[
            ["Position", live.flapAng.toFixed(1) + "°"],
            ["FLAPS 10 A", E.flapsPwr ? "NON ESS OK" : ["NO POWER", "bad"]],
          ]}
        />
      </Ctl>
      {!E.flapsPwr && (
        <Caution title="No power">
          The flaps have no power (NON ESS BUS dead or FLAPS breaker pulled) — they won&apos;t move. Fix it in
          Electrical.
        </Caution>
      )}
      <H3>Actuator &amp; linkage — tap to locate</H3>
      <PartsList parts={CAT.pinned("flaps")} />
      <H3>Details</H3>
      <Facts
        rows={[
          ["Positions", "0% · 50% (16°) · 100% (32°)"],
          ["VFE 50%", "150 KIAS"],
          ["VFE 100%", "110 KIAS"],
          ["Hinges", "3 per flap, rub strips at cove"],
          ["Lights", "UP green · 50/100 amber"],
          ["Power", "10 A FLAPS, NON ESS BUS"],
          ["Actuator", "Under baggage floor; pinned body, threaded shaft and rod end"],
          ["Mechanical drive", "Actuator → coupler → torque tube → two pushrods → inboard flap arms"],
          ["Airload protection", "Actuator load-limiting clutch; VFE still applies"],
          ["Electrical drive", "Selector, two relays, three proximity sensors and EMI suppressors"],
        ]}
      />
      <Notes
        items={[
          "The clutch limits deployment under high airload. The simulator does not model clutch slip; observe the 150 / 110 KIAS limits (AMM 27-50 p. 1; POH 2-4).",
          "Torque-tube/actuator geometry limits the consequences of a proximity-sensor failure (AMM 27-50 p. 1). A flap position light confirms the selected position, not movement in progress (POH 7-23).",
          "Source: POH 11934-005 7-22–24, Fig 7-6; AMM 12137-002 27-50 pp. 1–4, 8–13, 17–18, Fig 27-50-2. Linkage locations and stroke are approximate.",
        ]}
      />
    </>
  );
}

export function Gear() {
  const s = useSR20((x) => x.s),
    up = useSR20((x) => x.update);
  return (
    <>
      <p className="lead">
        Fixed tricycle gear uses composite main spring struts and a tubular steel nose strut with a nitrogen/fluid oleo
        on the engine mount. Four toe-brake master cylinders share one reservoir; left and right wheel-brake circuits
        stay independent. Differential braking turns the free-castering nose wheel.
      </p>
      <H3>Try it</H3>
      <Ctl>
        <Slider
          id="gearDiff"
          label="Differential braking"
          min={-1}
          max={1}
          step={0.01}
          value={s.gear.diff}
          onChange={(v) =>
            up((d) => {
              d.gear.diff = v;
            })
          }
          fmt={(v) => dir(v, "Right brake", "Left brake", "Even", 0.05)}
        />
        <Check
          id="parkBrake"
          label="PARK BRAKE handle pulled"
          checked={s.gear.park}
          onChange={(v) =>
            up((d) => {
              d.gear.park = v;
            })
          }
        />
        <Readouts
          items={[
            ["Nose caster", Math.round(s.gear.diff * 85) + "°"],
            ["Turning", dir(s.gear.diff, "Right", "Left", "Straight", 0.05)],
          ]}
        />
      </Ctl>
      <Caution title="Caution">
        Don&apos;t set the parking brake in flight. Landing with it set holds whatever pressure you apply after
        touchdown.
      </Caution>
      <H3>Gear &amp; hydraulic circuit — tap to locate</H3>
      <PartsList parts={CAT.pinned("gear")} />
      <H3>Details</H3>
      <Facts
        rows={[
          ["Main tires", "15 × 6.00 × 6 tubeless"],
          ["Nose tire", "5.00 × 5 tubeless"],
          ["Nose caster", "~170° arc (±85°)"],
          ["Brakes", "Single disc, dual piston hydraulic caliper per main wheel"],
          ["Main attachment", "Upper/lower fittings; two lateral ribs between WS 27 and WS 37"],
          ["Nose suspension", "Nitrogen / hydraulic-fluid oleo reacts against engine mount"],
          ["Caster friction", "Spindle cup, thrust washer, Belleville washers and castellated nut"],
          ["Master cylinders", "One per pedal; corresponding toes at both stations operate the same side"],
          ["Hydraulic path", "Reservoir → masters → parking valve → wing fitting → strut line → caliper"],
          ["Parking valve", "Handle in: poppets held open · handle out: applied pressure trapped"],
          ["Fluid", "MIL-PRF-87257"],
          ["Brake temp", "Sensor per wheel → CAS; separate irreversible indicator turns black"],
          ["Sensor power", "3 A ENGINE INSTR, Main Bus 2"],
          ["Parking status", "Valve-arm position sensor → GEA 71 → PARK BRAKE caution"],
        ]}
      />
      <H3>Warning signs</H3>
      <Notes
        items={[
          "Fading braking action, noisy or dragging brakes, soft/spongy pedals or excess travel mean maintenance now.",
          "If braking fades on the roll, release and reapply firmly; if spongy, pumping may rebuild pressure (POH 7-26).",
          "The parking handle holds existing pressure; apply toe brakes before pulling it. Brake-force and nose-caster readouts are illustrative, not a pressure or ground-dynamics simulation (POH 7-26).",
          "Shimmy diagnosis includes tire balance/pressure, fork-spindle preload and thrust-washer condition. The AMM checks 20–25 lb applied at the axle to rotate the fork (AMM 32-20 pp. 2, 19–20).",
          "Use minimum taxi power and braking; avoid riding the brakes. POH guidance for flat, smooth hard surfaces limits continuous taxi power to 1000 RPM and calls for cooling after high-energy braking (POH 10-4).",
          "Sources: POH 11934-005 7-25–26, 8-13, 10-4; AMM 12137-002 Reissue A / A1, 32-10 p. 1, 32-20 pp. 1, 19–22, 32-41 Figs 32-41-1/2, 32-42 pp. 1, 23–30. Hardware dimensions and hydraulic routing approximate.",
        ]}
      />
    </>
  );
}
