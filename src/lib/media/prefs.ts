"use client";

import type { Handedness } from "@/lib/types";

export const DEFAULT_HANDEDNESS_KEY = "swinglab.defaultHandedness";

/** Default batter handedness for new athlete clips (the son hits left). */
export function getDefaultHandedness(): Handedness {
  try {
    const v = localStorage.getItem(DEFAULT_HANDEDNESS_KEY);
    return v === "R" ? "R" : "L";
  } catch {
    return "L";
  }
}
