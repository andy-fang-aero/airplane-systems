"use client";
import { BUSES, fuelAvail, type BusId, type Sim } from "../model";
import { useSR20 } from "../store";
import { PowerDiagram } from "./distribution";
import {
  BtnRow,
  Caution,
  Check,
  Ctl,
  Facts,
  H3,
  Notes,
  Readouts,
  Rocker,
  Slider,
  Small,
} from "@/components/ui/controls";

function Bus({ id, name, src, loads }: { id: BusId; name: string; src: string; loads: [string, number?][] }) {
  const E = useSR20((x) => x.E),
    cb = useSR20((x) => x.s.cb),
    up = useSR20((x) => x.update);
  const v = E[id],
    on = v > 0;
  return (
    <div className={"bus" + (on ? " on" : "")}>
      <div className="top">
        <span className="lamp" />
        <span className="nm">{name}</span>
        <span className="v">{on ? v.toFixed(1) + " V" : "0 V"}</span>
      </div>
      <div className="src">{src}</div>
      <div className="loads">
        {loads.map(([n, a]) => (
          <button
            key={n}
            type="button"
            className={"chip" + (cb[n] ? " pulled" : "")}
            aria-pressed={!!cb[n]}
            title={`Pull / reset the ${n} breaker`}
            onClick={() =>
              up((d) => {
                if (d.cb[n]) delete d.cb[n];
                else d.cb[n] = true;
              })
            }
          >
            {n}
            {a ? ` ${a}A` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Engine running in flight: key BOTH, mixture out of cutoff, a tank with fuel, breakers in. */
const fly = (d: Sim) => {
  d.cb = {};
  d.eng.running = true;
  d.eng.key = "BOTH";
  if (d.eng.mix < 0.1) d.eng.mix = 0.85;
  if (!fuelAvail(d)) d.fuel.sel = d.fuel.qL > 0 ? "L" : "R";
};
const resetElec = (d: Sim) => {
  d.elec = {
    bat1: true,
    bat2: true,
    alt1: true,
    alt2: true,
    avionics: true,
    fail: { alt1: false, alt2: false, bat1: false },
    tBat: 0,
  };
};

export function Electrical() {
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E),
    up = useSR20((x) => x.update);
  const e = s.elec;
  const scen = (label: string, fn: (d: Sim) => void) => (
    <button
      key={label}
      type="button"
      className="btn"
      onClick={() =>
        up((d) => {
          resetElec(d);
          fn(d);
        })
      }
    >
      {label}
    </button>
  );
  const amp = (a: number) => (a > 0 ? "+" : "") + a;
  return (
    <>
      <p className="lead">
        Two alternators and two batteries feed three distribution buses inside the Master Control Unit. A diode lets
        Main Dist Bus 1 back up Bus 2 but never the reverse. The essential buses can be fed from every source, so
        remaining sources can continue supplying the flight-critical loads (POH 7-49–7-53).
      </p>
      <H3>Bolster master switches</H3>
      <Ctl>
        <div className="switches">
          <Rocker
            label="BAT 2"
            on={e.bat2}
            onToggle={() =>
              up((d) => {
                d.elec.bat2 = !d.elec.bat2;
              })
            }
          />
          <Rocker
            label="BAT 1"
            on={e.bat1}
            onToggle={() =>
              up((d) => {
                d.elec.bat1 = !d.elec.bat1;
              })
            }
          />
          <Rocker
            label="ALT 1"
            on={e.alt1}
            onToggle={() =>
              up((d) => {
                d.elec.alt1 = !d.elec.alt1;
              })
            }
          />
          <Rocker
            label="ALT 2"
            on={e.alt2}
            onToggle={() =>
              up((d) => {
                d.elec.alt2 = !d.elec.alt2;
              })
            }
          />
          <Rocker
            label="AVIONICS"
            on={e.avionics}
            onToggle={() =>
              up((d) => {
                d.elec.avionics = !d.elec.avionics;
              })
            }
          />
        </div>
        <div className="row">
          <div className="lbl">
            <span>Failures</span>
          </div>
          <BtnRow>
            <Check
              id="fA1"
              label="ALT 1 fails"
              checked={e.fail.alt1}
              onChange={(v) =>
                up((d) => {
                  d.elec.fail.alt1 = v;
                })
              }
            />
            <Check
              id="fA2"
              label="ALT 2 fails"
              checked={e.fail.alt2}
              onChange={(v) =>
                up((d) => {
                  d.elec.fail.alt2 = v;
                })
              }
            />
            <Check
              id="fB1"
              label="BAT 1 dead"
              checked={e.fail.bat1}
              onChange={(v) =>
                up((d) => {
                  d.elec.fail.bat1 = v;
                })
              }
            />
          </BtnRow>
        </div>
        <div className="row">
          <div className="lbl">
            <span>Scenarios</span>
          </div>
          <BtnRow>
            {scen("Normal cruise", (d) => {
              fly(d);
            })}
            {scen("ALT 1 fails", (d) => {
              fly(d);
              d.elec.fail.alt1 = true;
            })}
            {scen("ALT 2 fails", (d) => {
              fly(d);
              d.elec.fail.alt2 = true;
            })}
            {scen("Both ALTs fail", (d) => {
              fly(d);
              d.elec.fail.alt1 = d.elec.fail.alt2 = true;
            })}
            {scen("BAT 2-only ground check", (d) => {
              d.eng.running = false;
              d.eng.key = "OFF";
              d.elec.bat1 = d.elec.alt1 = d.elec.alt2 = d.elec.avionics = false;
            })}
            {scen("Everything lost but BAT 2", (d) => {
              fly(d);
              d.elec.fail.alt1 = d.elec.fail.alt2 = d.elec.fail.bat1 = true;
            })}
          </BtnRow>
        </div>
        <Slider
          id="tBat"
          label="Time on batteries (after ALT failure)"
          min={0}
          max={75}
          step={1}
          value={e.tBat}
          onChange={(v) =>
            up((d) => {
              d.elec.tBat = v;
            })
          }
          fmt={(v) => v + " min"}
        />
        <Readouts
          items={[
            ["Engine", s.eng.running ? "RUNNING" : ["STOPPED", "bad"]],
            ["ESS V", [E.ess1.toFixed(1), E.ess1 < 24.5 ? "bad" : ""]],
            ["M1 V", [E.mdb1.toFixed(1), E.mdb1 < 24.5 ? "warnc" : ""]],
            ["M2 V", [E.mdb2.toFixed(1), E.mdb2 < 24.5 ? "warnc" : ""]],
            ["ALT 1 A", [amp(E.a1), E.a1 ? "" : "warnc"]],
            ["ALT 2 A", [amp(E.a2), E.a2 ? "" : "warnc"]],
            [
              "BAT 1 A",
              E.bat1Dead ? ["DEPLETED", "bad"] : !E.bat1ok ? ["OFF", "bad"] : [amp(E.b1), E.b1 < 0 ? "warnc" : ""],
            ],
            [
              "BAT 2",
              E.bat2Dead
                ? ["DEPLETED", "bad"]
                : !E.bat2ok
                  ? ["OFF", "bad"]
                  : E.bat2Charging
                    ? "Charging"
                    : ["Supplying", "warnc"],
            ],
          ]}
        />
      </Ctl>
      <Small>
        Currents are illustrative, anchored to a normal G6 readout (ALT 1 +23 A, ALT 2 +13 A, BAT 1 +1 A, ESS 28.0 V, M1
        27.7 V, M2 28.7 V). Battery times use the Costanzo training deck&apos;s rule of thumb — actual endurance depends
        on load shedding.
      </Small>
      <H3>Power distribution (Figure 7-10)</H3>
      <PowerDiagram s={s} E={E} />
      <Small>
        Main Dist Bus 1, Main Dist Bus 2 and the Ess Dist Bus are inside the Master Control Unit; the buses below them
        are on the circuit-breaker panel, the main and A/C buses grouped by the distribution bus that feeds them. With
        both alternators failed BAT 1 feeds the Ess Dist Bus directly; with BAT 1 gone too, BAT 2 feeds ESS BUS 1, and
        ESS BUS 2 back through ESSENTIAL POWER (POH 7-52–7-55). Pull ESSENTIAL POWER, BAT 2 or AVIONICS below, or flip a
        switch, to watch it change.
      </Small>
      <H3>Battery endurance (rule of thumb)</H3>
      <Facts
        rows={[
          ["ALT 2 fails", "ALT 1 powers Main Dist Bus 2 through the diode — no time limit"],
          ["ALT 1 fails", "BAT 1 carries Main Dist Bus 1 ≈ 30 min, then it drops off"],
          ["Both fail", "BAT 1 carries both main buses ≈ 15 min, then BAT 2 carries the essential buses ≈ 45 min"],
        ]}
      />
      <H3>Circuit-breaker buses</H3>
      <Small>
        Tap a breaker to pull it (white collar showing) or reset it. Pulled breakers remove that load everywhere in the
        model — try FLAPS, PFD A + PFD B, ALT 1, or STALL WARNING.
      </Small>
      <div className="buses">
        {BUSES.map(([id, name, src, loads]) => (
          <Bus key={id} id={id} name={name} src={src} loads={loads} />
        ))}
      </div>
      <H3>Details</H3>
      <Facts
        rows={[
          ["ALT 1", "100 A, right front, 27.7 V"],
          ["ALT 2", "70 A, left front, 28.7 V"],
          ["BAT 1", "24 V, 11 Ah, right firewall"],
          ["BAT 2", "2 × 12 V, 7 Ah, aft of FS 222"],
          ["ALT 1 start", "Needs BAT 1 on"],
          ["ALT 2 start", "Needs BAT 1 or BAT 2 on"],
          ["External power", "28 V regulated; BAT 1 must be on"],
          ["Lightning", "Two console TVS plus eight harness TVS with dual ADAHRS (AMM 24-50 p. 3)"],
        ]}
      />
      <H3>Inside the MCU and its wiring</H3>
      <Facts
        rows={[
          [
            "Alternator control",
            "Separate field relays and voltage regulators; ALT switches control field power, not the output cables",
          ],
          ["ALT 1 field", "5 A ALT 1 breaker on A/C BUS 1; BAT 1 needed for initial excitation (POH 7-55)"],
          ["ALT 2 field", "5 A ALT 2 breaker on ESS BUS 2; BAT 1 or BAT 2 needed for initial excitation (POH 7-55)"],
          [
            "MCU contactors",
            "BAT 1, starter and external-power relays; BAT 2 relay is next to its battery (AMM 24-30 pp. 4–5)",
          ],
          [
            "MCU sensing",
            "Three current shunts send measurements to the GEA engine airframe unit (AMM 24-30 p. 5; POH 7-56)",
          ],
          [
            "Source protection",
            "ALT 1: 100 A fuse; BAT 1 main feed: 125 A in Fig 7-10; MDB 1 → MDB 2: 80 A fuse and diode",
          ],
          ["Essential protection", "Two 50 A feeds into ESS DIST; eight separate 30 A breaker-bus feeders (POH 7-51)"],
          ["BAT 2 construction", "Series connection gives 24 V at 7 Ah; a local relay connects it to ESS BUS 1"],
          [
            "Ground power contacts",
            "Two longer power contacts and one short relay-control contact; reverse polarity prevents relay engagement (AMM 24-40 p. 1)",
          ],
        ]}
      />
      <Notes
        items={[
          "Source disagreement: POH 7-51 text specifies an 80 A ALT 2 output fuse, while Fig 7-10 (7-50) and SR20 AMM 24-30 p. 1 / 24-50 p. 1 specify 60 A. The model uses the POH text and records the disagreement; it does not imply a maintenance replacement rating.",
          "Both SR20 IO-390 alternators are belt driven. The right-front 100 A and left-front 70 A units use separate schematic belt lanes. SR22T alternator drives and voltage settings are not substituted.",
          "MCU component positions, harness lanes and cable sizes are schematic. Relays glow with control power; digital data and electrical power use separate paths. External power hardware is shown, but connecting a ground source is not simulated.",
          "The constant-power CONV bus connects to BAT 1 ahead of its master relay, through a 5 A fuse on top of the MCU. It powers the convenience-light controller and optional gateway even with the masters off.",
        ]}
      />
      <Caution title="Caution">
        Running with the alternators off drains the batteries until the battery relay opens, removing alternator field
        power and preventing a restart.
      </Caution>
      <H3>CAS by failure (G6)</H3>
      <Facts
        rows={[
          ["ALT 2 fails", "ALT 2"],
          ["ALT 1 fails", "ALT 1 · M BUS 1"],
          ["Both fail", "ALT 1 · ALT 2 · M BUS 1 · M BUS 2 · ESS BUS (red)"],
          ["BATT 1", "Battery 1 discharging with ALT 1 working: an MCU fault, not an ALT 1 failure (not modelled)"],
        ]}
      />
      <H3>Ground check logic</H3>
      <Notes
        items={[
          "BAT 2 alone should power only ESS BUS 1 and 2. Anything else lit means the interconnect diode has failed.",
          "Turn AVIONICS off before master switches, engine start or external power.",
        ]}
      />
    </>
  );
}
