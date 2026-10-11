"use client";
import { OXY_CAPACITY_LABELS, oxyPanelLamps, oxyDisplay, oxygenCas, type OxygenLamp, type Sim } from "../model";
import { CAT } from "../parts";
import { OXY_SCENARIOS, useSR22T } from "../store";
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
  Rocker,
  Slider,
  Small,
} from "@/components/ui/controls";

const ft = (v: number) => v.toLocaleString("en-US") + " ft";

export function Oxygen() {
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update);
  const o = s.oxy,
    shown = oxyDisplay(s, E),
    alerts = oxygenCas(s),
    lamps = oxyPanelLamps(s, E);
  const set = (fn: (d: Sim) => void) => up(fn);
  return (
    <>
      <p className="lead">
        A 77 cu ft bottle in the empennage avionics bay holds oxygen at 1800 psig; a regulator drops it to 70 psig and a
        latching solenoid, switched from the control panel, sends it forward to an overhead manifold with five A5
        breathing stations (five-place variant, AFMS §1 p. 8 and §5.3 Fig 26 p. 42). The bottle is filled from a station
        on the baggage compartment aft wall (AMM 13773-002 Rev 7 35-00).
      </p>
      <Small>
        AMM 35-00 (PDF p. 1780) describes four stations; the five-place variant is AFMS §1 p. 8, and five ports were
        observed on the modelled airplane (operator, 2026-10-08). The manifold is one overhead console in the headliner
        carrying the dome light (AFMS Fig 1 p. 10; POH 7-59), with all five mask ports side by side on its lower face;
        console size and port pitch approximate (AFMS Fig 1 undimensioned).
      </Small>
      <PartsList parts={CAT.pinned("oxygen")} />
      <H3>Control panel</H3>
      <svg
        viewBox="0 0 300 210"
        role="img"
        aria-label="Oxygen control panel lamps, AFMS Figure 2"
        style={{ width: "100%", maxWidth: 300 }}
      >
        <rect x="1" y="1" width="298" height="208" rx="8" fill="#20262B" />
        <g fill="#F2F2F2" fontFamily="monospace" fontSize="12">
          <text x="150" y="25" textAnchor="middle" fontSize="20">
            OXYGEN
          </text>
          <text x="18" y="49" fontSize="10">
            CAPACITY PSI
          </text>
          {OXY_CAPACITY_LABELS.map((label, i) => (
            <g key={label}>
              <text x="24" y={74 + i * 22}>
                {label}
              </text>
              <PanelLamp
                x={104}
                y={70 + i * 22}
                label={label}
                state={lamps.capacity[i]}
                color={i === 5 ? "#F04444" : "#45CF78"}
              />
            </g>
          ))}
          <text x="163" y="56" textAnchor="middle">
            ON
          </text>
          <rect x="141" y="66" width="44" height="104" rx="3" fill="#111519" stroke="#77818A" />
          <rect x="143" y={o.on ? 68 : 117} width="40" height="51" rx="2" fill="#D9DFE3" />
          <text x="163" y="190" textAnchor="middle">
            OFF
          </text>
          <text x="212" y="67">
            O₂ REQ’D
          </text>
          <PanelLamp x={242} y={86} label="O₂ REQ’D" state={lamps.required} color="#F4B43B" />
          <text x="224" y="150">
            FAULT
          </text>
          <PanelLamp x={242} y={169} label="FAULT" state={lamps.fault} color="#F04444" />
        </g>
      </svg>
      <Small>
        AFMS 102NMAN0001 Rev F §1 pp. 8–9 and Fig 2 p. 10; O₂ REQ’D also lights with insufficient outlet pressure above
        approximately 12,000 ft (§1.1.2 p. 14). Single-band ladder is illustrative: the AFMS does not define bar versus
        single-lamp behavior. FULL uses the nominal 1800 psig charge (AMM 35-00, PDF p. 1780). EMPTY flashes below 400
        psig; FAULT flashes with a manifold pressure fault. Steady wiring FAULT is not modelled.
      </Small>
      <H3>Quantity</H3>
      <QuantityGauge psi={shown} />
      <Small>
        Oxy PSI x100, 0–20 dial (POH 13772-007 Fig 7-7, 7-34; AMM 35-00, PDF p. 1781). Indication requires oxygen ON and
        controller power. Amber 400–800 psig marking: AFMS 102NMAN0001 Rev F §1.1.2 p. 14; Perspective+ applicability
        assumed.
      </Small>
      <H3>Try it</H3>
      <Ctl>
        <div className="switches">
          <Rocker
            label="OXYGEN"
            on={o.on}
            onToggle={() =>
              set((d) => {
                d.oxy.on = !d.oxy.on;
              })
            }
          />
        </div>
        <Slider
          id="oxyPsi"
          label="Bottle pressure"
          min={0}
          max={2000}
          step={50}
          value={o.psi}
          onChange={(v) =>
            set((d) => {
              d.oxy.psi = v;
            })
          }
          fmt={(v) => v + " psi"}
        />
        <Slider
          id="oxyPaFt"
          label="Pressure altitude"
          min={0}
          max={25000}
          step={500}
          value={s.paFt}
          onChange={(v) =>
            set((d) => {
              d.paFt = v;
            })
          }
          fmt={ft}
        />
        <Slider
          id="oxyAbove"
          label="Time above 12,500 ft"
          min={0}
          max={Math.max(60, Math.ceil(o.above12k5Min))}
          step={1}
          value={o.above12k5Min}
          onChange={(v) =>
            set((d) => {
              d.oxy.above12k5Min = d.paFt > 12500 ? v : 0;
            })
          }
          fmt={(v) => Math.floor(v) + " min"}
        />
        <Small>
          {s.paFt <= 12500
            ? "Climb above 12,500 ft first to set elapsed time; at or below that altitude the timer resets."
            : "Elapsed altitude exposure also counts while oxygen is ON; switching OFF can immediately raise OXYGEN RQD (POH 3A-24 interpretation)."}
        </Small>
        <Check
          id="oxyFault"
          label="Fail the tank solenoid / low flow"
          checked={o.flowFault}
          onChange={(v) =>
            set((d) => {
              d.oxy.flowFault = v;
            })
          }
        />
        <BtnRow>
          {OXY_SCENARIOS.map(([label, fn]) => (
            <button key={label} type="button" className="btn" onClick={() => set(fn)}>
              {label}
            </button>
          ))}
        </BtnRow>
        <Readouts
          items={[
            ["Quantity display", shown !== null ? shown + " psi" : o.on ? ["NO POWER", "bad"] : "OFF"],
            ["CABIN LIGHTS / OXYGEN", E.oxyPwr ? "POWERED" : ["NO POWER", "bad"]],
            ["Pressure altitude", ft(s.paFt)],
            ["Engine", s.eng.running ? "RUNNING" : ["STOPPED", "bad"]],
            [
              "Oxygen CAS",
              alerts.length
                ? [alerts.map(([, t]) => t).join(" · "), alerts.some(([l]) => l === "w") ? "bad" : "warnc"]
                : "none",
            ],
          ]}
        />
        <Small>
          Bottle pressure changes only on the slider; depletion is not simulated. For flight planning, use the installed
          equipment&apos;s AFMS duration and flow charts (102NMAN0001 Rev F §5.1–5.4, Figs 24–27, pp. 39–43); no
          duration estimate is modelled. Time above 12,500 ft counts while above that altitude and resets at or below
          it.
        </Small>
      </Ctl>
      <H3>Five-person A5 duration reference</H3>
      <Facts
        rows={[
          ["Altitude", "Standard cannula/mask · Oxymizer cannula"],
          ["10,000 ft", "≈10.5 h · ≈14 h"],
          ["16,000 ft", "≈5 h · ≈9 h"],
          ["18,000 ft", "≈4 h · ≈8 h"],
        ]}
      />
      <Small>
        Approximate readings of the five-person curves in AFMS 102NMAN0001 Rev F §5.3 Fig 26, p. 42, not interpolated
        live estimates. The chart uses a 77 cu ft bottle serviced to 1800 psig, excludes residual oxygen below 200 psi
        and reduces capacity 5% for safety. Above 18,000 ft use a mask only. A5 is the only flow device approved for the
        five-port manifold; A4 and PFOC are not approved (§5.2–5.4 pp. 41–44). Flow is set using the installed A5
        altitude scale; the chart gives no numeric flow-rate table. Consult the full installed AFMS chart for flight
        planning.
      </Small>
      <H3>CAS</H3>
      <Facts
        rows={[
          ["OXYGEN FAULT (warning)", "System ON; tank solenoid failed open or closed, or flow low (POH 3-41)"],
          ["OXYGEN QTY (warning)", "Tank pressure below 400 PSI (POH 3-42)"],
          [
            "OXYGEN QTY (caution)",
            "400–800 PSI inclusive; at or above 12,500 ft (POH 3A-24; AFMS Table 2 p. 16, modelling assumption)",
          ],
          [
            "OXYGEN QTY (advisory)",
            "At or below 800 PSI; below 12,500 ft (POH 3A-25; AFMS Table 2 p. 16, modelling assumption)",
          ],
          ["OXYGEN RQD (warning)", "Above 14,000 ft and the oxygen system not ON (POH 3-42)"],
          ["OXYGEN RQD (caution)", "Above 12,500 ft for greater than 30 minutes and not ON (POH 3A-24)"],
          ["OXYGEN LEFT ON (advisory)", "Left ON after on-ground engine shutdown (POH 3A-25)"],
          ["CHECK OXYGEN (advisory)", "POH 3A-26 gives no trigger; AFMS Table 1 (p. 15) omits it; not modelled"],
        ]}
      />
      <H3>System</H3>
      <Facts
        rows={[
          ["Installation", "Precise Flight Built-In Oxygen System, STC SA01708SE (AMM 35-00)"],
          ["Bottle", "77 cu ft at 1800 psig, empennage avionics bay"],
          ["Regulator", "70 psig to the cabin"],
          ["Outlets", "Five A5 ports side by side on the overhead console (AFMS §1 p. 8; five-place variant)"],
          ["MFD", "Simulated gauge 0–2000 psi in 100 psi steps, plus text (AMM 35-00); POH Fig 7-7 label Oxy PSI x100"],
          ["Power", "5 A CABIN LIGHTS / OXYGEN, MAIN BUS 1 (POH 7-52; AMM 35-00)"],
          ["Max operating altitude", "25,000 ft MSL (POH 2-19)"],
        ]}
      />
      <Notes
        items={[
          "Source authority for the modelled airplane: POH 13772-007 > AMM 13773-002 Rev 7 > Precise Flight AFMS 102NMAN0001 Rev F. Rev F predates Perspective+; the AMM 35-00 separate-panel serial range includes the modelled airplane. Fig 2 panel layout remains assumed pending installed-panel confirmation. A modelling assumption selects only the inclusive 800 psi OXYGEN QTY threshold in AFMS 102NMAN0001 Rev F §1.1.2 Table 2 p. 16 (PDF p. 18); AMM 35-00 PDF p. 1781 says reaches 800 psi. POH 3A-25 instead says below 800 PSI. The POH altitude split and below-400 warning remain in force; the amber 400–800 psig MFD band follows AFMS §1.1.2 p. 14; the monochrome POH Fig 7-7 does not establish its colour. Perspective+ applicability remains assumed pending installed-display confirmation.",
          "The panel O₂ REQ’D reminder uses the AFMS approximately 12,000 ft threshold (§1.1.2 p. 14), independent of the POH CAS above 12,500 ft for greater than 30 minutes or above 14,000 ft. AFMS §1.1.2 (p. 14) and Tables 1–2 (pp. 15–16) use different quantity gating (system ON or above 10,000 ft); this model preserves the governing POH CAS logic.",
          "POH Fig 7-11 (7-52) and AMM 35-00 (PDF p. 1781) place the shared 5 A CABIN LIGHTS / OXYGEN breaker on MAIN BUS 1; the older AFMS §1 p. 9 says Main Bus 2. POH governs. Loss of power darkens the panel; the latching solenoid retains the selected state (AFMS p. 9).",
          "Bottle shape and placement are illustrative: no dimensioned cylinder drawing in AMM 35-00 or AFMS Fig 1 p. 10. Assumed internal volume 18.85 L exceeds the 17.7 L ideal-gas minimum derived from 77 cu ft at 1800 psig; the model is not a bottle part-number drawing.",
        ]}
      />
      <H3>Procedures</H3>
      <Notes
        items={[
          "POH 2-19: the operating rules (CFR Part 91 and CFR Part 135) require the use of supplemental oxygen at specified altitudes below the maximum operating altitude.",
          "Before starting (POH 4-5): oxygen masks / cannulas and hoses CHECK CONDITION; oxygen system ON, verify adequate supply for flight with reserve, check flowmeter on all masks, then OFF.",
          "Cruise Climb (POH 4-21): masks / cannulas DON, system ON, flow rate adjust for planned cruise altitude, monitor flowmeters and quantity. Climb, Cruise and Descent: oxygen AS REQUIRED (POH 4-20, 4-23).",
          "OXYGEN FAULT or OXYGEN QTY warning: descend below 12,500 ft — an emergency descent if there is no flow (POH 3-41, 3-42).",
          "Smoke and Fume Elimination and CO LVL HIGH: masks or cannulas DON, oxygen system ON, flow rate MAXIMUM (POH 3-19, 3-40).",
        ]}
      />
      <Caution title="Warning">Use Oxygen System only if flames and heat are not present. (POH 3-19)</Caution>
    </>
  );
}

function PanelLamp({
  x,
  y,
  label,
  state,
  color,
}: {
  x: number;
  y: number;
  label: string;
  state: OxygenLamp;
  color: string;
}) {
  return (
    <circle cx={x} cy={y} r="6" fill={state === "dark" ? "#3D4348" : color} stroke="#77818A" strokeWidth="1">
      <title>{`${label}: ${state === "flash" ? "flashing" : state}`}</title>
      {state === "flash" && <animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite" />}
    </circle>
  );
}

/** POH 13772-007 Fig 7-7 (7-34): oxygen dial marked 0–20, PSI ×100. */
export function QuantityGauge({ psi }: { psi: number | null }) {
  const point = (v: number, r: number) => {
    const angle = ((-135 + (v / 2000) * 270) * Math.PI) / 180;
    return [100 + r * Math.sin(angle), 100 - r * Math.cos(angle)];
  };
  const amberStart = point(400, 83),
    amberEnd = point(800, 83);
  const tip = psi === null ? null : point(psi, 58);
  return (
    <svg
      viewBox="0 0 200 210"
      role="img"
      aria-label={psi === null ? "Oxygen quantity gauge: no indication" : `Oxygen quantity gauge: ${psi} psi`}
      style={{ width: "100%", maxWidth: 220 }}
    >
      <circle cx="100" cy="100" r="90" fill="#20262B" stroke="#77818A" />
      {/* AFMS 102NMAN0001 Rev F §1.1.2 p. 14: MFD caution marking 400–800 psig. */}
      <path
        data-oxygen-amber-band="400-800"
        d={`M ${amberStart.join(" ")} A 83 83 0 0 1 ${amberEnd.join(" ")}`}
        fill="none"
        stroke="#F4B43B"
        strokeWidth="6"
      />
      {Array.from({ length: 21 }, (_, i) => {
        const [x1, y1] = point(i * 100, i % 4 === 0 ? 66 : 73);
        const [x2, y2] = point(i * 100, 80);
        const [x, y] = point(i * 100, 55);
        return (
          <g key={i} stroke="#D9DFE3">
            <line x1={x1} y1={y1} x2={x2} y2={y2} />
            {i % 4 === 0 && (
              <text x={x} y={y + 4} textAnchor="middle" fill="#D9DFE3" stroke="none" fontSize="12">
                {i}
              </text>
            )}
          </g>
        );
      })}
      {tip && (
        <line data-oxygen-needle="true" x1="100" y1="100" x2={tip[0]} y2={tip[1]} stroke="#F2F2F2" strokeWidth="3" />
      )}
      <circle cx="100" cy="100" r="5" fill="#77818A" />
      <text x="100" y="160" textAnchor="middle" fill="#D9DFE3" fontSize="12">
        Oxy PSI x100
      </text>
      <text x="100" y="181" textAnchor="middle" fill="#F2F2F2" fontSize="16">
        {psi === null ? "—" : psi}
      </text>
    </svg>
  );
}
