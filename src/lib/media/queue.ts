// Serial job queue ordering. Pure (no DOM, no timers); unit tested.
//
// - One job per key: enqueueing an already-queued key keeps a single entry
//   (optionally moving it to the front); enqueueing the running key marks it to
//   run again afterwards (its inputs changed mid-run).
// - Priority jobs (the clip the user just finished editing) go ahead of
//   background work (bulk imports, resumed clips).

export interface QueueEntry {
  key: string;
  priority: boolean;
}

export class SerialQueue {
  private items: QueueEntry[] = [];
  private runningKey: string | null = null;
  private rerun = new Set<string>();

  get running(): string | null {
    return this.runningKey;
  }

  get pending(): readonly string[] {
    return this.items.map((i) => i.key);
  }

  has(key: string): boolean {
    return this.runningKey === key || this.items.some((i) => i.key === key);
  }

  /** Returns true when the key was newly added (or scheduled to re-run). */
  enqueue(key: string, priority = false): boolean {
    if (this.runningKey === key) {
      this.rerun.add(key);
      return true;
    }
    const idx = this.items.findIndex((i) => i.key === key);
    if (idx >= 0) {
      if (priority && !this.items[idx].priority) {
        this.items.splice(idx, 1);
        this.insert({ key, priority: true });
      }
      return false;
    }
    this.insert({ key, priority });
    return true;
  }

  private insert(entry: QueueEntry) {
    if (!entry.priority) {
      this.items.push(entry);
      return;
    }
    // After other priority entries (FIFO among priorities), before background ones.
    const firstBackground = this.items.findIndex((i) => !i.priority);
    if (firstBackground < 0) this.items.push(entry);
    else this.items.splice(firstBackground, 0, entry);
  }

  remove(key: string): void {
    this.items = this.items.filter((i) => i.key !== key);
    this.rerun.delete(key);
  }

  /**
   * Take the next job to run, or null when busy or nothing is runnable. Keys for
   * which `skip` returns true stay queued in place (e.g. a clip open in the editor).
   */
  start(skip?: (key: string) => boolean): string | null {
    if (this.runningKey !== null) return null;
    const idx = skip ? this.items.findIndex((i) => !skip(i.key)) : 0;
    if (idx < 0 || idx >= this.items.length) return null;
    const [next] = this.items.splice(idx, 1);
    this.runningKey = next.key;
    return next.key;
  }

  /** Mark the running job finished. Returns true when it was re-queued. */
  finish(key: string): boolean {
    if (this.runningKey !== key) return false;
    this.runningKey = null;
    if (this.rerun.delete(key)) {
      this.insert({ key, priority: true });
      return true;
    }
    return false;
  }
}
