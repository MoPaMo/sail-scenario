import { OFFICIAL_SCENARIOS } from "./lib/official";
import { boardFromLayout } from "./lib/game/geometry";
import { simulate } from "./lib/game/simulate";
const games = Number(process.argv[2] ?? 200);
for (const s of OFFICIAL_SCENARIOS) {
  const b = boardFromLayout(s.layout)!;
  const t0 = performance.now();
  const r = simulate(b, { games, seed: 42 });
  const ms = performance.now() - t0;
  console.log(`${s.name.padEnd(18)} win ${(r.winRate*100).toFixed(0).padStart(3)}%  loss storm ${r.losses.storm} kraken ${r.losses.kraken} time ${r.losses.time} | finish R${r.finishRounds.slice(1).join("/")} | moves/round ${r.movesPerRound.toFixed(2)} tricks/round ${r.tricksPerRound.toFixed(2)} moveShare ${(r.moveShare*100).toFixed(0)}% dmg ${r.damagePerGame.toFixed(1)} [${(ms/games).toFixed(1)} ms/game]`);
}
