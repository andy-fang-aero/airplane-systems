"use client";
import { create } from "zustand";
import { useView } from "@/lib/view";
import { parseGroups, type EngineGroup, type ShownGroups } from "./engine-groups";

/** Viewing state survives simulation resets; reloads are initialised only from the URL. */
export const useEngineGroups = create<{
  shown: ShownGroups;
  set: (group: EngineGroup, on: boolean) => void;
}>((set) => ({
  shown: parseGroups(typeof location === "undefined" ? "" : location.search),
  set: (group, on) => {
    set((state) => ({ shown: { ...state.shown, [group]: on } }));
    useView.getState().setHover(null);
  },
}));
