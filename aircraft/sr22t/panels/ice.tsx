"use client";
import { Check, Ctl, Facts, H3, Notes, PartsList, Readouts, Seg, Slider, useTicker } from "@/components/ui/controls";
import { TKS_USABLE, icePumps, live, pumpDuty } from "../model";
import { CAT } from "../parts";
import { useSR22T } from "../store";

export function Ice() {
  useTicker(100);
  const { s, E, update } = useSR22T();
  if (!s.equip.fiki) return <p className="lead">Not installed on this configuration</p>;
  const i = s.ice,
    pumps = icePumps(s, live.icePhase);
  return (
    <>
      <p className="lead">
        TKS fluid protects nine porous airfoil panels, the propeller and windshield (AMM 30-00, PDF 1166–1168). Geometry
        is schematic. Operating limitations require the installed FIKI POH supplement; the basic POH prohibits known
        icing (POH 2-18).
      </p>
      <H3>ICE PROTECT</H3>
      <Ctl>
        <Check
          id="ips-on"
          label="ICE PROTECT power"
          checked={i.on}
          onChange={(v) =>
            update((d) => {
              d.ice.on = v;
              if (!v) d.ice.maxT = 0;
            })
          }
        />
        <Seg
          id="ips-mode"
          label="Mode"
          value={i.mode}
          options={[
            ["NORM", "NORM"],
            ["HIGH", "HIGH"],
          ]}
          onChange={(v) =>
            update((d) => {
              d.ice.mode = v;
            })
          }
        />
        <Check
          id="ips-max"
          label="MAX · 2 minutes"
          checked={i.on && i.maxT > 0}
          disabled={!i.on}
          onChange={(v) =>
            update((d) => {
              d.ice.maxT = v && d.ice.on ? 120 : 0;
            })
          }
        />
        <Check
          id="ips-ws"
          label="WINDSHLD · about 3 seconds"
          checked={i.ws > 0}
          onChange={(v) =>
            update((d) => {
              d.ice.ws = v ? 3 : 0;
            })
          }
        />
        <Check
          id="ips-bkup"
          label="PUMP BKUP"
          checked={i.bkup}
          onChange={(v) =>
            update((d) => {
              d.ice.bkup = v;
            })
          }
        />
        <Seg
          id="ips-tank"
          label="ANTI-ICE tank selection"
          value={s.avx.backup ? "AUTO" : i.sel}
          options={[
            ["AUTO", "AUTO"],
            ["L", "LEFT"],
            ["R", "RIGHT"],
          ]}
          onChange={(v) =>
            update((d) => {
              d.ice.sel = d.avx.backup ? "AUTO" : v;
            })
          }
        />
        {(["qL", "qR"] as const).map((q, n) => (
          <Slider
            key={q}
            id={`ips-${q}`}
            label={`${n ? "Right" : "Left"} usable fluid`}
            min={0}
            max={TKS_USABLE}
            step={0.1}
            value={i[q]}
            onChange={(v) =>
              update((d) => {
                d.ice[q] = v;
              })
            }
            fmt={(v) => `${v.toFixed(1)} gal`}
          />
        ))}
        <Readouts
          items={[
            ["IPS supply", E.ipsPwr ? "Powered" : "Unavailable"],
            ["Metering pumps 1 / 2", pumps.map((p) => (E.ipsPwr && p ? "ON" : "OFF")).join(" / ")],
            ["Windshield pump", E.ipsPwr && i.ws > 0 ? "ON" : "OFF"],
          ]}
        />
      </Ctl>
      <H3>Anti Ice - TKS</H3>
      <div aria-label="TKS quantity and mode indication" style={{ background: "#17222e", color: "white", padding: 12 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {(["qL", "qR"] as const).map((q, n) => (
            <div key={q} style={{ flex: 1 }}>
              <span
                style={{
                  border: `1px solid ${i.sel === "AUTO" ? "white" : i.sel === (n ? "R" : "L") ? "cyan" : "transparent"}`,
                  padding: "2px 8px",
                }}
              >
                {n ? "R" : "L"}
              </span>
              <meter
                aria-label={`${n ? "Right" : "Left"} TKS usable gallons`}
                min={0}
                max={TKS_USABLE}
                value={i[q]}
                style={{ display: "block", width: "100%", marginTop: 8 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                {Array.from({ length: TKS_USABLE + 1 }, (_, v) => v).map((v) => (
                  <small key={v}>{v}</small>
                ))}
              </div>
              <span>{i[q].toFixed(1)} gal</span>
            </div>
          ))}
        </div>
        {/* the cyan box marks the selected mode (AMM 30-00, PDF 1168); OFF is not a mode */}
        <div style={{ border: `1px solid ${i.on ? "cyan" : "transparent"}`, padding: 4, marginTop: 8 }}>
          {i.on && i.maxT > 0 ? "MAX" : i.on ? i.mode : "OFF"}
        </div>
      </div>
      <Readouts
        items={[
          ["L / R usable", `${i.qL.toFixed(1)} / ${i.qR.toFixed(1)} gal`],
          ["Selected mode", i.maxT > 0 && i.on ? "MAX" : i.on ? i.mode : "OFF"],
          ["Commanded relative flow", `${pumpDuty(s)} %`],
          ["Total usable", `${(i.qL + i.qR).toFixed(1)} gal`],
        ]}
      />
      <Facts
        rows={[
          ["NORM", "100 % average · both pumps 30 s ON / 90 s OFF"],
          ["HIGH", "200 % · pump 1 continuous"],
          ["MAX", "400 % · both pumps for 120 s, then mode selection"],
          ["BKUP", "Pump 2 continuous; bypasses Timer Box; HIGH + BKUP = 400 %"],
          ["Timing source", "AMM 30-00, PDF 1167"],
          ["Each tank", "4.25 gal total / 4.0 usable / 0.25 unusable (AMM 30-00, PDF 1166)"],
          ["System capacity", "8.50 gal (32.2 L) total; 8.00 gal (30.3 L) usable (AMM 12-10 Table 12-10-1, PDF 269)"],
          ["ICE PROTECT 1", "7.5 A MAIN BUS 1; also ice lights (POH 7-48, 7-52; AMM 30-80, PDF 1272)"],
          [
            "ICE PROTECT 2",
            "5 A ESS BUS 2 (POH 7-48 Fig. 7-10, 7-52 Fig. 7-11); AMM 30-07 says Main Bus 1; POH governs",
          ],
          [
            "Filler placard",
            "TKS ICE PROTECTION FLUID / USE ONLY AL-5 (DTD-406B) FLUID / 4.0 US GALLONS (15.1 LITERS) / TOTAL USABLE CAPACITY (POH 2-26)",
          ],
        ]}
      />
      <Notes
        items={[
          "Modelling assumption: MAX requires ICE PROTECT power ON and is cancelled when power is switched OFF; the POH and AMM 30-00 (PDF 1167) do not specify MAX arming with power OFF.",
          "Controls are functional representations, not a sourced bolster layout (AMM 30-00, PDF 1166).",
          "AUTO passively balances tanks; display backup reverts selection to AUTO (AMM 30-00, PDF 1168). No automatic tank alternation is simulated without fluid consumption.",
          "In AUTO the white box surrounds both tanks: the MFD moves it between the left and right tank as the fluid level changes (AMM 30-00, PDF 1168), and that alternation is not simulated.",
          "FIKI supplement: ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed; not used for fluid consumption, gal/hr, endurance, range, dispatch minimum or ice CAS, none of which are modelled. Individual breaker-to-pump failure behavior remains unsourced; the model conservatively requires both IPS supplies.",
          "Do not wax porous panels or use acetone; maximum 158 °F (70 °C) (AMM 30-10, PDF 1226; POH 8-21).",
        ]}
      />
      <PartsList parts={CAT.pinned("ice")} />
    </>
  );
}
