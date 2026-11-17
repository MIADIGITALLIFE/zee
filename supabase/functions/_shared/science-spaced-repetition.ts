export type ReviewState = { interval_days: number; repetitions: number; lapses: number; ease_factor: number };
export function nextReview(state: Partial<ReviewState> | null, score: number, now = new Date()) {
  const previous: ReviewState = {
    interval_days: Math.max(0, Number(state?.interval_days) || 0),
    repetitions: Math.max(0, Number(state?.repetitions) || 0),
    lapses: Math.max(0, Number(state?.lapses) || 0),
    ease_factor: Math.min(2.8, Math.max(1.3, Number(state?.ease_factor) || 2.3)),
  };
  const safeScore = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  let repetitions = previous.repetitions;
  let lapses = previous.lapses;
  let interval = 1;
  let ease = previous.ease_factor;
  if (safeScore < 70) {
    repetitions = 0;
    lapses += 1;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    repetitions += 1;
    const ladder = [1, 3, 7, 14, 30, 60, 90];
    interval = ladder[Math.min(repetitions - 1, ladder.length - 1)];
    if (safeScore >= 90) ease = Math.min(2.8, ease + 0.1);
    else ease = Math.max(1.3, ease - 0.05);
    if (safeScore >= 70 && safeScore < 80) interval = Math.max(1, Math.floor(interval * 0.75));
  }
  const due = new Date(now.getTime() + interval * 86400000);
  return { interval_days: interval, repetitions, lapses, ease_factor: Math.round(ease * 100) / 100,
    due_at: due.toISOString(), last_score: Math.round(safeScore * 100) / 100 };
}
