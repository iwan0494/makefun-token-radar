// The snapshot's own comps, fitted once by scripts/params.ts and written here as numbers only.
//
// These are frozen readings of the traded tokens in the 2026-11-14 snapshot, not a list of protocols:
// the model reads them with the snapshot's own figures and nothing here names a pre-token subject.
//   line       log(ratio) = a + b * log(tvl), the joint fit's reference line (ratio = mcap / tvl)
//   growth     the residual's slope on the seven-day change, to +-25% and again past it
//   seasoning  the log added per year of operation, among comps at least two years old
//   elite      the ratio residual quantiles of the top quartile of comps by size
//   category / family  residual tilts after the line and growth term, shrunk by n / (n + prior)
//
// Regenerate with: node scripts/params.ts (reads the kit's input/snapshot.json, writes these numbers).

import type { CompsModel, Curve, EliteBand, GrowthFit, SeasoningFit, Tilt } from './types.ts';

/** The fitted model, as scripts/params.ts read it from the snapshot on 2026-11-14. */
export const FROZEN: {
  as_of: string;
  n: number;
  line: { a: number; b: number };
  residual_scale: number;
  growth: { gamma: number; delta: number; n: number };
  seasoning: { slope: number; n: number };
  elite: { n: number; p50: number; p75: number; p90: number };
  category: Record<string, number>;
  family: Record<string, number>;
} = {
  as_of: '2026-11-14',
  n: 95,
  line: { a: 8.444179040737394, b: -0.5249166575171594 },
  residual_scale: 1.330552353063034,
  growth: { gamma: -3.112954999065211, delta: -10.695326622044233, n: 95 },
  seasoning: { slope: 0.30238312893371144, n: 63 },
  elite: { n: 24, p50: 0.13546309842063908, p75: 0.6669263519882409, p90: 1.4694263692692342 },
  category: {
    Lending: -0.6221249994256574, RWA: 0.12552972504594362, CEX: 0.3049738723038207, 'Basis Trading': 0.7789919055715883,
    'Liquid Staking': -1.2126626269946439, Yield: -0.7684370426165453, Dexs: -0.577699613689526, Bridge: -0.27656004426911973,
    CDP: -0.6980543972384833, 'Cross Chain Bridge': 0.04340267905039996, 'AI Agents': -0.4009749269524536,
    'Canonical Bridge': 0.1841735081545374, Derivatives: 0.459987127853424, 'Liquid Restaking': -0.6220541263901461,
    'Onchain Capital Allocator': -0.6054138516578513, Payments: -0.6127402162302964, Privacy: 0.75490378199851,
    Restaking: -0.12141530015490819, 'Token Locker': 0.37406479640023815, Chain: 0.4369244815689239,
    'Collateral Management': 0.7725259894300591, DOR: -0.30303720551243196, 'Decentralized AI': 0.4644628811851329,
    'Dual-Token Stablecoin': -0.5184891389332535, Launchpad: -0.038492703251981536, 'Leveraged Farming': -0.08025739750451993,
    'NFT Marketplace': 0.17252354783242554, 'Prediction Market': 1.1175402026807397, 'Risk Curators': 0.38737475856319026,
    'Staking Pool': -1.1008638477794301,
  },
  family: {
    lending: -0.10978676460452783, liquid: -0.3669433506769581, rwa: 0.025105945009188748, cex: 0.06535154406510442,
    basis: 0.17976736282421257, yield: -0.17733162521920293, dexs: -0.14442490342238154, bridge: -0.0754254666188509,
    cdp: -0.23268479907949435, cross: 0.014467559683466665, ai: -0.1503655976071701, canonical: 0.06906506555795151,
    derivatives: 0.17249517294503397, onchain: -0.22703019437169425, payments: -0.22977758108636115, privacy: 0.2830889182494412,
    restaking: -0.04553073755809056, token: 0.14027429865008934, chain: 0.1872533492438245,
    collateral: 0.3310825668985968, decentralized: 0.19905552050791409, dor: -0.12987308807675654,
    'dual-token': -0.22220963097139437, launchpad: -0.0164968728222778, leveraged: -0.03439602750193711,
    nft: 0.07393866335675381, prediction: 0.4789458011488884, risk: 0.16601775366993865, staking: -0.47179879190547,
  },
};

/** The tilts as fitted: the dashboard lists them by key; n is the comps behind each in the fit's pool. */
const tiltList = (record: Record<string, number>, counts: Record<string, number> = {}): Tilt[] =>
  Object.entries(record)
    .map(([key, value]) => ({ key, n: counts[key] ?? 0, raw: value, value }))
    .sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));

/** The frozen fit in the shape the model reads. */
export function frozenModel(asOf: string): CompsModel {
  const curve: Curve = {
    a: FROZEN.line.a,
    b: FROZEN.line.b,
    b_lo: -1.5,
    b_hi: 0.5,
    pinned: 'free',
    n: FROZEN.n,
    residual_scale: FROZEN.residual_scale,
    iterations: 24,
  };
  const growth: GrowthFit = { gamma: FROZEN.growth.gamma, delta: FROZEN.growth.delta, n: FROZEN.growth.n };
  const seasoning: SeasoningFit = {
    curve: { a: 0, b: FROZEN.seasoning.slope, b_lo: -1, b_hi: 1, pinned: 'free', n: FROZEN.seasoning.n, residual_scale: 0.5, iterations: 12 },
    slope: FROZEN.seasoning.slope,
    n: FROZEN.seasoning.n,
  };
  const elite: EliteBand = { ...FROZEN.elite };
  return {
    as_of: asOf,
    floor_usd: 0,
    traded: 0,
    comps: FROZEN.n,
    excluded_traded: 0,
    curve,
    elite,
    tilts: { category: tiltList(FROZEN.category), family: tiltList(FROZEN.family) },
    growth,
    seasoning,
    loo: [],
  };
}
