"use client";
import { Box, Cb, Diode, Dot, Fuse, Key, Sw, W } from "@/components/ui/wiring";
import type { Elec, Sim } from "../model";

const V = (v: number) => (v > 0 ? v.toFixed(2) + " V" : "0 V");
const amp = (a: number) => (a > 0 ? "+" : "") + a + " A";

/**
 * Live single-line diagram after POH Figure 7-10 (Electrical System Schematic, SR22T POH 13772-007 7-48) and its description (7-49 – 7-54).
 * In the MCU: ALT 1 and BAT 1 feed Main Dist Bus 1, ALT 2 feeds Main Dist Bus 2, and MDB 1 backs MDB 2 up through the 80 A
 * fuse and a diode (never the reverse). The Ess Dist Bus takes three diode feeds: MDB 1, BAT 1 straight from its relay
 * (ahead of the 125 A fuse; drawn hopping the interconnect, as the figure crosses them) and MDB 2. On the breaker panel,
 * ESS BUS 2 hangs straight off the Ess Dist Bus and ESS BUS 1 through the ESSENTIAL POWER breaker; BAT 2 joins ESS BUS 1
 * through its relay (BAT 2 switch) and the BAT 2 breaker, and BAT 1 feeds the CONV BUS directly through a 5 A fuse.
 * Main and A/C buses are grouped by the distribution bus that feeds them (each through its own 30 A fuse).
 * Simplified: the ALT switches are drawn in the alternator output (they switch the field relay), the other MCU fuses are
 * not drawn, and external power and the starter (not modelled) are left out. viewBox 340 wide like the Cessna diagram.
 */
export function PowerDiagram({ s, E }: { s: Sim; E: Elec }) {
  const e = s.elec;
  const m1 = E.mdb1 > 0,
    m2 = E.mdb2 > 0,
    edb = E.edb > 0,
    ess1 = E.ess1 > 0,
    ess2 = E.ess2 > 0;
  const bat1Charged = !E.bat1Dead,
    bat1Side = bat1Charged || (e.bat1 && m1);
  const epIn = !s.cb["ESSENTIAL POWER"];
  const b2In = !s.cb["BAT 2"],
    bat2Charged = !E.bat2Dead;
  const b2Mid = b2In && (ess1 || (e.bat2 && bat2Charged)),
    b2Bat = bat2Charged || (e.bat2 && b2In && ess1);
  const avIn = !s.cb["AVIONICS"],
    av1 = E.main1 > 0 && avIn;
  const bat1Word = e.fail.bat1 ? "failed" : E.bat1Dead ? "flat" : E.bat1ok ? amp(E.b1) : "0 A";
  const bat2Word = E.bat2Dead ? "flat" : !E.bat2ok ? "isolated" : E.bat2Supplying ? "supplying" : "charging";
  return (
    <svg
      className="wiring"
      viewBox="0 0 340 392"
      role="img"
      aria-label="SR22T power distribution single-line diagram after POH Figure 7-10"
    >
      {/* sources */}
      <Box x={6} y={6} w={58} label="ALT 1" value={E.alt1 ? amp(E.a1) : e.fail.alt1 ? "failed" : "off"} lit={E.alt1} />
      <Box x={72} y={6} w={58} label="BAT 1" value={bat1Word} lit={bat1Charged} />
      <Box
        x={238}
        y={6}
        w={96}
        label="ALT 2"
        value={E.alt2 ? amp(E.a2) : e.fail.alt2 ? "failed" : "off line"}
        lit={E.alt2}
      />
      {/* CONV BUS: straight off BAT 1, ahead of its relay */}
      <W d="M130 22 H135 M147 22 H152" lit={E.conv > 0} />
      <Fuse x={141} y={22} lit={E.conv > 0} />
      <text x={141} y={13} textAnchor="middle" className="d s">
        5 A
      </text>
      <Box x={152} y={6} w={64} label="CONV BUS" value={V(E.conv)} lit={E.conv > 0} />
      {/* bolster master switches */}
      <W d="M35 38 V59" lit={E.alt1} />
      <W d="M35 73 V96" lit={m1} />
      <Sw x={35} y={66} closed={e.alt1} top={E.alt1} bot={m1} label="ALT 1" />
      <W d="M101 38 V59" lit={bat1Side} />
      <W d="M101 73 V96" lit={m1} />
      <Sw x={101} y={66} closed={e.bat1} top={bat1Side} bot={m1} label="BAT 1" />
      <W d="M286 38 V59" lit={E.alt2} />
      <W d="M286 73 V96" lit={m2} />
      <Sw x={286} y={66} closed={e.alt2} top={E.alt2} bot={m2} label="ALT 2" side={-1} />
      {/* MCU: the three distribution buses, the interconnect and the Ess Dist Bus feeds */}
      <rect className="area" x={2} y={78} width={336} height={118} rx={6} />
      <text x={34} y={192} className="d s">
        MCU
      </text>
      <Box x={6} y={96} w={124} label="MAIN DIST 1" value={V(E.mdb1)} lit={m1} />
      <Box x={210} y={96} w={124} label="MAIN DIST 2" value={V(E.mdb2)} lit={m2} />
      <W d="M130 112 H136 M148 112 H165 a5 5 0 0 1 10 0 H187" lit={m1} />
      <W d="M197 112 H210" lit={m2} />
      <Fuse x={142} y={112} lit={m1} />
      <Diode x={192} y={112} dir={1} lit={m1} />
      <text x={142} y={105} textAnchor="middle" className="d s">
        80 A
      </text>
      <Dot x={101} y={84} lit={m1} />
      <W d="M101 84 H170 V140 M118 128 V140" lit={m1} />
      <W d="M222 128 V140" lit={m2} />
      <Diode x={118} y={145} dir={1} lit={m1} v />
      <Diode x={170} y={145} dir={1} lit={m1} v />
      <Diode x={222} y={145} dir={1} lit={m2} v />
      <W d="M118 150 V156 M170 150 V156 M222 150 V156" lit={edb} />
      <Box x={100} y={156} w={140} label="ESS DIST" value={V(E.edb)} lit={edb} />
      {/* breaker-panel buses */}
      <W d="M24 128 V226" lit={m1} />
      <Box x={6} y={226} w={78} label={["MAIN BUS 3", "A/C BUS 1", "A/C BUS 2"]} value={V(E.mdb1)} lit={m1} />
      <W d="M316 128 V226" lit={m2} />
      <Box x={256} y={226} w={78} label={["MAIN BUS 1", "MAIN BUS 2", "NON ESS BUS"]} value={V(E.mdb2)} lit={m2} />
      <W d="M128 188 V200" lit={edb} />
      <W d="M128 212 V226" lit={ess1} />
      <Cb x={128} y={206} open={!epIn} top={edb} bot={ess1} label="POWER" sub="ESSENTIAL" side={-1} />
      <Box x={92} y={226} w={72} label="ESS BUS 1" value={V(E.ess1)} lit={ess1} />
      <W d="M212 188 V226" lit={ess2} />
      <Box x={176} y={226} w={72} label="ESS BUS 2" value={V(E.ess2)} lit={ess2} />
      {/* ESS BUS 1 → BAT 2 breaker → BAT 2 relay (BAT 2 switch) → BAT 2 */}
      <W d="M128 258 V270" lit={ess1} />
      <W d="M128 282 V301" lit={b2Mid} />
      <W d="M128 315 V330" lit={b2Bat} />
      <Cb x={128} y={276} open={!b2In} top={ess1} bot={b2Mid} label="BAT 2" />
      <Sw x={128} y={308} closed={e.bat2} top={b2Mid} bot={b2Bat} label={e.bat2 ? "ON" : "OFF"} sub="BAT 2" />
      <Box x={78} y={330} w={100} label="BAT 2" value={bat2Word} lit={bat2Charged} />
      {/* MAIN BUS 1 → AVIONICS breaker → avionics relay (AVIONICS switch) → AVIONICS BUS */}
      <W d="M295 282 V294" lit={E.main1 > 0} />
      <W d="M295 306 V325" lit={av1} />
      <W d="M295 339 V354" lit={E.avx > 0} />
      <Cb x={295} y={300} open={!avIn} top={E.main1 > 0} bot={av1} label="AVIONICS" side={-1} />
      <Sw
        x={295}
        y={332}
        closed={e.avionics}
        top={av1}
        bot={E.avx > 0}
        label={e.avionics ? "ON" : "OFF"}
        sub="AVIONICS"
        side={-1}
      />
      <Box x={248} y={354} w={86} label="AVIONICS BUS" value={V(E.avx)} lit={E.avx > 0} />
      <Key x={8} y={296} />
    </svg>
  );
}
