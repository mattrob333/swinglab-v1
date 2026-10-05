"use client";

// /analysis/[id] (and ?vs=<id> for a side-by-side comparison of two models).
// Reads the analyses from the device store, so reports open offline.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MODEL_LABEL } from "@/lib/ai/client";
import { getAnalysis } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import type { Analysis } from "@/lib/types";
import { AnalysisReport } from "./AnalysisReport";

export function AnalysisScreen({ id, vs }: { id: string; vs: string | null }) {
  const router = useRouter();
  const a = useLocalQuery(() => getAnalysis(id), [id]);
  const b = useLocalQuery(() => (vs ? getAnalysis(vs) : Promise.resolve(null)), [vs]);
  const [tab, setTab] = useState(0);

  const loading = a === undefined || (vs !== null && b === undefined);
  const reports = [a, b].filter((x): x is Analysis => !!x);
  const comparing = reports.length === 2;

  const onDeleted = (deletedId: string) => {
    const other = reports.find((r) => r.id !== deletedId);
    router.replace(other ? `/analysis/${other.id}` : "/analysis");
  };

  return (
    <div className="absolute inset-0 flex flex-col safe-top" data-testid="analysis-screen" data-compare={comparing ? "true" : "false"}>
      <header className="flex shrink-0 items-center gap-2 px-2 pb-2 pt-2">
        <Link href="/analysis" className="flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted" data-testid="analysis-back">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Analyses
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold">{comparing ? "Compare reports" : "Swing report"}</h1>
        <Link href="/snaps" className="flex h-11 items-center rounded-full px-3 text-sm font-semibold text-muted">
          Snaps
        </Link>
      </header>

      {loading ? null : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 pt-16 text-center">
          <p className="text-sm text-muted">This analysis isn&apos;t on this device.</p>
          <Link href="/analysis" className="flex h-12 items-center rounded-full bg-neon px-6 font-semibold text-black">
            All analyses
          </Link>
        </div>
      ) : comparing ? (
        <>
          <div className="mx-4 mb-2 flex shrink-0 rounded-full bg-elevated p-1 md:hidden" role="tablist">
            {reports.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={tab === i}
                onClick={() => setTab(i)}
                className={`h-10 flex-1 rounded-full text-sm font-semibold ${tab === i ? "bg-neon text-black" : "text-white"}`}
                data-testid={`compare-tab-${r.model}`}
              >
                {MODEL_LABEL[r.model]}
              </button>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 md:grid-cols-2 md:divide-x md:divide-line">
            {reports.map((r, i) => (
              <div key={r.id} className={`min-h-0 overflow-y-auto overscroll-contain pt-2 ${tab === i ? "block" : "hidden md:block"}`} data-testid="compare-column">
                <AnalysisReport analysis={r} compact onDeleted={() => onDeleted(r.id)} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2">
          <div className="mx-auto max-w-3xl">
            <AnalysisReport analysis={reports[0]} onDeleted={() => onDeleted(reports[0].id)} />
          </div>
        </div>
      )}
    </div>
  );
}
