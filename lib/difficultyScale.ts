/**
 * How a simulated win rate reads to players, anchored on the printed scenarios
 * simulated the same way (400 games each, seeded from the layout).
 * tests/difficulty.test.ts recomputes these and fails if the engine changes them.
 */

export interface OfficialRate {
  slug: string;
  short: string;
  name: string;
  winRate: number;
}

export const OFFICIAL_WIN_RATES: OfficialRate[] = [
  { slug: "learning", short: "L", name: "the Learning scenario", winRate: 0.985 },
  { slug: "scenario-1", short: "1", name: "Scenario 1", winRate: 0.96 },
  { slug: "scenario-2", short: "2", name: "Scenario 2", winRate: 0.7975 },
  { slug: "scenario-3", short: "3", name: "Scenario 3", winRate: 0.7475 },
  { slug: "scenario-4", short: "4", name: "Scenario 4", winRate: 0.2375 },
  { slug: "scenario-5", short: "5", name: "Scenario 5", winRate: 0.1825 },
];

export type DifficultyLevel = "easy" | "medium" | "hard" | "very-hard" | "brutal" | "impossible";

const LEVELS: { min: number; level: DifficultyLevel; label: string }[] = [
  { min: 0.9, level: "easy", label: "Easy" },
  { min: 0.6, level: "medium", label: "Medium" },
  { min: 0.3, level: "hard", label: "Hard" },
  { min: 0.12, level: "very-hard", label: "Very hard" },
  { min: 0.03, level: "brutal", label: "Brutal" },
  { min: -1, level: "impossible", label: "Nearly impossible" },
];

export function difficultyLevel(winRate: number): { level: DifficultyLevel; label: string } {
  const l = LEVELS.find((x) => winRate >= x.min)!;
  return { level: l.level, label: l.label };
}

/** "About as hard as Scenario 3", "Between Scenario 3 and Scenario 4", … */
export function compareWithBook(winRate: number): string {
  const near = OFFICIAL_WIN_RATES.filter((o) => Math.abs(o.winRate - winRate) <= 0.04);
  if (near.length) {
    const closest = near.reduce((a, b) => (Math.abs(b.winRate - winRate) < Math.abs(a.winRate - winRate) ? b : a));
    return `About as hard as ${closest.name}`;
  }
  const easiest = OFFICIAL_WIN_RATES[0];
  const hardest = OFFICIAL_WIN_RATES[OFFICIAL_WIN_RATES.length - 1];
  if (winRate > easiest.winRate) return `Easier than ${easiest.name}`;
  if (winRate < hardest.winRate) return `Harder than ${hardest.name}`;
  const sorted = [...OFFICIAL_WIN_RATES].sort((a, b) => b.winRate - a.winRate);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (winRate <= sorted[i].winRate && winRate >= sorted[i + 1].winRate) {
      return `Between ${sorted[i].name} and ${sorted[i + 1].name}`;
    }
  }
  return "";
}

export const percent = (x: number) => `${Math.round(x * 100)}%`;
