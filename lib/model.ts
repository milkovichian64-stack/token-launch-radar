// Token Radar model v2: one snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a
// ceiling) and adds every other rankable protocol that records no token, so
// the early radar is the whole pre-token universe the snapshot carries, not a
// hand-picked slice. A protocol is pre-token when the snapshot records no
// token for it: mcap_usd, gecko_id and symbol are all null. Protocols whose
// token already trades are never ranked here; they are shown separately with
// the market's own capitalisation.
//
// Implied value uses ONLY snapshot fields (tvl_usd, change_7d, listed_at,
// category, chains). No protocol name is ever special-cased.
//
//   age_days       = as_of - listed_at in days (null when unlisted)
//   category_mult  = revenue-model multiple for the protocol's category
//   growth_mult    = 1 + clamp(change_7d, -50, 100) / 100 * 0.65
//                    (change_7d null counts as 0: no news is not growth)
//   maturity_mult  = 0.55 + 0.55 * sqrt(min(age_days, 1825) / 1825)
//                    (unknown age counts as 365 days; the square root means
//                    the first tokenless years earn trust fastest)
//   reach_mult     = 1 + 0.04 * min(chains - 1, 7)
//                    (each extra chain up to seven adds distribution reach)
//   implied_value  = max(1, round(tvl_usd * category_mult * growth_mult
//                                  * maturity_mult * reach_mult))
//
// Rationale: TVL is capital users already trust the protocol with. A token
// capitalises a slice of that trust, and the slice differs by business model:
// trading venues and chains historically capitalise far above their TVL,
// lending books below them, bridges lowest because most bridge TVL is pass-
// through collateral. Momentum (7d TVL growth), survival without a token
// (age) and distribution (chain count) adjust the slice up or down.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_base: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_max_extra: number;
  default_category_multiple: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.65,
  growth_floor: -50,
  growth_cap: 100,
  maturity_base: 0.55,
  maturity_range: 0.55,
  maturity_days: 1825,
  unknown_age_days: 365,
  reach_per_chain: 0.04,
  reach_max_extra: 7,
  default_category_multiple: 0.35,
};

export const MODEL_VERSION = 'radar-2';

/** Category multiples: how much of TVL a token for that business model capitalises. */
export function categoryMultiple(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('chain')) return 0.7;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return 0.62;
  if (c.includes('dex')) return 0.55;
  if (c.includes('prediction')) return 0.5;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 0.42;
  if (c.includes('curator') || c.includes('allocator')) return 0.4;
  if (c.includes('yield') || c.includes('farm') || c.includes('liquidity')) return 0.38;
  if (c.includes('staking') || c.includes('restak')) return 0.36;
  if (c.includes('rwa')) return 0.34;
  if (c.includes('insurance')) return 0.32;
  if (c.includes('bridge')) return 0.3;
  return MODEL.default_category_multiple;
}

/** How many live-token protocols the dashboard's live view carries, by market cap. */
export const LIVE_ROWS = 30;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; catMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_base + model.maturity_range * Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const reachMult = 1 + model.reach_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra);
  const catMult = categoryMultiple(protocol.category);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult * reachMult));
  return { implied, growthPct, growthMult, maturityMult, reachMult, catMult, age };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that are pass-through products of an asset that already trades, not launch candidates. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Rankable means a genuine launch candidate: records no token, and is not a
 * wrapped, staked or bridged product of a token that already trades (WBTC,
 * exchange staked ETH and bridged stablecoins record no token of their own,
 * yet ranking them would price a token that can never launch), not an
 * exchange's own book, and not a versioned pool of another protocol. This is
 * the same logic the snapshot's watchlist rule uses, applied board-wide.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !(p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol in the snapshot,
  // whatever its TVL. The snapshot itself floors TVL at $5M, so this stays a
  // serious universe (a few hundred rows), ranked purely by the model.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.catMult,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      reach_multiplier: round4(s.reachMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** Gas reality by chain family, so step costs are concrete instead of generic. */
export function gasFor(chain: string): { label: string; swap: string } {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return { label: '$8-$20 of ETH for gas', swap: '$6-$15 per transaction' };
  if (c.includes('solana')) return { label: 'under $0.10 of SOL for fees', swap: 'under $0.10 per transaction' };
  if (c.includes('bitcoin')) return { label: '$1-$4 of BTC for fees', swap: '$1-$4 per transaction' };
  if (
    c.includes('arbitrum') || c.includes('base') || c.includes('optimism') || c.includes('linea') ||
    c.includes('scroll') || c.includes('zksync') || c.includes('mantle') || c.includes('mode')
  ) {
    return { label: '$0.20-$1.50 of ETH for gas', swap: '$0.20-$1 per transaction' };
  }
  return { label: '$0.50-$3 of the native gas token', swap: '$0.50-$3 per transaction' };
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 2_000_000_000) return 500;
  if (p.tvl_usd >= 500_000_000) return 300;
  if (p.tvl_usd >= 100_000_000) return 200;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 75;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${n} on ${chain}, then borrow $${Math.round(capital * 0.4)} against it and re-supply the borrowed amount so both sides of the market record your wallet`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Swap $${Math.round(capital / 2)} of USDC into the pool's second asset on ${n}, add $${capital} of two-sided liquidity to its main ${chain} pool and keep the LP position open`;
  if (c.includes('yield'))
    return `Deposit $${capital} of USDC into ${n}'s highest-TVL vault on ${chain} and leave auto-compounding switched on so the share balance grows on its own`;
  if (c.includes('bridge') || c.includes('canonical'))
    return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then spend at least $${Math.round(capital * 0.3)} of it in one app on the destination chain the same day`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} worth of the native staking asset through ${n} on ${chain} and keep the liquid receipt token in the same wallet, unstaked and visible`;
  if (c.includes('derivative') || c.includes('perpetual'))
    return `Deposit $${capital} of USDC as margin on ${n}, open one small hedged position (long and short legs of $${Math.round(capital * 0.3)} each) and let it accrue funding history`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${n} and take positions in at least three different open markets, sized $${Math.round(capital / 5)} or less each, instead of one large bet`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Allocate $${capital} of USDC into one curated ${n} vault on ${chain}, choosing the vault with the longest live track record rather than the highest advertised APY`;
  if (c.includes('rwa'))
    return `Mint $${capital} of ${n}'s yield-bearing asset on ${chain} with USDC and hold the minted asset; do not immediately loop it into a second protocol`;
  if (c.includes('insurance'))
    return `Buy $${capital} of protocol cover from ${n} on ${chain} for a position you actually hold elsewhere, and keep the policy NFT in the farming wallet until it expires`;
  if (c.includes('chain'))
    return `Bridge $${capital} of USDC onto ${chain} through ${n}'s canonical route, then make your first swap and one contract interaction inside its own app on the same day`;
  return `Deposit $${capital} of USDC into ${n}'s main product on ${chain} and keep the position open; use the product's primary action (deposit, supply or mint), not a test dust amount`;
}

function secondAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp'))
    return `Repay $${Math.round(capital * 0.2)} of the borrow and borrow it again once, so the wallet shows a full borrow-repay cycle on ${n} rather than a single passive deposit`;
  if (c.includes('dex') || c.includes('yield'))
    return `Make three direct swaps of about $${Math.round(capital * 0.2)} each through ${n} on ${chain} on different days, so the wallet reads as a returning user and not a one-off LP`;
  if (c.includes('derivative') || c.includes('perpetual'))
    return `Close and reopen the hedge once after at least 7 days, realising no more than $${Math.round(capital * 0.05)} of trading loss, to build a second week of volume history on ${n}`;
  if (c.includes('staking') || c.includes('restak'))
    return `Use the receipt token once inside ${n}'s own ecosystem (restake it, vote with it or supply it where ${n} itself directs) instead of selling it on day one`;
  if (c.includes('bridge'))
    return `Bridge $${Math.round(capital * 0.5)} back the other way through ${n} after at least 14 days, so the wallet has a genuine round trip and not a single one-way transfer`;
  return `Repeat ${n}'s primary action with $${Math.round(capital * 0.25)} more on ${chain} in week two, from the same wallet, so activity spans more than one weekly snapshot`;
}

/**
 * A protocol's farm plan: seven steps derived from its category, chains, TVL
 * and age. Every step names the action, the money and the time. The dashboard
 * re-derives the identical plan from the same fields, so page and board agree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const weeks = Math.max(2, Math.round(hold / 7));
  const steps: FarmStep[] = [
    {
      text: `Create one fresh wallet dedicated to ${p.name}, fund it with $${capital + 50} of USDC plus ${gas.label} on ${chain}, and store the seed phrase offline before any deposit`,
      cost: `$${capital + 50} of stablecoins plus ${gas.label}`,
      time: '10 minutes to set up, funds settle the same day',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `$${capital} of capital committed, about ${gas.swap} in fees`,
      time: '20 minutes for the first position',
    },
    {
      text: secondAction(p, capital, chain),
      cost: `about ${gas.swap} in fees, no new capital beyond the step 2 position`,
      time: '15 minutes, done in week two',
    },
    {
      text: `Return once a week for ${weeks} weeks: claim any rewards, re-balance if the position drifted by more than 10 percent, and make at least one small qualifying transaction on ${p.name} each visit`,
      cost: `about ${gas.swap} per weekly visit`,
      time: `10 minutes a week for ${weeks} weeks`,
    },
  ];
  if (second !== null) {
    steps.push({
      text: `Repeat the core position with $50 of USDC on ${second}, ${p.name}'s second chain, from the same wallet, because multi-chain users are the cohort most launches reward first`,
      cost: '$50 of extra capital plus under $2 of gas on most second chains',
      time: '15 minutes once, then it rides along with the weekly check',
    });
  } else {
    steps.push({
      text: `Deepen instead of spreading: add $50 more to the ${chain} position in week three, because ${p.name} runs on a single chain and depth in one wallet beats five dust wallets`,
      cost: '$50 of extra capital plus one transaction fee',
      time: '10 minutes once in week three',
    });
  }
  steps.push(
    {
      text: `Hold the full position for at least ${hold} days without withdrawing below $${Math.round(capital * 0.8)}, so the wallet appears in at least ${weeks} separate weekly snapshots of ${p.name}`,
      cost: `the $${capital} stays locked in the position for the whole period`,
      time: `${hold} days of holding`,
    },
    {
      text: `On the last day, screenshot the position, export the wallet's ${p.name} transaction history into a farm log with dates and amounts, and withdraw only after checking the protocol's official points or announcement page for a snapshot date`,
      cost: 'nothing to log; withdrawal costs one transaction fee',
      time: '20 minutes to document and exit cleanly',
    },
  );
  return steps;
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: row.watchlist,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd)
    return `all ${board.length} rows share the same implied value`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
