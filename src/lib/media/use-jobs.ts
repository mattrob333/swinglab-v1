"use client";

import { useSyncExternalStore } from "react";
import { getJobsSnapshot, subscribeJobs, type JobInfo } from "./jobs";

const EMPTY: Readonly<Record<string, JobInfo>> = {};

/** All processing jobs this session, re-rendering on change. */
export function useJobs(): Readonly<Record<string, JobInfo>> {
  return useSyncExternalStore(subscribeJobs, getJobsSnapshot, () => EMPTY);
}

/** The processing job for one clip, if any. */
export function useJob(clipId: string | null | undefined): JobInfo | undefined {
  const all = useJobs();
  return clipId ? all[clipId] : undefined;
}
