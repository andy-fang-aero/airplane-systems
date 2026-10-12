/**
 * Builds the SR22T fuselage skin (geometry.ts fuselageGeo, the airframe's one large piece) off the main thread for the
 * progressive build (Airplane.tsx SceneModel; fuselage-geo.ts starts this worker). The same code builds the same geometry:
 * its arrays are sent back (transferred) and become the scene's fuselage geometry unchanged. A failure, including one
 * loading the geometry code, is sent back as `{ error }` so the page builds the fuselage itself.
 */
import "./worker-window";

import("./geometry")
  .then(({ fuselageGeo }) => {
    const g = fuselageGeo();
    const attributes = Object.entries(g.attributes).map(([name, a]) => ({
      name,
      array: a.array,
      itemSize: a.itemSize,
      normalized: a.normalized,
    }));
    const index = g.index ? g.index.array : null;
    postMessage(
      { attributes, index, groups: g.groups },
      { transfer: [...attributes.map((a) => a.array.buffer), ...(index ? [index.buffer] : [])] as ArrayBuffer[] },
    );
  })
  .catch((e: unknown) => postMessage({ error: String(e) }));
