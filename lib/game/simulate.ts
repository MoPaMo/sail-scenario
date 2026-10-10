import { C, CARD_COUNT, F, GREY, H, KRAKEN_CARD, SUIT, SYM_CODE, T, VALUE, followerWins, krakenDeckCards, legalFollows, playerDeckCards } from "./cards";
import { COL, DIR_AHEAD, DIR_BOTTOM, DIR_TOP, distanceTo, step, type Board } from "./geometry";
import { makeRng, shuffle, type Rng } from "./rng";

/**
 * Card-level simulation of Sail, used to estimate how often a crew finishes a
 * scenario. It plays the real rules:
 *
 *   player deck 3–9 in three colours, Kraken deck of 1s and 2s; 9 cards each,
 *   one card passed blind; follow the led colour; highest card of the led
 *   colour wins; symbol pairs resolve as on the player aid, cannon flips chain;
 *   damage moves Kraken cards into the player deck, healing moves tentacle
 *   cards under the Kraken deck; end-of-round Kraken damage; storm deadlines;
 *   five rounds; base-game pirate powers.
 *
 * The crew follows a heuristic that respects the no-talking rule: the player
 * who leads only knows their own hand and public information (discards, the
 * face-up Kraken deck, the card they passed, colours the partner has shown to
 * be out of) and weighs each lead against sampled partner hands; the player
 * who follows sees the lead card and picks the best reply from their hand.
 * Real crews develop conventions and plan further ahead, so treat the result
 * as a consistent yardstick (compare with the printed scenarios) rather than
 * an exact win rate.
 */

export type PirateId = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Damage dealt at the end of each round by the Kraken track, from the starting
 * space onwards; the space after the last one is "Dead".
 * NOTE: assumed values. Correct them from the Kraken board if they differ.
 */
export const DEFAULT_KRAKEN_TRACK = [1, 2, 3, 4, 5];

export interface SimOptions {
  games?: number;
  seed?: number;
  /** Pirate powers for the row A seat and the row G seat. */
  pirates?: [PirateId | null, PirateId | null];
  /** Partner hands the leader imagines per decision. */
  samples?: number;
  krakenTrack?: number[];
  /** Called with the running totals every `progressEvery` games. */
  onProgress?: (partial: SimResult) => void;
  progressEvery?: number;
}

export type LossReason = "storm" | "kraken" | "time";

export interface SimResult {
  games: number;
  wins: number;
  winRate: number;
  losses: Record<LossReason, number>;
  /** finishRounds[r] = games won in round r (index 1–5). */
  finishRounds: number[];
  movesPerRound: number;
  tricksPerRound: number;
  damagePerGame: number;
  /** Share of tricks that moved the ship. */
  moveShare: number;
}

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

const WIN = 100;
const LOSS = -100;
/** Planning estimate of moves per trick, used for deadline urgency. */
const MOVE_RATE = 0.5;
/** Rough worth of keeping a card in hand, by symbol [T, C, H, F], in "moves". */
const CARD_VALUE = [0.12, 0.2, 0.3, 0.2];
const STRAIGHT_COST = 1.8; // fish moves are rare: plan mainly with helm moves
const KRAKEN_COST = 0.8;

/* ------------------------------------------------------------------ */
/* Game state                                                          */
/* ------------------------------------------------------------------ */

interface Kraken {
  /** Cards above the Kraken card, cards below it, and the meeple's space. */
  above: number;
  below: number;
  meeple: number;
}

export interface Game {
  b: Board;
  dist: Float64Array;
  stormDist: Float64Array[];
  track: number[];
  pirates: [PirateId | null, PirateId | null];
  rng: Rng;
  samples: number;

  ship: number;
  round: number;
  hands: [number[], number[]];
  deck: number[]; // draw from the end
  discard: number[];
  krakenDeck: number[]; // index 0 = bottom, last = top; holds KRAKEN_CARD once
  meeple: number;
  status: "playing" | "won" | "lost";
  reason: LossReason | null;

  // Round state
  wins: [number, number];
  tricks: number;
  extraUsed: boolean;
  roundOver: boolean;
  voids: [Uint8Array, Uint8Array];
  passed: [number, number];
  /** Cards everyone knows are out of the hands and deck: discards and the face-up Kraken deck. */
  seen: Uint8Array;

  // Stats
  moves: number;
  totalTricks: number;
  roundsPlayed: number;
  damage: number;
}

type Config = { pirates: [PirateId | null, PirateId | null]; samples: number; krakenTrack: number[] };

function newGame(b: Board, cfg: Config, rng: Rng, dist: Float64Array, stormDist: Float64Array[]): Game {
  const krakenDeck = shuffle(krakenDeckCards(), rng);
  krakenDeck.unshift(KRAKEN_CARD);
  return {
    b,
    dist,
    stormDist,
    track: cfg.krakenTrack,
    pirates: cfg.pirates,
    rng,
    samples: cfg.samples,
    ship: b.start,
    round: 0,
    hands: [[], []],
    deck: shuffle(playerDeckCards(), rng),
    discard: [],
    krakenDeck,
    meeple: 0,
    status: "playing",
    reason: null,
    wins: [0, 0],
    tricks: 0,
    extraUsed: false,
    roundOver: false,
    voids: [new Uint8Array(3), new Uint8Array(3)],
    passed: [-1, -1],
    seen: new Uint8Array(CARD_COUNT),
    moves: 0,
    totalTricks: 0,
    roundsPlayed: 0,
    damage: 0,
  };
}

const lose = (g: Game, reason: LossReason) => {
  if (g.status === "playing") {
    g.status = "lost";
    g.reason = reason;
  }
};

function krakenState(g: Game): Kraken {
  const k = g.krakenDeck.indexOf(KRAKEN_CARD);
  return { above: g.krakenDeck.length - 1 - k, below: k, meeple: g.meeple };
}

/** One point of Kraken damage, on the real deck. */
function damage(g: Game) {
  if (g.status !== "playing") return;
  g.damage++;
  const top = g.krakenDeck[g.krakenDeck.length - 1];
  if (top === KRAKEN_CARD) {
    // The Kraken card would be moved: the meeple advances and the card goes to the bottom.
    g.krakenDeck.pop();
    g.krakenDeck.unshift(KRAKEN_CARD);
    g.meeple++;
    if (g.meeple >= g.track.length) lose(g, "kraken");
  } else {
    g.krakenDeck.pop();
    g.discard.push(top);
    g.seen[top] = 1;
    if (g.krakenDeck.length === 1) lose(g, "kraken");
  }
}

function heal(g: Game, card: number) {
  g.krakenDeck.unshift(card);
  g.seen[card] = 1;
}

/** Move one step; entering a Kraken space hurts; reaching the End wins at once. */
function moveShip(g: Game, dir: number): boolean {
  const t = step(g.b, g.ship, dir);
  if (t < 0) return false;
  g.ship = t;
  g.moves++;
  if (g.b.goal[t]) {
    g.status = "won";
    return true;
  }
  if (g.b.kraken[t]) damage(g);
  return true;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

/** Apply d points of damage after h heals (heals go under the deck) to a Kraken summary; null = dead. */
function krakenAfter(k: Kraken, d: number, h: number, track: number[]): Kraken | null {
  let { above, below, meeple } = k;
  below += h;
  for (let i = 0; i < d; i++) {
    if (above > 0) {
      above--;
      if (above + below === 0) return null;
    } else {
      above = below;
      below = 0;
      meeple++;
      if (meeple >= track.length) return null;
    }
  }
  return { above, below, meeple };
}

interface Ctx {
  g: Game;
  kraken: Kraken;
}

/**
 * Value of the position after a trick, in "moves": progress towards the End,
 * urgency before storm deadlines, Kraken health, and terminal outcomes.
 * `dmg` includes tentacle damage and Kraken spaces entered.
 */
function positionValue(cx: Ctx, ship: number, dmg: number, heals: number, roundEnds: boolean): number {
  const { g } = cx;
  const round = g.round;
  if (g.b.goal[ship]) return WIN - round;
  let k = krakenAfter(cx.kraken, dmg, heals, g.track);
  if (!k) return LOSS;
  const d = g.dist[ship];
  if (d === Infinity) return LOSS;
  if (roundEnds) {
    k = krakenAfter(k, g.track[k.meeple], 0, g.track);
    if (!k || round >= 5) return LOSS;
    for (let i = 0; i < g.b.storms.length; i++) {
      if (g.b.deadlines[i] === round && COL[ship] <= g.b.storms[i]) return LOSS;
    }
  }
  const tricksLeft = roundEnds ? 0 : Math.max(0, 6 - g.tricks);
  let v = -d;
  // Urgency when behind schedule for a storm or the End.
  for (let i = 0; i < g.b.storms.length; i++) {
    const deadline = g.b.deadlines[i];
    if (deadline < round || COL[ship] > g.b.storms[i]) continue;
    const need = g.stormDist[i][ship];
    if (need === Infinity) return LOSS;
    const cap = MOVE_RATE * (tricksLeft + 7 * (deadline - round));
    if (need > cap) v -= 2.5 * (need - cap);
  }
  const capEnd = MOVE_RATE * (tricksLeft + 7 * (5 - round));
  if (d > capEnd) v -= 1.5 * (d - capEnd);
  // Kraken health against the end-of-round damage still to come.
  const endsLeft = Math.max(0, Math.min(roundEnds ? 4 - round : 5 - round, Math.ceil(d / 3.5)));
  const margin = k.above + k.below - g.track[k.meeple] * endsLeft;
  v += margin >= 1 ? -2 / margin : -8 + 6 * margin;
  return v;
}

/**
 * Composition [T, C, H, F] of the cards the deciding player can't see, minus
 * the hands they assume. Unseen cards are exactly the two hands plus the deck.
 */
function deckComposition(g: Game, excludeA: number[], excludeB: number[] | null): number[] {
  const comp = [0, 0, 0, 0];
  const mark = new Uint8Array(CARD_COUNT);
  for (const c of excludeA) mark[c] = 1;
  if (excludeB) for (const c of excludeB) mark[c] = 1;
  for (let c = 0; c < CARD_COUNT; c++) if (!mark[c] && !g.seen[c]) comp[SYM_CODE[c]]++;
  return comp;
}

/** Does the round end after this trick? Pirate 4 adds one trick after its player's 4th win. */
function endsRound(g: Game, winner: number): { ends: boolean; extra: boolean } {
  if (g.extraUsed) return { ends: true, extra: false }; // this is pirate 4's extra trick
  if (g.wins[winner] + 1 < 4) return { ends: false, extra: false };
  const extra = g.pirates[winner] === 4;
  return { ends: !extra, extra };
}

interface MoveOption {
  /** Steps in order; a blocked step ends the movement. */
  dirs: number[];
  /** Where the ship ends up, and the damage taken (tentacles + Kraken spaces entered). */
  ship: number;
  dmg: number;
}

function planMove(g: Game, dirs: number[], tentacles: number): MoveOption {
  let ship = g.ship;
  let dmg = tentacles;
  for (const d of dirs) {
    const t = step(g.b, ship, d);
    if (t < 0) break;
    ship = t;
    if (g.b.goal[t]) break;
    if (g.b.kraken[t]) dmg++;
  }
  return { dirs, ship, dmg };
}

/** Moves a pair can make (several when the winner's pirate offers a choice), or null if it doesn't move. */
function moveOptions(g: Game, winner: number, towards: number, x: number, y: number): MoveOption[] | null {
  const sx = SYM_CODE[x];
  const sy = SYM_CODE[y];
  if (sx === F && sy === F) return [planMove(g, [DIR_AHEAD], 0)];
  const helms = (sx === H || sx === T) && (sy === H || sy === T);
  if (!helms) return null;
  const tentacles = (sx === T ? 1 : 0) + (sy === T ? 1 : 0);
  const opts = [planMove(g, [towards], tentacles)];
  const pirate = g.pirates[winner];
  const sameNumber = VALUE[x] === VALUE[y];
  // Pirate 3: two helms (6–8) of the same number may go straight ahead instead.
  if (pirate === 3 && tentacles === 0 && sameNumber) opts.push(planMove(g, [DIR_AHEAD], 0));
  // Pirate 6: two tentacle helms (1–3) of the same number may go two spaces straight; the damage still happens.
  if (pirate === 6 && tentacles === 2 && sameNumber) opts.push(planMove(g, [DIR_AHEAD, DIR_AHEAD], 2));
  // Pirate 5: with a grey 6–8 helm in the trick, the ship may go towards the partner instead.
  if (pirate === 5 && ((SUIT[x] === GREY && sx === H) || (SUIT[y] === GREY && sy === H))) {
    opts.push(planMove(g, [towards === DIR_TOP ? DIR_BOTTOM : DIR_TOP], tentacles));
  }
  return opts;
}

/** Expected value of a cannon pair: deck cards are flipped until a non-cannon shows. */
function flipValue(cx: Ctx, winner: number, towards: number, comp: number[], roundEnds: boolean): number {
  const { g } = cx;
  const nonCannon = comp[T] + comp[H] + comp[F];
  const stay = positionValue(cx, g.ship, 0, 0, roundEnds);
  if (nonCannon === 0) return stay;
  const helm = planMove(g, [towards], 0);
  const fish = planMove(g, [DIR_AHEAD], 0);
  const outcome = [
    positionValue(cx, g.ship, 0, 1, roundEnds), // tentacle card goes under the Kraken deck
    stay,
    positionValue(cx, helm.ship, helm.dmg, 0, roundEnds),
    positionValue(cx, fish.ship, fish.dmg, 0, roundEnds),
  ];
  const p = (s: number) => comp[s] / nonCannon;
  if (g.pirates[winner] !== 1) return p(T) * outcome[T] + p(H) * outcome[H] + p(F) * outcome[F];
  // Pirate 1: two cards are revealed and the better one is used.
  let ev = 0;
  for (const a of [T, H, F]) for (const bb of [T, H, F]) ev += p(a) * p(bb) * Math.max(outcome[a], outcome[bb]);
  return ev;
}

/** Expected value of the trick "x led by `leader`, y in reply" for a player who believes the deck holds `comp`. */
function trickValue(cx: Ctx, leader: number, x: number, y: number, comp: number[], restValue: number): number {
  const { g } = cx;
  const winner = followerWins(x, y) ? 1 - leader : leader;
  const towards = winner === 0 ? DIR_TOP : DIR_BOTTOM;
  const { ends } = endsRound(g, winner);
  const hand = ends ? 0 : restValue;
  const sx = SYM_CODE[x];
  const sy = SYM_CODE[y];
  const options = moveOptions(g, winner, towards, x, y);
  if (options) {
    let best = -Infinity;
    for (const o of options) {
      const v = positionValue(cx, o.ship, o.dmg, 0, ends);
      if (v > best) best = v;
    }
    return best + hand;
  }
  if ((sx === T && sy === C) || (sx === C && sy === T)) return positionValue(cx, g.ship, 0, 1, ends) + hand;
  if (sx === C && sy === C) return flipValue(cx, winner, towards, comp, ends) + hand;
  return positionValue(cx, g.ship, 0, 0, ends) + hand;
}

const handValue = (hand: number[], skip: number, weight: number) => {
  let v = 0;
  for (const c of hand) if (c !== skip) v += CARD_VALUE[SYM_CODE[c]];
  return v * weight;
};

/** Share of a hand likely to be played before the round ends (a 7-trick round leaves 2 cards over). */
function playWeight(g: Game, handSizeAfter: number): number {
  if (handSizeAfter <= 0) return 0;
  return Math.min(1, Math.max(0, 6 - g.tricks) / handSizeAfter);
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

const context = (g: Game): Ctx => ({ g, kraken: krakenState(g) });

function chooseFollow(g: Game, leader: number, x: number): number {
  const hand = g.hands[1 - leader];
  const legal = legalFollows(hand, x);
  if (legal.length === 1) return legal[0];
  const cx = context(g);
  // The follower can't see the leader's hand, so the deck may hold any unseen card.
  const comp = deckComposition(g, [...hand, x], null);
  const w = playWeight(g, hand.length - 1);
  let best = legal[0];
  let bestV = -Infinity;
  for (const y of legal) {
    const v = trickValue(cx, leader, x, y, comp, handValue(hand, y, w));
    if (v > bestV) {
      bestV = v;
      best = y;
    }
  }
  return best;
}

/** A partner hand consistent with what the leader knows. */
function samplePartnerHand(g: Game, leader: number): number[] {
  const partner = 1 - leader;
  const size = g.hands[partner].length;
  const mine = new Uint8Array(CARD_COUNT);
  for (const c of g.hands[leader]) mine[c] = 1;
  const passed = g.passed[leader];
  const passedInHand = passed >= 0 && !g.seen[passed] && !mine[passed];
  const pool: number[] = [];
  const fallback: number[] = [];
  for (let c = 0; c < CARD_COUNT; c++) {
    if (mine[c] || g.seen[c] || c === passed) continue; // unseen = partner's hand or the deck
    fallback.push(c);
    if (!g.voids[partner][SUIT[c]]) pool.push(c);
  }
  const need = size - (passedInHand ? 1 : 0);
  const from = pool.length >= need ? pool : fallback;
  const picked = shuffle(from, g.rng).slice(0, need);
  if (passedInHand) picked.push(passed);
  return picked;
}

function chooseLead(g: Game, leader: number): number {
  const hand = g.hands[leader];
  if (hand.length === 1) return hand[0];
  const cx = context(g);
  const wLead = playWeight(g, hand.length - 1);
  const totals = new Float64Array(hand.length);
  for (let s = 0; s < g.samples; s++) {
    const partnerHand = samplePartnerHand(g, leader);
    const comp = deckComposition(g, hand, partnerHand);
    const wFollow = playWeight(g, partnerHand.length - 1);
    for (let i = 0; i < hand.length; i++) {
      const x = hand[i];
      const leadRest = handValue(hand, x, wLead);
      let best = -Infinity;
      for (const y of legalFollows(partnerHand, x)) {
        const v = trickValue(cx, leader, x, y, comp, leadRest + handValue(partnerHand, y, wFollow));
        if (v > best) best = v;
      }
      totals[i] += best;
    }
  }
  let bi = 0;
  for (let i = 1; i < hand.length; i++) if (totals[i] > totals[bi]) bi = i;
  return hand[bi];
}

/** Which card to pass before the round: split up pairs that need a card in each hand, empty a colour. */
function choosePass(hand: number[]): number {
  const count = [0, 0, 0, 0];
  const suitCount = [0, 0, 0];
  for (const c of hand) {
    count[SYM_CODE[c]]++;
    suitCount[SUIT[c]]++;
  }
  let best = hand[0];
  let bestScore = -Infinity;
  for (const c of hand) {
    const s = SYM_CODE[c];
    let score = -CARD_VALUE[s];
    if (s === F && count[F] >= 2) score += 0.8; // a fish pair needs one 9 in each hand
    if (s === C && count[C] >= 3) score += 0.25; // so does a cannon pair
    if (count[s] >= 5) score += 0.15;
    if (suitCount[SUIT[c]] === 1) score += 0.2; // being out of a colour lets you play anything to it
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

const removeCard = (hand: number[], c: number) => {
  const i = hand.indexOf(c);
  if (i >= 0) hand.splice(i, 1);
};

function playTrick(g: Game, leader: number): number {
  const x = chooseLead(g, leader);
  removeCard(g.hands[leader], x);
  const y = chooseFollow(g, leader, x);
  removeCard(g.hands[1 - leader], y);
  return applyTrick(g, leader, x, y);
}

/**
 * Resolve a trick whose cards have already left the hands: winner, the pair's
 * action, discards, trick count and round end. Returns the winner's seat.
 */
export function applyTrick(g: Game, leader: number, x: number, y: number): number {
  if (SUIT[y] !== SUIT[x]) g.voids[1 - leader][SUIT[x]] = 1;
  const winner = followerWins(x, y) ? 1 - leader : leader;
  const towards = winner === 0 ? DIR_TOP : DIR_BOTTOM;
  const sx = SYM_CODE[x];
  const sy = SYM_CODE[y];
  const { ends, extra } = endsRound(g, winner);
  const toDiscard = [x, y];

  const options = moveOptions(g, winner, towards, x, y);
  if (options) {
    // The trick's winner chooses among their pirate's options.
    let pick = options[0];
    if (options.length > 1) {
      const cx = context(g);
      let bv = -Infinity;
      for (const o of options) {
        const v = positionValue(cx, o.ship, o.dmg, 0, ends);
        if (v > bv) {
          bv = v;
          pick = o;
        }
      }
    }
    for (const d of pick.dirs) if (!moveShip(g, d) || g.status !== "playing") break;
    // Tentacle damage happens even if the ship couldn't move; reaching the End comes first.
    const tentacles = (sx === T ? 1 : 0) + (sy === T ? 1 : 0);
    for (let i = 0; i < tentacles && g.status === "playing"; i++) damage(g);
  } else if ((sx === T && sy === C) || (sx === C && sy === T)) {
    const tentacle = sx === T ? x : y;
    heal(g, tentacle);
    toDiscard.splice(toDiscard.indexOf(tentacle), 1);
  } else if (sx === C && sy === C) {
    resolveFlips(g, winner, towards, ends);
  }

  for (const c of toDiscard) {
    g.discard.push(c);
    g.seen[c] = 1;
  }
  g.wins[winner]++;
  g.tricks++;
  g.totalTricks++;
  if (extra) g.extraUsed = true;
  g.roundOver = ends;
  return winner;
}

function resolveFlips(g: Game, winner: number, towards: number, roundEnds: boolean) {
  const flip = (): number => (g.deck.length ? g.deck.pop()! : -1);
  const toDiscard = (c: number) => {
    g.discard.push(c);
    g.seen[c] = 1;
  };
  const apply = (card: number) => {
    const s = SYM_CODE[card];
    if (s === T) return heal(g, card);
    toDiscard(card);
    if (s === H) moveShip(g, towards);
    else if (s === F) moveShip(g, DIR_AHEAD);
  };
  if (g.pirates[winner] === 1) {
    // Pirate 1: reveal two (cannons just lead to another flip), use the better, discard the other.
    const shown: number[] = [];
    while (shown.length < 2) {
      const c = flip();
      if (c < 0) break;
      if (SYM_CODE[c] === C) toDiscard(c);
      else shown.push(c);
    }
    if (!shown.length) return;
    const cx = context(g);
    const score = (c: number) => {
      const s = SYM_CODE[c];
      if (s === T) return positionValue(cx, g.ship, 0, 1, roundEnds);
      const m = planMove(g, [s === H ? towards : DIR_AHEAD], 0);
      return positionValue(cx, m.ship, m.dmg, 0, roundEnds);
    };
    shown.sort((a, b) => score(b) - score(a));
    shown.slice(1).forEach(toDiscard);
    apply(shown[0]);
    return;
  }
  for (;;) {
    const c = flip();
    if (c < 0) return; // empty deck: no effect
    if (SYM_CODE[c] === C) {
      toDiscard(c); // "flip another card"
      continue;
    }
    apply(c);
    return;
  }
}

function playRound(g: Game, firstLeader: number) {
  g.round++;
  g.roundsPlayed++;
  // Everything that isn't in the Kraken deck is shuffled into the new player deck.
  const pool = shuffle([...g.deck, ...g.discard, ...g.hands[0], ...g.hands[1]], g.rng);
  g.deck = pool;
  g.discard = [];
  g.hands = [[], []];
  g.seen = new Uint8Array(CARD_COUNT);
  for (const c of g.krakenDeck) if (c >= 0) g.seen[c] = 1;
  const each = Math.min(9, Math.floor(pool.length / 2));
  for (let i = 0; i < each; i++) {
    g.hands[0].push(g.deck.pop()!);
    g.hands[1].push(g.deck.pop()!);
  }
  // Each player passes one card before seeing the one they receive.
  if (each > 0) {
    const p0 = choosePass(g.hands[0]);
    const p1 = choosePass(g.hands[1]);
    removeCard(g.hands[0], p0);
    removeCard(g.hands[1], p1);
    g.hands[0].push(p1);
    g.hands[1].push(p0);
    g.passed = [p0, p1];
  }
  g.wins = [0, 0];
  g.tricks = 0;
  g.extraUsed = false;
  g.roundOver = false;
  g.voids = [new Uint8Array(3), new Uint8Array(3)];

  let leader = firstLeader;
  while (!g.roundOver && g.hands[0].length && g.hands[1].length) {
    leader = playTrick(g, leader);
    if (g.status !== "playing") return;
  }

  // End of round: the Kraken strikes, then the storm deadlines and the round limit.
  const dmg = g.track[Math.min(g.meeple, g.track.length - 1)];
  for (let i = 0; i < dmg && g.status === "playing"; i++) damage(g);
  if (g.status !== "playing") return;
  for (let i = 0; i < g.b.storms.length; i++) {
    if (g.b.deadlines[i] === g.round && COL[g.ship] <= g.b.storms[i]) return lose(g, "storm");
  }
  if (g.round >= 5) lose(g, "time");
}

function playGame(g: Game) {
  let leader = g.rng() < 0.5 ? 0 : 1;
  while (g.status === "playing") {
    playRound(g, leader);
    leader = 1 - leader; // the round disc alternates sides
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** A game at the start (before round 1 is dealt), for tests and tools. */
export function createGame(b: Board, options: SimOptions = {}): Game {
  const { dist, stormDist } = planningTables(b);
  return newGame(
    b,
    { pirates: options.pirates ?? [null, null], samples: options.samples ?? 8, krakenTrack: options.krakenTrack ?? DEFAULT_KRAKEN_TRACK },
    makeRng(options.seed ?? 1),
    dist,
    stormDist,
  );
}

export { damage as applyDamage, krakenState, playRound };

export function planningTables(b: Board) {
  const dist = distanceTo(b, (c) => b.goal[c] === 1, STRAIGHT_COST, KRAKEN_COST);
  const stormDist = b.storms.map((col) => distanceTo(b, (c) => COL[c] > col, STRAIGHT_COST, 0));
  return { dist, stormDist };
}

export function simulate(b: Board, options: SimOptions = {}): SimResult {
  const games = options.games ?? 300;
  const cfg: Config = {
    pirates: options.pirates ?? [null, null],
    samples: options.samples ?? 8,
    krakenTrack: options.krakenTrack ?? DEFAULT_KRAKEN_TRACK,
  };
  const rng = makeRng(options.seed ?? 1);
  const { dist, stormDist } = planningTables(b);
  const result: SimResult = {
    games,
    wins: 0,
    winRate: 0,
    losses: { storm: 0, kraken: 0, time: 0 },
    finishRounds: [0, 0, 0, 0, 0, 0],
    movesPerRound: 0,
    tricksPerRound: 0,
    damagePerGame: 0,
    moveShare: 0,
  };
  let rounds = 0;
  let moves = 0;
  let tricks = 0;
  let dmg = 0;
  const every = options.progressEvery ?? 50;
  const finish = (played: number): SimResult => ({
    ...result,
    games: played,
    losses: { ...result.losses },
    finishRounds: [...result.finishRounds],
    winRate: played ? result.wins / played : 0,
    movesPerRound: rounds ? moves / rounds : 0,
    tricksPerRound: rounds ? tricks / rounds : 0,
    damagePerGame: played ? dmg / played : 0,
    moveShare: tricks ? moves / tricks : 0,
  });
  for (let i = 0; i < games; i++) {
    const g = newGame(b, cfg, rng, dist, stormDist);
    playGame(g);
    if (g.status === "won") {
      result.wins++;
      result.finishRounds[g.round]++;
    } else if (g.reason) result.losses[g.reason]++;
    rounds += g.roundsPlayed;
    moves += g.moves;
    tricks += g.totalTricks;
    dmg += g.damage;
    if (options.onProgress && (i + 1) % every === 0 && i + 1 < games) options.onProgress(finish(i + 1));
  }
  return finish(games);
}
