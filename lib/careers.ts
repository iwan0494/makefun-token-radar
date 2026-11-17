// Career families: how each kind of protocol reads the snapshot's arrays, and the action a reader takes
// on it. No protocol name appears here: a family is chosen by the category's first word, and the text
// is written from the protocol's own chains, size, age and growth.

import type { Protocol } from './types.ts';

export interface Career {
  key: string;
  /** The headline in the detail view. */
  label: string;
  /** What the protocol's TVL is, in one line. */
  holds: string;
  /** The action that makes this protocol's TVL, and therefore its launch, count. */
  action: string;
  /** The daily work a four-week campaign asks of the reader. */
  routine: string;
  /** What disqualifies or weakens the claim. */
  risk: string;
  /** What the token, if one comes, would most likely be paired with or settled in. */
  denominator: string;
  /** The kind of slash or lock the reader should know about before depositing. */
  lock: string;
}

export const CAREERS: Record<string, Career> = {
  lending: {
    key: 'lending',
    label: 'Lending and borrowing',
    holds: 'loan demand: deposits on one side, collateralised debt on the other',
    action: 'Supply a stable and borrow against it',
    routine: 'Touch the position daily with a small supply or repay',
    risk: 'Liquidation on volatile collateral',
    denominator: 'the protocol records no token, so its points (if any) are counted in the ledger it keeps, not in a token you can hold',
    lock: 'check the withdrawal queue and the utilisation limit before depositing: a full market pays no withdraw demand',
  },
  liquid: {
    key: 'liquid',
    label: 'Liquid staking and vault shares',
    holds: "staking receipts: the chain's stake wrapped in a liquid receipt",
    action: "Mint the protocol's receipt from the chain's staking asset and keep it",
    routine: 'Check in daily and move a small slice of holdings now and then',
    risk: 'A weak validator set or a receipt that is restaked elsewhere',
    denominator: 'the receipt is the accounting unit; its price is the stake, so growth comes from stake, not a second token',
    lock: 'most receipts unlock after the chain’s unstaking period; plan the exit before you deposit',
  },
  dexs: {
    key: 'dexs',
    label: 'Spot pools and market making',
    holds: 'pool liquidity: two-sided markets that earn the fee and pay the swap',
    action: 'Provide two-sided liquidity in its top pool',
    routine: 'Rebalance daily and collect the fees',
    risk: 'Divergence loss on a fast-moving pair',
    denominator: 'liquidity units and fees, not a token: the pair you supply is what the protocol keeps',
    lock: 'check whether the position is a locked NFT or a fungible LP share: only some protocols let you withdraw mid-epoch',
  },
  yield: {
    key: 'yield',
    label: 'Yield vaults and aggregators',
    holds: 'deposited yield-bearing assets, aggregated into one vault share',
    action: 'Deposit the vault’s underlying asset',
    routine: 'Compound daily and leave the default allocation as it is',
    risk: 'A strategy that is siloed or poorly collateralised',
    denominator: 'the vault share, whose price grows with the strategies it runs',
    lock: 'some vaults charge an exit fee or hold a redemption window; read that before the deposit, not after',
  },
  rwa: {
    key: 'rwa',
    label: 'Real-world assets',
    holds: 'claims on off-chain assets: treasuries, credit, invoices or real estate',
    action: 'Hold the protocol’s yield asset on chain',
    routine: 'Check the claim daily and note any coupon payment',
    risk: 'An issuer that cannot back the claim, or a capped tranche',
    denominator: 'the asset’s own face value and its issuance rails; there is no second token to mark',
    lock: 'redemptions are often batched to a monthly or quarterly window; a campaign shorter than that window cannot exit',
  },
  cex: {
    key: 'cex',
    label: 'Exchange and custody balances',
    holds: 'customer deposits held off the chain and settled on it',
    action: 'Keep a funded account and trade a little',
    routine: 'One small round trip a week, not one large deposit',
    risk: 'An exchange that holds the keys and can pause withdrawals',
    denominator: 'the exchange’s own ledger; the TVL is a balance, not a market',
    lock: 'withdrawals can be paused at the venue’s discretion; keep only what you can lose in a pause',
  },
  bridge: {
    key: 'bridge',
    label: 'Bridges and cross-chain rails',
    holds: 'liquidity locked on one chain to be minted on another',
    action: 'Move a stable across the bridge both ways',
    routine: 'Bridge a little back and forth once a week',
    risk: 'A relayer or committee that can be compromised',
    denominator: 'the bridged asset on the destination chain; its value is the asset, not the rail',
    lock: 'some bridges hold a delay on large withdrawals or on first-time destinations; test with a small amount',
  },
  cdp: {
    key: 'cdp',
    label: 'CDP and collateralised debt',
    holds: 'debt against posted collateral: the stable it mints is a liability of the vault',
    action: 'Post collateral and mint its stable',
    routine: 'Watch the collateral ratio daily and keep the debt open',
    risk: 'A sharp drop in collateral that triggers liquidation',
    denominator: 'the stable the vault mints, backed by the collateral it holds',
    lock: 'repaying the debt releases the collateral at once, but a locked vault may not let you repay without a fee',
  },
  basis: {
    key: 'basis',
    label: 'Basis and delta-neutral products',
    holds: 'collateral and a matching hedge across a spot and a perp leg',
    action: 'Deposit collateral into its hedged product',
    routine: 'Check the funding rate daily and leave the hedge standing',
    risk: 'A funding flip at the venue that runs the hedge',
    denominator: 'the hedged collateral; the product’s NAV is the reference, not a new token',
    lock: 'the hedge often lives on a separate venue; check that the two legs settle in the same withdrawal window',
  },
  restaking: {
    key: 'restaking',
    label: 'Restaked and shared security',
    holds: 'stake delegated to more than one service at once',
    action: 'Delegate stake to its operator set',
    routine: 'Check the delegation daily and do not move it mid-window',
    risk: 'A slash from any service the stake secures',
    denominator: 'the delegated stake and its receipts; the chain’s security is the product',
    lock: 'delegation changes usually take an epoch to settle; an early move may forfeit the window',
  },
  prediction: {
    key: 'prediction',
    label: 'Prediction and event markets',
    holds: 'escrowed collateral behind open positions',
    action: 'Place one small position on an open market',
    routine: 'Open and settle a small position once a week',
    risk: 'An event that resolves past the window',
    denominator: 'the market’s own resolution currency; the worth is what the market pays, not a launch token',
    lock: 'resolution and dispute windows keep the collateral escrowed even after the event; check before you size',
  },
  allocator: {
    key: 'allocator',
    label: 'Capital allocators and vault curators',
    holds: 'deposited capital allocated across strategies on behalf of the depositor',
    action: 'Deposit into its vault or curated strategy',
    routine: 'Check the allocation daily and keep the default strategy',
    risk: 'A curator that changes strategy mid-window',
    denominator: 'the vault share and its performance fee; the TVL is capital, not a market',
    lock: 'curated vaults often have a cooldown before withdrawal; size the deposit to the window',
  },
  chain: {
    key: 'chain',
    label: 'Chains and network services',
    holds: 'a chain’s own liquidity and fees, without a token in the record',
    action: 'Bridge in, swap, and hold the native asset',
    routine: 'Transact weekly on the chain and keep some liquidity there',
    risk: 'A chain that never lists a token in its record',
    denominator: 'the network’s native asset and its fee unit',
    lock: 'unbonding and bridging delays are chain-specific; move at least one epoch before you need the funds',
  },
  insurance: {
    key: 'insurance',
    label: 'Cover and risk markets',
    holds: 'premiums and the capital that backs claims',
    action: 'Buy a small cover, or supply backing capital',
    routine: 'Keep the cover on for the whole window',
    risk: 'A claim that freezes supplied capital',
    denominator: 'the insured asset and the premium paid in its unit',
    lock: 'claims can freeze capital while they are assessed; keep enough outside the position',
  },
  payments: {
    key: 'payments',
    label: 'Payments and rails',
    holds: 'settled volume and the float behind it',
    action: 'Route a small recurring payment',
    routine: 'One small payment a week',
    risk: 'A rail blocked in your jurisdiction',
    denominator: 'the currency the rail settles in, usually a stable',
    lock: 'payment rails can hold a transfer for compliance review; do not need the funds same-day',
  },
  derivative: {
    key: 'derivative',
    label: 'Perpetuals, options and structured products',
    holds: 'margin and premium: the collateral that backs a leveraged or option position',
    action: 'Deposit margin and open a small hedged position',
    routine: 'Roll or close the position weekly and leave margin between trades',
    risk: 'Leverage or expiry that wipes the margin',
    denominator: 'the margin asset and its funding/fee history',
    lock: 'open interest and margin stay with the venue until the position is closed; plan the exit',
  },
  privacy: {
    key: 'privacy',
    label: 'Privacy and shielded pools',
    holds: 'shielded deposits and the anonymity set around them',
    action: 'Shield a small amount and unshield another way',
    routine: 'Shield and unshield small amounts weekly',
    risk: 'A thin anonymity set or a restricted deposit',
    denominator: 'the shielded asset itself; the pool is a route, not a product',
    lock: 'unshielding can need a proof and a waiting period; test the full round trip first',
  },
  nft: {
    key: 'nft',
    label: 'NFT and token markets',
    holds: 'bids and listings placed on the order book',
    action: 'Place one small bid and let it stand',
    routine: 'Refresh the bid weekly',
    risk: 'A bid that fills into an illiquid asset',
    denominator: 'the collection and the currency the bids are denominated in',
    lock: 'bids can fill at any moment; keep only what you would hold anyway',
  },
  launchpad: {
    key: 'launchpad',
    label: 'Launchpads',
    holds: 'sales escrow: commitments held during a raise',
    action: 'Commit a little to an open sale',
    routine: 'Join one published sale a week',
    risk: 'A commitment locked until the sale settles',
    denominator: 'the raise currency and the sale token, when the pad has one',
    lock: 'sale funds often lock through the raise window; read the cancellation rule',
  },
  generic: {
    key: 'generic',
    label: 'Deposit and hold',
    holds: 'deposited liquidity the protocol counts on its own chains',
    action: 'Deposit a stable into its main product',
    routine: 'Touch the position weekly with a small deposit or withdraw',
    risk: 'A record that never carries a token',
    denominator: 'the deposit itself, in the stable you put in',
    lock: 'check the protocol’s own withdrawal terms; a deposit that cannot exit is not a cheap option',
  },
};

/** The career a category belongs to: its first word, else a deposit-and-hold plan. */
export function careerOf(category: string | null): Career {
  if (category === null) return CAREERS.generic!;
  const first = category.trim().split(/\s+/)[0]!.toLowerCase();
  if (first in CAREERS) return CAREERS[first]!;
  return CAREERS.generic!;
}

/** The protocol's main chain, in the words a reader would use. */
export function mainChain(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main network';
}

/** The second chain, where the protocol counts more than one. */
export function secondChain(p: Protocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}
