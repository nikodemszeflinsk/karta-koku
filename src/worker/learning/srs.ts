import { DefaultScheduler, Rating } from "ts-fsrs";

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler<"FSRS-7">>>;
type SchedulerCard = Parameters<Scheduler["review"]>[0]["card"];
let schedulerPromise: Promise<Scheduler> | null = null;

function scheduler(): Promise<Scheduler> {
  // Fuzz off: deterministic intervals (easier to reason about and test).
  schedulerPromise ??= DefaultScheduler({ version: "FSRS-7", enableFuzz: false, desiredRetention: 0.9 });
  return schedulerPromise;
}

const GRADES = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy } as const;

export interface SrsResult {
  card: Record<string, unknown>;
  dueAt: Date;
  reps: number;
  lapses: number;
}

/** Applies one review to a stored card (or a new card) and returns the next state. */
export async function review(stored: Record<string, unknown> | null, rating: 1 | 2 | 3 | 4, now = new Date()): Promise<SrsResult> {
  const s = await scheduler();
  // Stored as JSON: restore Date fields before handing the card back to the scheduler.
  const card: SchedulerCard = stored
    ? ({
        ...stored,
        dueAt: new Date(String(stored.dueAt)),
        lastReviewAt: stored.lastReviewAt ? new Date(String(stored.lastReviewAt)) : null,
      } as unknown as SchedulerCard)
    : s.newCard({ now });
  const { card: next } = s.review({ card, now, grade: GRADES[rating] });
  const plain = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
  return {
    card: plain,
    dueAt: new Date(String(plain.dueAt)),
    reps: Number(plain.reps ?? 0),
    lapses: Number(plain.lapses ?? 0),
  };
}
