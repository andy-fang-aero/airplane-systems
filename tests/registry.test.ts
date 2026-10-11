/** "Tap to locate" (lib/registry): the camera flies to the instance of a part that carries its label. */
import { BoxGeometry, Mesh, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { focusPart, partObjects, registerPart } from "@/lib/registry";
import { useView } from "@/lib/view";

describe("partObjects", () => {
  it("prefers the first pinned mesh of a name over an earlier unpinned one", () => {
    const [right, left, extra] = [new Mesh(), new Mesh(), new Mesh()];
    const offs = [registerPart("probe A", right, false), registerPart("probe A", left, true)];
    expect(partObjects.get("probe A")).toBe(left);
    offs.push(registerPart("probe A", extra, true));
    expect(partObjects.get("probe A")).toBe(left);
    offs[1]();
    expect(partObjects.get("probe A")).toBe(extra);
    offs[2]();
    expect(partObjects.get("probe A")).toBe(right);
    offs[0]();
    expect(partObjects.has("probe A")).toBe(false);
  });

  it("keeps the first mounted mesh when no instance is pinned", () => {
    const [a, b] = [new Mesh(), new Mesh()];
    const offs = [registerPart("probe B", a, false), registerPart("probe B", b, false)];
    expect(partObjects.get("probe B")).toBe(a);
    offs.forEach((off) => off());
    expect(partObjects.has("probe B")).toBe(false);
  });
});

describe("focusPart", () => {
  it("flies to a part that mounts after it was asked for (a progressive build still adding it)", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    try {
      const before = useView.getState().cam;
      focusPart("probe late");
      expect(useView.getState().cam).toBe(before); // nothing to fly to yet
      expect(useView.getState().focus).toBe("probe late");
      const mesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
      mesh.position.set(1, 2, 3);
      const off = registerPart("probe late", mesh, true);
      const cam = useView.getState().cam!;
      expect(cam).not.toBe(before);
      expect(new Vector3(...cam.t).distanceTo(new Vector3(1, 2, 3))).toBeLessThan(1e-9);
      expect(new Vector3(...cam.p).distanceTo(new Vector3(1, 2, 3))).toBeCloseTo(2.6, 9);
      off();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("forgets a waiting part once another one is located", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    try {
      const there = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
      const offs = [registerPart("probe here", there, true)];
      focusPart("probe gone");
      focusPart("probe here");
      const cam = useView.getState().cam;
      offs.push(registerPart("probe gone", new Mesh(new BoxGeometry(0.2, 0.2, 0.2)), true));
      expect(useView.getState().cam).toBe(cam);
      offs.forEach((off) => off());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("pending locate cancellation", () => {
  it.each(["system", "aircraft", "reset"])("does not replay a late locate after %s navigation", (kind) => {
    vi.stubGlobal("document", { querySelector: () => null });
    const initial = useView.getState();
    try {
      focusPart("cancelled late part");
      if (kind === "system") {
        useView.setState({ sys: "electrical", focus: null });
        useView.setState({ sys: initial.sys }); // returning to the original view must not revive the request
      } else if (kind === "aircraft") {
        useView.setState({ ac: "sr22t", focus: null });
        useView.setState({ ac: initial.ac });
      } else useView.getState().flyTo([7, 4, 9], [0, 0, 0]);
      const camera = useView.getState().cam;
      const mesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
      mesh.position.set(10, 20, 30);
      const off = registerPart("cancelled late part", mesh, true);
      expect(useView.getState().cam).toBe(camera);
      off();
      mesh.geometry.dispose();
    } finally {
      useView.setState(initial);
      vi.unstubAllGlobals();
    }
  });

  it("keeps a pending locate across display-only changes", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    const initial = useView.getState();
    try {
      focusPart("late after theme");
      useView.setState({ theme: initial.theme === "light" ? "dark" : "light" });
      const mesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
      mesh.position.set(2, 3, 4);
      const off = registerPart("late after theme", mesh, true);
      expect(useView.getState().cam!.t).toEqual([2, 3, 4]);
      off();
      mesh.geometry.dispose();
    } finally {
      useView.setState(initial);
      vi.unstubAllGlobals();
    }
  });
});
