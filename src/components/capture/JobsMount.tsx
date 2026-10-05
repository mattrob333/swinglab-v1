"use client";

import { useEffect } from "react";
import { resumePendingJobs } from "@/lib/media/jobs";

/**
 * Resumes processing of any unprocessed clips when mounted. Renders nothing.
 * Meant for the root layout; also mounted by Home and Library (idempotent).
 */
export function JobsMount() {
  useEffect(() => {
    void resumePendingJobs();
  }, []);
  return null;
}
