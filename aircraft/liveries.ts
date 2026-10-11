/** Photo-traced liveries. Sources and the limits of the reconstruction are in aircraft/LIVERIES.md.
 * Cessna painter coordinates are FS / height in inches; Cirrus and Diamond use scene x / y metres.
 */
import { paintAtlas, type PaintBox, type PaintPoint, type PaintText } from "@/lib/livery";
import type { AircraftId } from "@/lib/systems";

/** The SR22T has no photo-traced livery yet. */
export const LIVERY_REGISTRATION: Record<Exclude<AircraftId, "sr22t">, string> = {
  sr20: "N800KP",
  c172s: "N6189Q",
  c182t: "N8050J",
  da40: "N949KC",
  m20c: "N6947N",
};

/** The M20C currently uses its own schematic painter in m20c/geometry.ts; the SR22T has no livery yet. */
type AtlasAircraftId = Exclude<AircraftId, "m20c" | "sr22t">;

type Section = "fuselage" | "tail";
const INK = "#172029",
  BURGUNDY = "#521b2a",
  GOLD = "#a49980",
  RED = "#8b1234",
  SILVER = "#8d929a";

export function liveryLabels(id: AtlasAircraftId, section: Section): PaintText[] {
  if (section === "tail") {
    if (id === "da40")
      return [
        {
          text: "N949KC",
          a: [-4.86, -0.205],
          b: [-3.72, 0.055],
          color: "#85837e",
          style: "rounded-oblique",
          tracking: 3,
        },
      ];
    if (id === "c172s")
      return [
        { text: "SKYHAWK", a: [242, 84], b: [263, 86.6], color: SILVER, style: "wordmark", tracking: 4 },
        { text: "SP", a: [249, 81], b: [257, 83], color: SILVER, style: "wordmark" },
        { text: "Cessna", a: [255, 95], b: [267, 96.5], color: BURGUNDY, style: "wordmark" },
      ];
    if (id === "c182t") return [];
    return [{ text: "#JUMPSTART", a: [-3.12, 0.2], b: [-2.61, 0.24], color: INK, style: "wordmark", tracking: 5 }];
  }
  if (id === "sr20")
    return [
      { text: "N800KP", a: [-2.2, -0.31], b: [-0.67, -0.005], color: INK, style: "rounded-oblique", tracking: 3 },
      { text: "20", a: [-0.2, 0.29], b: [-0.1, 0.35], color: INK, style: "wordmark" },
      { text: "#FLYCIRRUS", a: [1.99, -0.035], b: [2.49, 0.005], color: INK, style: "wordmark", tracking: 5 },
    ];
  if (id === "c172s") return [{ text: "N6189Q", a: [133, 39], b: [204, 54], color: BURGUNDY, style: "block-oblique" }];
  if (id === "c182t") return [{ text: "N8050J", a: [150, 40], b: [206, 54], color: RED, style: "block-upright" }];
  return [
    { text: "DIAMOND STAR", a: [-1.4, 0.05], b: [-0.8, 0.083], color: SILVER, style: "wordmark", tracking: 4 },
    { text: "XLS", a: [-1.4, 0.01], b: [-1.25, 0.042], color: SILVER, style: "wordmark", tracking: 3 },
  ];
}

/** Paint the observed stripes; points are silhouettes traced from side photographs, not engineering dimensions. */
export function drawLivery(
  id: AtlasAircraftId,
  g: CanvasRenderingContext2D,
  P: PaintPoint,
  section: Section = "fuselage",
) {
  const polygon = (color: string, points: number[][]) => {
    g.beginPath();
    points.forEach((p, i) => {
      const q = P(p);
      if (i) g.lineTo(q[0], q[1]);
      else g.moveTo(q[0], q[1]);
    });
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  // Cubic outlines retain the tapered, curved factory graphics instead of constant-width cheat lines.
  const curve = (color: string, start: number[], segments: number[][][]) => {
    const a = P(start);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    for (const [c1, c2, end] of segments) {
      const b = P(c1),
        c = P(c2),
        d = P(end);
      g.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  if (id === "sr20") {
    if (section === "tail") return;
    polygon(INK, [
      [3.65, -0.24],
      [1.45, -0.04],
      [-0.8, 0.105],
      [-3.35, 0.105],
      [-3.35, 0.065],
      [-0.8, 0.06],
      [1.45, -0.075],
    ]);
    polygon(INK, [
      [2.85, -0.36],
      [1.45, -0.19],
      [-0.28, 0.24],
      [-0.8, 0.3],
      [1.37, -0.26],
    ]);
    polygon(INK, [
      [1.75, -0.085],
      [0.73, -0.34],
      [-0.2, -0.42],
      [-1.35, -0.41],
      [0.69, -0.4],
    ]);
    polygon("#959b9e", [
      [3.6, -0.28],
      [1.4, -0.115],
      [-0.7, 0.015],
      [-3.32, 0.025],
      [-3.32, 0.01],
      [-0.7, -0.005],
      [1.4, -0.13],
    ]);
  } else if (id === "c172s") {
    if (section === "tail") {
      // The SKYHAWK / SP badge has a thin rule between its two lines.
      polygon(SILVER, [
        [242, 83.65],
        [263, 83.65],
        [263, 83.85],
        [242, 83.85],
      ]);
      curve(
        BURGUNDY,
        [203, 61],
        [
          [
            [228, 60],
            [256, 61],
            [277, 73],
          ],
          [
            [262, 62],
            [240, 60],
            [222, 60],
          ],
          [
            [218, 61],
            [210, 61],
            [203, 61],
          ],
        ],
      );
      curve(
        GOLD,
        [211, 61],
        [
          [
            [228, 66],
            [247, 75],
            [254, 78],
          ],
          [
            [248, 77],
            [245, 68],
            [229, 63],
          ],
          [
            [224, 62],
            [217, 61],
            [211, 61],
          ],
        ],
      );
      return;
    }
    curve(
      GOLD,
      [-29, 46],
      [
        [
          [-2, 39],
          [21, 40],
          [43, 50],
        ],
        [
          [62, 58],
          [56, 48],
          [43, 44],
        ],
        [
          [57, 47],
          [60, 59],
          [42, 52],
        ],
        [
          [20, 43],
          [-1, 42],
          [-29, 46],
        ],
      ],
    );
    curve(
      BURGUNDY,
      [35, 42],
      [
        [
          [67, 43],
          [77, 57],
          [60, 51],
        ],
        [
          [89, 61],
          [80, 42],
          [65, 42],
        ],
        [
          [84, 42],
          [104, 33],
          [123, 37],
        ],
        [
          [105, 24],
          [87, 41],
          [65, 40],
        ],
        [
          [53, 40],
          [40, 40],
          [35, 42],
        ],
      ],
    );
    polygon(GOLD, [
      [81, 47],
      [220, 53],
      [220, 52.4],
      [81, 46.4],
    ]);
  } else if (id === "c182t") {
    // New paint: user's photo and flyingclub.org/images/50j-b.jpeg, not the old navy livery.
    if (section === "tail") {
      polygon(RED, [
        [208, 60],
        [234, 70],
        [253, 86],
        [258, 86],
        [240, 68],
        [224, 60],
      ]);
      polygon(RED, [
        [218, 59],
        [242, 70],
        [263, 85],
        [268, 85],
        [247, 66],
        [237, 59],
      ]);
      polygon(RED, [
        [229, 58],
        [253, 68],
        [279, 82],
        [285, 82],
        [264, 64],
        [247, 57],
      ]);
      return;
    }
    // Red upper cowl, white nose/belly, three tapered rays converging behind the cabin.
    polygon(RED, [
      [-45, 90],
      [12, 90],
      [14, 63],
      [30, 54],
      [94, 55],
      [143, 59],
      [119, 53],
      [53, 50],
      [0, 46],
      [-30, 48],
      [-45, 51],
    ]);
    polygon(RED, [
      [-4, 47],
      [41, 44],
      [81, 49],
      [137, 55],
      [76, 47],
      [23, 38],
    ]);
    polygon(RED, [
      [20, 39],
      [49, 32],
      [86, 44],
      [139, 54],
      [89, 47],
      [56, 44],
    ]);
    polygon(RED, [
      [140, 58],
      [215, 59],
      [235, 61],
      [214, 55],
      [169, 55],
    ]);
  } else {
    if (section === "tail") {
      polygon("#55524d", [
        [-3.1, -0.35],
        [-4.8, -0.28],
        [-4.8, -0.302],
        [-3.1, -0.376],
      ]);
      polygon("#aaa69b", [
        [-3.1, -0.397],
        [-4.8, -0.327],
        [-4.8, -0.345],
        [-3.1, -0.414],
      ]);
      return;
    }
    curve(
      "#56544f",
      [2.1, -0.35],
      [
        [
          [1, -0.19],
          [-0.5, -0.23],
          [-0.96, -0.18],
        ],
        [
          [-1.65, -0.1],
          [-0.68, -0.55],
          [-0.67, -0.54],
        ],
        [
          [-1.0, -0.44],
          [-1.48, -0.2],
          [-0.97, -0.215],
        ],
        [
          [0, -0.26],
          [1, -0.23],
          [2.1, -0.35],
        ],
      ],
    );
    curve(
      "#98958a",
      [2, -0.395],
      [
        [
          [0.7, -0.27],
          [-0.35, -0.29],
          [-0.68, -0.29],
        ],
        [
          [-1.3, -0.25],
          [-0.66, -0.51],
          [-0.53, -0.56],
        ],
        [
          [-0.87, -0.43],
          [-0.95, -0.31],
          [-0.61, -0.325],
        ],
        [
          [0, -0.32],
          [1, -0.29],
          [2, -0.395],
        ],
      ],
    );
    curve(
      "#56544f",
      [-0.79, -0.52],
      [
        [
          [-1.67, -0.3],
          [-2.4, -0.31],
          [-4.58, -0.28],
        ],
        [
          [-2.4, -0.34],
          [-1.7, -0.34],
          [-0.79, -0.52],
        ],
      ],
    );
    curve(
      "#a29d91",
      [-0.8, -0.56],
      [
        [
          [-1.8, -0.37],
          [-2.6, -0.39],
          [-4.58, -0.33],
        ],
        [
          [-2.6, -0.42],
          [-1.8, -0.41],
          [-0.8, -0.56],
        ],
      ],
    );
  }
}

export function tailTexture(id: AtlasAircraftId, box: PaintBox, toWorld: PaintPoint = (p) => p) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d")!;
  const P: PaintPoint = (p) => {
    const [x, y] = toWorld(p);
    return [((x - box.x0) / (box.x1 - box.x0)) * c.width, (1 - (y - box.y0) / (box.y1 - box.y0)) * c.height];
  };
  g.fillStyle = "#f3f5f6";
  g.fillRect(0, 0, c.width, c.height);
  drawLivery(id, g, P, "tail");
  return paintAtlas(c, P, liveryLabels(id, "tail"));
}
