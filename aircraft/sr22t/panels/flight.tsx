"use client";
import type { Vec3 } from "@/lib/math";
import type { Chan } from "@/lib/systems";
import { useView } from "@/lib/view";
import { flapPositionLit, live, setPark } from "../model";
import { CAT } from "../parts";
import { useSR22T } from "../store";
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
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update);
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
          [
            "Autopilot servos",
            "Pitch + roll 5 A AP SERVOS, MAIN BUS 1; yaw servo 3 A YAW SERVO, MAIN BUS 3 (yaw damper installed)",
          ],
          ["Takeoff trim", "Mark on yoke tube aligns with bolster tab"],
          ["Trim tabs", "Ground-adjustable on elevator, right aileron, rudder"],
        ]}
      />
      <H3>Pilot notes</H3>
      <Notes
        items={[
          "Normal control force easily overrides full trim or autopilot inputs.",
          "Pitch and roll trim double as backup control if a primary cable fails — as long as the surface isn't jammed.",
          "There are no gust locks: the trim spring cartridges damp gusts without locking the surfaces.",
        ]}
      />
    </>
  );
}

export function Flaps() {
  useTicker(200);
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update);
  const at = flapPositionLit(s.flaps.cmd, live.flapAng, E.flapsPwr);
  return (
    <>
      <p className="lead">
        Electric single-slotted flaps are driven by one linear actuator through a torque tube, so both sides always move
        together. Proximity switches stop travel at each detent and light the matching position lamp.
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
      <H3>Details</H3>
      <Facts
        rows={[
          ["Positions", "0% · 50% (16°) · 100% (35.5°) (POH 7-22)"],
          ["VFE 50%", "150 KIAS"],
          ["VFE 100%", "110 KIAS"],
          ["Hinges", "3 per flap, rub strips at cove"],
          ["Lights", "UP green · 50/100 yellow (POH 7-23)"],
          ["Power", "10 A FLAPS, NON ESS BUS (POH 7-23)"],
          ["Altitude limit", "Do not use flaps above 17,500 ft MSL (POH 2-24)"],
        ]}
      />
    </>
  );
}

export function Gear() {
  const s = useSR22T((x) => x.s),
    up = useSR22T((x) => x.update);
  return (
    <>
      <p className="lead">
        Fixed tricycle gear: composite main struts bolted to the wing, a steel nose strut with an oleo on the engine
        mount. The nose wheel free-casters — you steer on the ground with differential toe brakes.
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
              d.gear = setPark(d.gear, v);
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
      <H3>Details</H3>
      <Facts
        rows={[
          ["Main tires", "15 × 6.00 × 6 tubeless"],
          ["Nose tire", "5.00 × 5 tubeless"],
          ["Nose caster", "~170° arc (±85°)"],
          ["Brakes", "Single disc, hydraulic, per main wheel"],
          ["Fluid", "MIL-PRF-87257"],
          [
            "Brake temp",
            "Sensor on each brake → CAS (POH 7-25): caution at 270–293 °F for more than 5 s (POH 3A-23, 10-3); warning above 293 °F (POH 3-48, 10-3). Caliper piston-housing indicator turns black if overheated (AMM 13773-002 Rev 7, 32-42, PDF pp. 1450, 1461).",
          ],
          ["Tire pressure", "Nose 30–35 psi · mains 60–65 psi (POH 8-14)"],
        ]}
      />
      <H3>Warning signs</H3>
      <Notes
        items={[
          "Fading braking action, noisy or dragging brakes, soft/spongy pedals or excess travel mean maintenance now.",
          "If braking fades on the roll, release and reapply firmly; if spongy, pumping may rebuild pressure.",
        ]}
      />
    </>
  );
}
