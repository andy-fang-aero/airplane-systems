"use client";
import { create } from "zustand";
import { useView } from "@/lib/view";
import { allGroups, type EngineGroup, type ShownGroups } from "./engine-groups";

export const useEngineGroups = create<{
  shown: ShownGroups;
  set: (group: EngineGroup, on: boolean) => void;
}>((set) => ({
  shown: allGroups(),
  set: (group, on) => {
    set((state) => ({ shown: { ...state.shown, [group]: on } }));
    useView.getState().setHover(null);
  },
}));
