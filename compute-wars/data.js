// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE WARS - Game Data Constants
// ═══════════════════════════════════════════════════════════════════════════

export const GOODS = {
  h100: {
    id: 'h100',
    name: 'H100',
    fullName: 'NVIDIA H100 GPU',
    icon: '[■■■]',
    baseMin: 25000,
    baseMax: 40000,
    volatility: 'medium',
    description: 'Current-gen datacenter GPU. High volume, stable.'
  },
  h200: {
    id: 'h200',
    name: 'H200',
    fullName: 'NVIDIA H200 GPU',
    icon: '[■■□]',
    baseMin: 30000,
    baseMax: 50000,
    volatility: 'medium',
    description: 'Next-gen GPU. More volatile pricing.'
  },
  b100: {
    id: 'b100',
    name: 'B100',
    fullName: 'NVIDIA B100 GPU',
    icon: '[■□□]',
    baseMin: 40000,
    baseMax: 80000,
    volatility: 'high',
    description: 'Bleeding edge. Very volatile, high risk/reward.'
  },
  compute: {
    id: 'compute',
    name: 'Compute',
    fullName: 'Cloud GPU Hours',
    icon: '[≡≡≡]',
    baseMin: 500,
    baseMax: 2000,
    volatility: 'low',
    description: 'Bulk GPU hours (units of 1000). Low margin.'
  },
  datasets: {
    id: 'datasets',
    name: 'Datasets',
    fullName: 'Training Data',
    icon: '[◆◆◆]',
    baseMin: 10000,
    baseMax: 30000,
    volatility: 'medium',
    description: 'Licensed datasets. Affected by regulations.'
  },
  talent: {
    id: 'talent',
    name: 'Talent',
    fullName: 'AI Researcher',
    icon: '[☺☺☺]',
    baseMin: 50000,
    baseMax: 150000,
    volatility: 'high',
    description: 'Talent contracts. Rare, high value.'
  }
};

export const MARKETS = {
  'us-west': {
    id: 'us-west',
    name: 'US West Coast',
    subtitle: 'Silicon Valley · High Regulations',
    priceModifiers: {
      h100: 1.0,
      h200: 1.0,
      b100: 1.0,
      compute: 0.9,    // -10% on compute
      datasets: 1.0,
      talent: 1.1      // +10% on talent
    },
    customsRisk: 0.05,  // Low risk
    restrictedGoods: {},  // No restrictions
    description: 'Stable prices, high volume, strict regulations.'
  },
  'eu-central': {
    id: 'eu-central',
    name: 'EU Central',
    subtitle: 'Frankfurt · GDPR Zone',
    priceModifiers: {
      h100: 0.95,      // -5% on hardware
      h200: 0.95,
      b100: 0.95,
      compute: 1.0,
      datasets: 1.4,   // +40% on datasets (GDPR scarcity = high demand)
      talent: 1.0
    },
    customsRisk: 0.08,
    restrictedGoods: {
      datasets: { seizureRisk: 0.25, pricePremium: 1.4 }  // 25% seizure risk, 40% higher prices
    },
    description: 'Data privacy restrictions. Datasets risky but lucrative.'
  },
  'china-east': {
    id: 'china-east',
    name: 'China East',
    subtitle: 'Shanghai · Export Controls',
    priceModifiers: {
      h100: 1.5,       // +50% on restricted hardware (high demand due to ban)
      h200: 1.6,       // +60%
      b100: 1.8,       // +80% (most restricted)
      compute: 0.9,
      datasets: 1.0,
      talent: 0.85
    },
    customsRisk: 0.15,
    restrictedGoods: {
      h100: { seizureRisk: 0.30, pricePremium: 1.5 },   // 30% seizure, 50% premium
      h200: { seizureRisk: 0.35, pricePremium: 1.6 },   // 35% seizure, 60% premium
      b100: { seizureRisk: 0.45, pricePremium: 1.8 }    // 45% seizure, 80% premium
    },
    description: 'Export controls on GPUs. High risk, high reward.'
  },
  'singapore': {
    id: 'singapore',
    name: 'Singapore',
    subtitle: 'Trading Hub · Low Restrictions',
    priceModifiers: {
      h100: 1.1,       // +10% baseline (premium hub)
      h200: 1.1,
      b100: 1.1,
      compute: 1.1,
      datasets: 1.1,
      talent: 1.15
    },
    customsRisk: 0.03,  // Lowest risk
    restrictedGoods: {},  // No restrictions - safe haven
    description: 'Trading hub, no restrictions, premium prices.'
  }
};

export const SUPPLY_LEVELS = {
  surplus: {
    id: 'surplus',
    name: 'Surplus',
    icon: '[▼▼▼]',
    volatility: 0.05,
    priceMultiplier: 0.85
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    icon: '[═══]',
    volatility: 0.10,
    priceMultiplier: 1.0
  },
  shortage: {
    id: 'shortage',
    name: 'Shortage',
    icon: '[▲▲▲]',
    volatility: 0.20,
    priceMultiplier: 1.20
  }
};

export const UPGRADES = {
  cargo_1: {
    id: 'cargo_1',
    name: 'Cargo Expansion I',
    cost: 50000,
    effect: { type: 'inventory', value: 5 },
    prerequisite: null,
    description: '+5 inventory slots'
  },
  cargo_2: {
    id: 'cargo_2',
    name: 'Cargo Expansion II',
    cost: 150000,
    effect: { type: 'inventory', value: 10 },
    prerequisite: 'cargo_1',
    description: '+10 inventory slots'
  },
  cargo_3: {
    id: 'cargo_3',
    name: 'Cargo Expansion III',
    cost: 500000,
    effect: { type: 'inventory', value: 20 },
    prerequisite: 'cargo_2',
    description: '+20 inventory slots'
  },
  reputation_1: {
    id: 'reputation_1',
    name: 'Industry Contacts',
    cost: 100000,
    effect: { type: 'reputation', value: 10 },
    prerequisite: null,
    description: '+10 reputation'
  },
  reputation_2: {
    id: 'reputation_2',
    name: 'Board Connections',
    cost: 300000,
    effect: { type: 'reputation', value: 20 },
    prerequisite: 'reputation_1',
    description: '+20 reputation'
  },
  insurance: {
    id: 'insurance',
    name: 'Cargo Insurance',
    cost: 200000,
    effect: { type: 'customs_protection', value: 0.5 },
    prerequisite: null,
    unlockedByMilestone: 'series_a',
    description: '50% chance to avoid customs seizure'
  },
  security: {
    id: 'security',
    name: 'Cybersecurity Suite',
    cost: 150000,
    effect: { type: 'hack_protection', value: 0.5 },
    prerequisite: null,
    unlockedByMilestone: 'survivor',
    description: '50% chance to avoid hack events'
  }
};

export const MILESTONES = {
  // Wealth milestones
  seed_round: {
    id: 'seed_round',
    name: 'Seed Round',
    condition: { type: 'net_worth', value: 100000 },
    reward: { type: 'unlock_upgrade', value: 'cargo_1' },
    description: 'Reach $100,000 net worth'
  },
  series_a: {
    id: 'series_a',
    name: 'Series A',
    condition: { type: 'net_worth', value: 500000 },
    reward: { type: 'unlock_upgrade', value: 'insurance' },
    description: 'Reach $500,000 net worth'
  },
  series_b: {
    id: 'series_b',
    name: 'Series B',
    condition: { type: 'net_worth', value: 1000000 },
    reward: { type: 'unlock_upgrade', value: 'reputation_2' },
    description: 'Reach $1,000,000 net worth'
  },
  unicorn: {
    id: 'unicorn',
    name: 'Unicorn',
    condition: { type: 'net_worth', value: 10000000 },
    reward: { type: 'achievement', value: 'unicorn_badge' },
    description: 'Reach $10,000,000 net worth'
  },
  decacorn: {
    id: 'decacorn',
    name: 'Decacorn',
    condition: { type: 'net_worth', value: 100000000 },
    reward: { type: 'achievement', value: 'decacorn_badge' },
    description: 'Reach $100,000,000 net worth'
  },
  // Activity milestones
  first_trade: {
    id: 'first_trade',
    name: 'First Trade',
    condition: { type: 'trades', value: 1 },
    reward: { type: 'tutorial', value: 'complete' },
    description: 'Complete your first buy or sell'
  },
  globetrotter: {
    id: 'globetrotter',
    name: 'Globetrotter',
    condition: { type: 'markets_visited', value: 4 },
    reward: { type: 'reputation', value: 5 },
    description: 'Visit all 4 markets'
  },
  bulk_trader: {
    id: 'bulk_trader',
    name: 'Bulk Trader',
    condition: { type: 'goods_traded', value: 100 },
    reward: { type: 'unlock_upgrade', value: 'cargo_2' },
    description: 'Trade 100 goods total'
  },
  survivor: {
    id: 'survivor',
    name: 'Survivor',
    condition: { type: 'turns', value: 50 },
    reward: { type: 'unlock_upgrade', value: 'security' },
    description: 'Survive 50 turns'
  },
  debt_free: {
    id: 'debt_free',
    name: 'Debt Free',
    condition: { type: 'paid_off_debt', value: true },
    reward: { type: 'reputation', value: 10 },
    description: 'Pay off all debt after borrowing'
  }
};

export const EVENTS = {
  // Market shift events
  nvidia_announcement: {
    id: 'nvidia_announcement',
    type: 'market_shift',
    title: 'NVIDIA Announcement',
    templates: [
      { text: 'NVIDIA announces next-gen architecture. {good} prices dropping {percent}% globally.', effect: 'drop' },
      { text: 'NVIDIA reports supply shortage. {good} prices rising {percent}% globally.', effect: 'rise' },
      { text: 'NVIDIA beats earnings expectations. All GPU prices up {percent}%.', effect: 'rise_all' }
    ],
    probability: 0.08
  },
  datacenter_news: {
    id: 'datacenter_news',
    type: 'market_shift',
    title: 'Datacenter News',
    templates: [
      { text: 'Major cloud expansion announced. Compute demand surging.', effect: 'compute_rise' },
      { text: 'Datacenter fire in Virginia. Cloud credits spiking.', effect: 'compute_spike' },
      { text: 'Energy crisis affecting datacenters. Compute prices volatile.', effect: 'compute_volatile' }
    ],
    probability: 0.07
  },
  ai_breakthrough: {
    id: 'ai_breakthrough',
    type: 'market_shift',
    title: 'AI Breakthrough',
    templates: [
      { text: 'Major AI lab publishes breakthrough paper. Talent demand soaring.', effect: 'talent_rise' },
      { text: 'New training technique reduces compute needs. Compute prices falling.', effect: 'compute_drop' },
      { text: 'Open-source model released. Dataset prices dropping.', effect: 'datasets_drop' }
    ],
    probability: 0.05
  },
  // Regulation events
  export_ban: {
    id: 'export_ban',
    type: 'regulation',
    title: 'Export Restrictions',
    templates: [
      { text: 'US tightens export controls. {good} now restricted in China.', market: 'china-east' },
      { text: 'EU data regulations expanded. Datasets restricted in EU Central.', market: 'eu-central' },
      { text: 'Export ban lifted on {good}. Trade freely again.', effect: 'unrestrict' }
    ],
    probability: 0.05
  },
  // Customs events
  customs_seizure: {
    id: 'customs_seizure',
    type: 'customs',
    title: 'Customs Seizure',
    templates: [
      { text: 'Shipment intercepted at border. Lost {quantity}x {good}.', effect: 'seize' },
      { text: 'Customs inspection delayed shipment. Minor fees incurred.', effect: 'fee' }
    ],
    probability: 0.10  // Modified by market risk and travel
  },
  // Hack events
  exchange_hack: {
    id: 'exchange_hack',
    type: 'hack',
    title: 'Security Breach',
    templates: [
      { text: 'Exchange hack detected. Lost ${amount} from your account.', effect: 'money_loss' },
      { text: 'Phishing attack on your credentials. Minor security fees.', effect: 'small_fee' }
    ],
    probability: 0.03
  },
  // Audit events
  tax_audit: {
    id: 'tax_audit',
    type: 'audit',
    title: 'Tax Audit',
    templates: [
      { text: 'Tax authorities investigating. Pay ${amount} fine.', effect: 'fine' },
      { text: 'Compliance review required. Operations slowed.', effect: 'slow' }
    ],
    probability: 0.05
  },
  // Opportunity events
  bulk_buyer: {
    id: 'bulk_buyer',
    type: 'opportunity',
    title: 'Opportunity',
    templates: [
      { text: 'Bulk buyer seeking {good}. Sell now for +{percent}% premium!', effect: 'premium_sell' },
      { text: 'Desperate seller offloading {good}. Buy at -{percent}% discount!', effect: 'discount_buy' }
    ],
    probability: 0.10
  },
  // Windfall events
  windfall: {
    id: 'windfall',
    type: 'windfall',
    title: 'Windfall',
    templates: [
      { text: 'Research grant received. +${amount}!', effect: 'money_gain' },
      { text: 'Investment returns arrived. +${amount}!', effect: 'money_gain' },
      { text: 'Old invoice finally paid. +${amount}!', effect: 'money_gain' }
    ],
    probability: 0.02
  }
};

// Travel choice events - require player decision
export const TRAVEL_CHOICES = {
  shady_deal: {
    id: 'shady_deal',
    type: 'shady_deal',
    title: 'Shady Deal',
    probability: 0.12,
    templates: [
      {
        text: 'A nervous seller approaches: "I have {quantity}x {good} at {discount}% off. No questions asked..."',
        riskText: '{risk}% chance they\'re counterfeit',
        choices: [
          { id: 'accept', label: 'Accept the Risk', icon: '⚠' },
          { id: 'decline', label: 'Walk Away', icon: '✗' }
        ]
      }
    ]
  },
  gambling: {
    id: 'gambling',
    type: 'gambling',
    title: 'Underground Casino',
    probability: 0.08,
    templates: [
      {
        text: 'You stumble upon an underground GPU casino. "Double or nothing on ${amount}?"',
        riskText: '50% chance to double, 50% to lose it all',
        choices: [
          { id: 'gamble', label: 'Let it Ride', icon: '🎲' },
          { id: 'decline', label: 'Too Risky', icon: '✗' }
        ]
      },
      {
        text: 'A high-stakes GPU auction is starting. Entry fee: ${entryFee}. Mystery prize pool.',
        riskText: 'Could win big... or lose your entry',
        choices: [
          { id: 'enter', label: 'Enter Auction', icon: '💰' },
          { id: 'decline', label: 'Skip It', icon: '✗' }
        ]
      }
    ]
  },
  intel: {
    id: 'intel',
    type: 'intel',
    title: 'Intel Offer',
    probability: 0.10,
    templates: [
      {
        text: 'A former {company} engineer whispers: "I know something about {good} prices. ${cost} for the tip."',
        riskText: '{accuracy}% chance the intel is accurate',
        choices: [
          { id: 'buy', label: 'Buy the Intel', icon: '🔍' },
          { id: 'decline', label: 'Pass', icon: '✗' }
        ]
      }
    ],
    companies: ['OpenAI', 'Anthropic', 'Google DeepMind', 'Meta AI', 'NVIDIA', 'Microsoft']
  },
  smuggler: {
    id: 'smuggler',
    type: 'smuggler',
    title: 'Smuggler Contact',
    probability: 0.06,
    requiresRestrictedGoods: true,
    templates: [
      {
        text: 'A smuggler offers to move your restricted cargo past customs for ${cost}.',
        riskText: '{success}% success rate. Failure = total seizure',
        choices: [
          { id: 'use_smuggler', label: 'Use Smuggler', icon: '🕵' },
          { id: 'decline', label: 'Take Normal Route', icon: '✗' }
        ]
      }
    ]
  }
};

// Oracle predictions
export const ORACLE = {
  name: 'The Algorithm',
  icon: '[◈◈◈]',
  probability: 0.15,  // Chance to appear each turn
  baseCost: 5000,
  predictions: [
    { text: 'I sense {good} prices will surge within 2 turns...', type: 'price_up', accuracy: 0.70 },
    { text: 'The market whispers of a {good} crash coming...', type: 'price_down', accuracy: 0.70 },
    { text: 'Customs will tighten at {market} soon. Be warned.', type: 'customs', accuracy: 0.65 },
    { text: 'A great opportunity approaches for those who hold {good}...', type: 'opportunity', accuracy: 0.60 },
    { text: 'I foresee turbulence. All markets will shift.', type: 'volatility', accuracy: 0.55 }
  ],
  freeHints: [
    'The winds favor the patient trader...',
    'Fortune smiles on those with diverse holdings...',
    'Beware the market that seems too calm...',
    'High debt invites misfortune...'
  ]
};

export const CONFIG = {
  startingBalance: 10000,
  startingInventoryCapacity: 10,
  startingReputation: 50,
  startingLocation: 'us-west',

  debtBaseInterestRate: 0.05,
  debtMediumInterestRate: 0.08,
  debtHighInterestRate: 0.12,
  debtMediumThreshold: 0.5,   // 50% of net worth
  debtHighThreshold: 1.0,     // 100% of net worth
  maxDebtMultiplier: 2.0,     // Can borrow up to 2x net worth
  bankruptcyMultiplier: 3.0,  // Game over if debt > 3x net worth

  supplyShiftChance: 0.10,    // 10% chance per good per market per turn

  reputationEventModifier: 0.01  // 1% change in event probability per reputation point from 50
};

// ASCII Art
export const ASCII = {
  title: `
  ___ ___  __  __ ___ _   _ _____ ___   __      ___   ___  ___
 / __/ _ \\|  \\/  | _ | | | |_   _| __| \\ \\    / /_\\ | _ \\/ __|
| (_| (_) | |\\/| |  _| |_| | | | | _|   \\ \\/\\/ / _ \\|   /\\__ \\
 \\___\\___/|_|  |_|_|  \\___/  |_| |___|   \\_/\\_/_/ \\_|_|_\\|___/

        ═══════════════════════════════════════
          T R A D E  ·  P R O F I T  ·  S U R V I V E
        ═══════════════════════════════════════`,

  bankrupt: `
     ██████╗  █████╗ ███╗   ██╗██╗  ██╗██████╗ ██╗   ██╗██████╗ ████████╗
     ██╔══██╗██╔══██╗████╗  ██║██║ ██╔╝██╔══██╗██║   ██║██╔══██╗╚══██╔══╝
     ██████╔╝███████║██╔██╗ ██║█████╔╝ ██████╔╝██║   ██║██████╔╝   ██║
     ██╔══██╗██╔══██║██║╚██╗██║██╔═██╗ ██╔══██╗██║   ██║██╔═══╝    ██║
     ██████╔╝██║  ██║██║ ╚████║██║  ██╗██║  ██║╚██████╔╝██║        ██║
     ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝        ╚═╝`,

  divider: '═══════════════════════════════════════════════════════════════',
  thinDivider: '───────────────────────────────────────────────────────────────'
};
