/**
 * The 27 playing cards of Sail: three colours numbered 1–9. The symbol is set
 * by the number, the same in every colour:
 *
 *   1–3  helm with a tentacle  (T)   1s and 2s start in the Kraken deck
 *   4–5  cannon                (C)
 *   6–8  helm                  (H)
 *   9    fish tail / mermaid   (F)   one per colour, so only three in the game
 *
 * Sources: BGA rules summary (kuribodo.com/bga_sail), reviews (whatsericplaying.com,
 * meadowparty.com), Allplay rulebook.
 */

export type Sym = "T" | "C" | "H" | "F";

export const COLOURS = 3;
export const VALUES = 9;
export const CARD_COUNT = COLOURS * VALUES;

/** Colour 0 is grey: pirate 5's power refers to the grey 6–8 helms. */
export const GREY = 0;

const SYM_BY_VALUE: Sym[] = ["T", "T", "T", "T", "C", "C", "H", "H", "H", "F"]; // index = value (0 unused)

export const suitOf = (card: number) => (card / VALUES) | 0;
export const valueOf = (card: number) => (card % VALUES) + 1;
export const symOf = (card: number) => SYM_BY_VALUE[valueOf(card)];

/** Precomputed symbol codes for speed: 0 = T, 1 = C, 2 = H, 3 = F. */
export const SYM_CODE = Uint8Array.from({ length: CARD_COUNT }, (_, c) => "TCHF".indexOf(symOf(c)));
export const SUIT = Uint8Array.from({ length: CARD_COUNT }, (_, c) => suitOf(c));
export const VALUE = Uint8Array.from({ length: CARD_COUNT }, (_, c) => valueOf(c));
export const T = 0;
export const C = 1;
export const H = 2;
export const F = 3;

export const KRAKEN_CARD = -1;

export function playerDeckCards(): number[] {
  const out: number[] = [];
  for (let c = 0; c < CARD_COUNT; c++) if (VALUE[c] >= 3) out.push(c);
  return out;
}

export function krakenDeckCards(): number[] {
  const out: number[] = [];
  for (let c = 0; c < CARD_COUNT; c++) if (VALUE[c] <= 2) out.push(c);
  return out;
}

/** The leader wins unless the follower played a higher card of the led colour. */
export function followerWins(lead: number, follow: number): boolean {
  return SUIT[follow] === SUIT[lead] && VALUE[follow] > VALUE[lead];
}

/** Cards the follower may play: the led colour if they hold any, otherwise anything. */
export function legalFollows(hand: number[], lead: number): number[] {
  const suit = SUIT[lead];
  const same = hand.filter((c) => SUIT[c] === suit);
  return same.length ? same : hand;
}

export type PairKind =
  | "helm" // H+H: move towards the winner
  | "helm1" // H+T: move, then 1 damage
  | "helm2" // T+T: move, then 2 damage
  | "heal" // T+C: the tentacle card goes under the Kraken deck
  | "fish" // F+F: straight ahead one space
  | "flip" // C+C: flip deck cards
  | "none";

const KIND: PairKind[][] = (() => {
  const k: PairKind[][] = [
    ["helm2", "heal", "helm1", "none"],
    ["heal", "flip", "none", "none"],
    ["helm1", "none", "helm", "none"],
    ["none", "none", "none", "fish"],
  ];
  return k;
})();

export function pairKind(a: number, b: number): PairKind {
  return KIND[SYM_CODE[a]][SYM_CODE[b]];
}
