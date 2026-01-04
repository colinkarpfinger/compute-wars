# Compute Wars - Game Specification

## Overview

**Compute Wars** is an arbitrage trading simulation where players buy and sell AI-related commodities across global markets. The game uses a JSON-based interface, making it playable by humans or automated agents.

**Core Loop:** Buy low in one market, travel, sell high in another. Manage inventory, respond to events, avoid risks, grow wealth.

**Session Type:** Endless with milestone unlocks

---

## Game State Schema

```typescript
interface GameState {
  // Player state
  player: {
    balance: number;           // Current cash
    debt: number;              // Amount owed to investors
    debtInterestRate: number;  // Daily interest rate (e.g., 0.05 = 5%)
    location: MarketId;        // Current market
    inventory: Inventory;      // Goods held
    inventoryCapacity: number; // Max inventory slots
    reputation: number;        // Affects event probabilities
  };

  // World state
  markets: Record<MarketId, Market>;
  turn: number;

  // Progression
  milestones: Milestone[];
  unlockedUpgrades: UpgradeId[];

  // Current turn info
  pendingEvents: GameEvent[];
  travelingTo: MarketId | null;  // If traveling, destination
}

type MarketId = 'us-west' | 'eu-central' | 'china-east' | 'singapore';

interface Market {
  id: MarketId;
  name: string;
  prices: Record<GoodId, number>;
  supply: Record<GoodId, SupplyLevel>;  // affects price volatility
  restricted: GoodId[];  // goods that can't be traded here currently
}

type GoodId = 'h100' | 'h200' | 'b100' | 'compute' | 'datasets' | 'talent';

type SupplyLevel = 'surplus' | 'normal' | 'shortage';

interface Inventory {
  [goodId: string]: number;  // goodId -> quantity
}

interface Milestone {
  id: string;
  name: string;
  description: string;
  condition: MilestoneCondition;
  reward: MilestoneReward;
  achieved: boolean;
  achievedOnTurn?: number;
}

interface GameEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  effects: EventEffect[];
}
```

---

## Goods

| ID | Name | Description | Base Price Range | Notes |
|----|------|-------------|------------------|-------|
| `h100` | NVIDIA H100 | Current-gen datacenter GPU | $25,000 - $40,000 | High volume, stable |
| `h200` | NVIDIA H200 | Next-gen GPU | $30,000 - $50,000 | More volatile |
| `b100` | NVIDIA B100 | Bleeding edge | $40,000 - $80,000 | Very volatile, high risk/reward |
| `compute` | Cloud Compute | GPU hours (units of 1000) | $500 - $2,000 | Bulk trading, low margin |
| `datasets` | Training Data | Licensed datasets | $10,000 - $30,000 | Affected by regulation events |
| `talent` | AI Researcher | Talent contracts | $50,000 - $150,000 | Rare, high value |

---

## Markets

| ID | Name | Characteristics |
|----|------|-----------------|
| `us-west` | US West Coast | Stable prices, high volume, strict regulations |
| `eu-central` | EU Central | Moderate prices, data privacy restrictions |
| `china-east` | China East | Volatile, export restrictions, high demand |
| `singapore` | Singapore | Trading hub, fewer restrictions, premium prices |

### Market Price Modifiers

Each market has tendencies:
- **US West**: -10% on compute, +10% on talent
- **EU Central**: +15% on datasets (GDPR demand), -5% on hardware
- **China East**: -20% on hardware (manufacturing), +30% on restricted goods risk
- **Singapore**: +10% baseline (premium hub), lowest restriction risk

---

## Actions

### Available Actions

```typescript
type Action =
  | { action: 'buy'; good: GoodId; quantity: number }
  | { action: 'sell'; good: GoodId; quantity: number }
  | { action: 'travel'; destination: MarketId }
  | { action: 'wait' }  // Stay in place, advance turn
  | { action: 'payDebt'; amount: number }
  | { action: 'borrow'; amount: number }
  | { action: 'upgrade'; upgradeId: UpgradeId };
```

### Action Validation

**buy:**
- Must have sufficient balance
- Must have inventory capacity
- Good must not be restricted in current market
- Quantity must be > 0

**sell:**
- Must have goods in inventory
- Good must not be restricted in current market
- Quantity must be <= owned quantity

**travel:**
- Cannot travel to current location
- Takes 1 turn (prices update, events may occur in transit)

**wait:**
- Always valid
- Advances turn, prices fluctuate, events may trigger

**payDebt:**
- Amount must be <= current balance
- Amount must be <= current debt

**borrow:**
- Amount must be > 0
- Total debt cannot exceed 2x current net worth
- Interest rate increases with debt level

**upgrade:**
- Must have sufficient balance
- Upgrade must be available (not already purchased, prerequisites met)

---

## Turn Structure

```
1. Process player action
2. If traveling:
   - Set travelingTo
   - Player cannot act next turn (auto-arrive)
3. Apply debt interest (debt *= 1 + interestRate)
4. Roll for random events
5. Update market prices
6. Check milestone conditions
7. Return new game state + events that occurred
```

---

## Pricing Mechanics

### Base Price Fluctuation

Each turn, prices fluctuate within bounds:

```typescript
function updatePrice(currentPrice: number, baseMin: number, baseMax: number, supply: SupplyLevel): number {
  const volatility = {
    'surplus': 0.05,   // +/- 5%
    'normal': 0.10,    // +/- 10%
    'shortage': 0.20   // +/- 20%
  }[supply];

  const change = (Math.random() - 0.5) * 2 * volatility;
  const newPrice = currentPrice * (1 + change);

  return clamp(newPrice, baseMin, baseMax);
}
```

### Supply Level Changes

Supply levels shift randomly each turn (10% chance per good per market):
- surplus -> normal -> shortage -> normal -> surplus

### Event-Driven Price Shocks

Events can cause immediate price changes (see Events section).

---

## Events

### Event Types

| Type | Description | Example |
|------|-------------|---------|
| `market_shift` | Price changes across markets | "NVIDIA announces H300 - H200 prices drop 30%" |
| `regulation` | Goods become restricted/unrestricted | "US export ban - H100 restricted in China" |
| `customs` | Lose inventory when traveling | "Shipment seized at customs - lost 2 H100s" |
| `hack` | Lose money | "Exchange hack - lost $50,000" |
| `audit` | Pay fine, possible restrictions | "Tax audit - pay $30,000 or face restrictions" |
| `opportunity` | Positive event | "Bulk buyer found - sell datasets at +50%" |
| `windfall` | Free resources | "Research grant received - +$25,000" |

### Event Probability

Base probabilities per turn:
- `market_shift`: 15%
- `regulation`: 5%
- `customs`: 10% (only when traveling, modified by destination)
- `hack`: 3%
- `audit`: 5% (increases with wealth)
- `opportunity`: 10%
- `windfall`: 2%

Reputation affects probabilities:
- High reputation: fewer negative events, more opportunities
- Low reputation: more audits, more customs issues

---

## Debt System

### Borrowing

- Can borrow up to 2x current net worth
- Base interest rate: 5% per turn
- Interest rate increases with debt level:
  - Debt < 50% net worth: 5%
  - Debt 50-100% net worth: 8%
  - Debt > 100% net worth: 12%

### Consequences

- If debt exceeds 3x net worth: Game Over (bankruptcy)
- High debt increases audit probability
- Cannot borrow more if already at limit

---

## Inventory & Upgrades

### Starting Capacity

- 10 inventory slots
- Each unit of a good takes 1 slot (regardless of good type)

### Upgrades

| ID | Name | Cost | Effect | Prerequisite |
|----|------|------|--------|--------------|
| `cargo_1` | Cargo Expansion I | $50,000 | +5 inventory slots | None |
| `cargo_2` | Cargo Expansion II | $150,000 | +10 inventory slots | cargo_1 |
| `cargo_3` | Cargo Expansion III | $500,000 | +20 inventory slots | cargo_2 |
| `reputation_1` | Industry Contacts | $100,000 | +10 reputation | None |
| `reputation_2` | Board Connections | $300,000 | +20 reputation | reputation_1 |
| `insurance` | Cargo Insurance | $200,000 | 50% chance to avoid customs seizure | None |
| `security` | Cybersecurity Suite | $150,000 | 50% chance to avoid hack events | None |

---

## Milestones

### Wealth Milestones

| Name | Condition | Reward |
|------|-----------|--------|
| Seed Round | Reach $100,000 net worth | Unlock `cargo_1` upgrade |
| Series A | Reach $500,000 net worth | Unlock `insurance` upgrade |
| Series B | Reach $1,000,000 net worth | Unlock `reputation_2` upgrade |
| Unicorn | Reach $10,000,000 net worth | Achievement badge |
| Decacorn | Reach $100,000,000 net worth | Achievement badge |

### Activity Milestones

| Name | Condition | Reward |
|------|-----------|--------|
| First Trade | Complete first buy+sell | Tutorial complete |
| Globetrotter | Visit all 4 markets | +5 reputation |
| Bulk Trader | Trade 100 goods total | Unlock `cargo_2` upgrade |
| Survivor | Survive 50 turns | Unlock `security` upgrade |
| Debt Free | Pay off all debt after borrowing | +10 reputation |

---

## Win/Lose Conditions

**No Win Condition** - Endless play, chase milestones and high scores.

**Lose Conditions:**
- Bankruptcy: Debt exceeds 3x net worth
- Destitution: Balance reaches $0 with no inventory and no ability to borrow

---

## Starting State

```typescript
const INITIAL_STATE: GameState = {
  player: {
    balance: 10000,
    debt: 0,
    debtInterestRate: 0.05,
    location: 'us-west',
    inventory: {},
    inventoryCapacity: 10,
    reputation: 50
  },
  markets: { /* initialized with base prices */ },
  turn: 1,
  milestones: [ /* all milestones, achieved: false */ ],
  unlockedUpgrades: [],
  pendingEvents: [],
  travelingTo: null
};
```

---

## API Response Format

Every action returns:

```typescript
interface ActionResponse {
  success: boolean;
  error?: string;  // If success is false

  state: GameState;

  // What happened this turn
  events: GameEvent[];
  priceChanges: Record<MarketId, Record<GoodId, { old: number; new: number }>>;
  milestonesAchieved: Milestone[];

  // Convenience
  netWorth: number;  // balance + inventory value - debt
  turnSummary: string;  // Human-readable summary
}
```

---

## Example Turn

**Input:**
```json
{
  "action": "buy",
  "good": "h100",
  "quantity": 2
}
```

**Output:**
```json
{
  "success": true,
  "state": {
    "player": {
      "balance": 45000,
      "debt": 0,
      "location": "us-west",
      "inventory": { "h100": 2 },
      "inventoryCapacity": 10,
      "reputation": 50
    },
    "markets": { "...": "..." },
    "turn": 2
  },
  "events": [
    {
      "type": "market_shift",
      "title": "Datacenter Boom",
      "description": "Major cloud expansion announced. H100 prices rising globally.",
      "effects": [{ "type": "price_change", "good": "h100", "change": 0.15 }]
    }
  ],
  "priceChanges": {
    "us-west": { "h100": { "old": 27500, "new": 31625 } }
  },
  "milestonesAchieved": [
    { "id": "first_trade", "name": "First Trade", "reward": "Tutorial complete" }
  ],
  "netWorth": 108250,
  "turnSummary": "Bought 2 H100s for $55,000. Market shift: H100 prices up 15%. Net worth: $108,250"
}
```

---

## Web UI Specification

### Overview

A single-page browser UI that wraps the JSON game engine. Minimal, functional, information-dense.

### Tech Stack

- Single HTML file with embedded CSS and JS
- Vanilla JavaScript (no frameworks)
- Game engine as a JS module imported into the page
- LocalStorage for save/load

### Layout

```
+----------------------------------------------------------+
|  COMPUTE WARS                          Turn: 42    Net Worth: $1.2M  |
+----------------------------------------------------------+
|                    |                                      |
|  PLAYER STATUS     |  MARKET: US West Coast               |
|  ---------------   |  ------------------------------------ |
|  Balance: $245,000 |  Good      Price    Supply   Action  |
|  Debt: $50,000     |  H100      $32,400  Normal   [Buy][Sell] |
|  Location: US West |  H200      $41,200  Shortage [Buy][Sell] |
|  Capacity: 7/15    |  B100      $58,000  Normal   [Buy][Sell] |
|                    |  Compute   $1,200   Surplus  [Buy][Sell] |
|  INVENTORY         |  Datasets  $22,000  Normal   [RESTRICTED] |
|  ---------------   |  Talent    $95,000  Normal   [Buy][Sell] |
|  H100 x 3          |                                      |
|  H200 x 2          +--------------------------------------+
|  Compute x 3       |  TRAVEL TO:                          |
|                    |  [EU Central] [China East] [Singapore]|
+--------------------+--------------------------------------+
|  EVENT LOG                                                |
|  ---------------------------------------------------------|
|  Turn 42: Bought 2 H100s for $64,800                     |
|  Turn 41: Market shift - H200 prices up 20%              |
|  Turn 40: Arrived in US West                             |
|  Turn 39: Traveling to US West...                        |
+----------------------------------------------------------+
|  [Wait] [Borrow $___] [Pay Debt $___] [Upgrades] [Save]  |
+----------------------------------------------------------+
```

### UI Components

#### Header Bar
- Game title
- Current turn number
- Net worth (updated each turn)

#### Player Status Panel (Left Sidebar)
- Current balance (cash)
- Current debt + interest rate
- Current location
- Inventory capacity (used/total)
- Inventory list with quantities

#### Market Panel (Main Area)
- Current market name
- Table of all goods:
  - Good name
  - Current price (with color: green if below average, red if above)
  - Supply level indicator (Surplus/Normal/Shortage)
  - Buy/Sell buttons (disabled if restricted or insufficient funds/inventory)
- Quantity input for buy/sell (default: 1, max button for convenience)

#### Travel Panel
- Buttons for each market (except current)
- Shows "Traveling..." state when in transit
- Disabled during travel

#### Event Log (Bottom)
- Scrollable list of recent events and actions
- Most recent at top
- Color-coded by type (red for negative, green for positive, white for neutral)

#### Action Bar (Footer)
- Wait button (skip turn)
- Borrow input + button
- Pay Debt input + button
- Upgrades button (opens modal)
- Save/Load buttons

### Modals

#### Buy/Sell Modal
When clicking Buy or Sell:
```
+---------------------------+
|  BUY H100                 |
|  ------------------------ |
|  Price: $32,400 each      |
|  You can afford: 7        |
|  Cargo space: 7 slots     |
|                           |
|  Quantity: [___] [MAX]    |
|  Total: $0                |
|                           |
|  [Cancel]  [Confirm]      |
+---------------------------+
```

#### Upgrades Modal
```
+----------------------------------------+
|  UPGRADES                              |
|  ------------------------------------- |
|  [x] Cargo Expansion I - $50,000       |
|      +5 inventory slots (PURCHASED)    |
|                                        |
|  [ ] Cargo Expansion II - $150,000     |
|      +10 inventory slots [BUY]         |
|                                        |
|  [ ] Insurance - $200,000 (LOCKED)     |
|      Requires: Series A milestone      |
|                                        |
|  [Close]                               |
+----------------------------------------+
```

#### Milestone Toast
When milestone achieved, show temporary notification:
```
+----------------------------------+
|  🎉 MILESTONE: Series A          |
|  Reached $500,000 net worth      |
|  Unlocked: Cargo Insurance       |
+----------------------------------+
```

#### Game Over Screen
```
+----------------------------------+
|  GAME OVER                       |
|  --------------------------      |
|  Bankruptcy on Turn 87           |
|  Peak Net Worth: $2.4M           |
|  Milestones: 6/10                |
|                                  |
|  [New Game]  [View Stats]        |
+----------------------------------+
```

### ASCII Art & Terminal Aesthetic

#### Title Logo

```
    ___    ____   _       __    ___    ____   _____
   /   |  /  _/  | |     / /   /   |  / __ \ / ___/
  / /| |  / /    | | /| / /   / /| | / /_/ / \__ \
 / ___ |_/ /     | |/ |/ /   / ___ |/ _, _/ ___/ /
/_/  |_/___/     |__/|__/   /_/  |_/_/ |_| /____/

        ═══════════════════════════════════════
              T R A D E   ·   P R O F I T   ·   S U R V I V E
        ═══════════════════════════════════════
```

#### Alternate Compact Logo (for headers)

```
╔═══════════════════════════════════════════════════════════╗
║  ▄▀█ █   █ █ █ ▄▀█ █▀█ █▀  ║  TURN: 042  ║  $1,247,500  ║
║  █▀█ █   ▀▄▀▄▀ █▀█ █▀▄ ▄█  ║  US-WEST    ║  ↑ +12.4%    ║
╚═══════════════════════════════════════════════════════════╝
```

#### Market Headers

```
┌─────────────────────────────────────┐
│  ▓▓▓ US WEST COAST ▓▓▓              │
│  Silicon Valley · High Regulations  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ▓▓▓ EU CENTRAL ▓▓▓                 │
│  Frankfurt · GDPR Zone              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ▓▓▓ CHINA EAST ▓▓▓                 │
│  Shanghai · Export Controls         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ▓▓▓ SINGAPORE ▓▓▓                  │
│  Trading Hub · Low Restrictions     │
└─────────────────────────────────────┘
```

#### Goods Icons (inline with text)

```
[■■■] H100      NVIDIA H100 GPU
[■■□] H200      NVIDIA H200 GPU
[■□□] B100      NVIDIA B100 GPU (Bleeding Edge)
[≡≡≡] COMPUTE  Cloud GPU Hours
[◆◆◆] DATA     Training Datasets
[☺☺☺] TALENT   AI Researcher Contracts
```

#### Event Banners

```
╔══════════════════════════════════════════════════════════════╗
║  ⚠  MARKET ALERT                                             ║
║  ────────────────────────────────────────────────────────    ║
║  NVIDIA announces H300 architecture                          ║
║  H200 prices dropping 25% globally                           ║
╚══════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════╗
║  🚨 CUSTOMS SEIZURE                                          ║
║  ────────────────────────────────────────────────────────    ║
║  Shipment intercepted at China border                        ║
║  LOST: 3x H100 ($97,200)                                     ║
╚══════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════╗
║  💰 OPPORTUNITY                                              ║
║  ────────────────────────────────────────────────────────    ║
║  Bulk buyer seeking datasets                                 ║
║  Sell now for +40% premium!                                  ║
╚══════════════════════════════════════════════════════════════╝
```

#### Game Over Screen

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     ██████╗  █████╗ ███╗   ██╗██╗  ██╗██████╗ ██╗   ██╗     ║
║     ██╔══██╗██╔══██╗████╗  ██║██║ ██╔╝██╔══██╗██║   ██║     ║
║     ██████╔╝███████║██╔██╗ ██║█████╔╝ ██████╔╝██║   ██║     ║
║     ██╔══██╗██╔══██║██║╚██╗██║██╔═██╗ ██╔══██╗██║   ██║     ║
║     ██████╔╝██║  ██║██║ ╚████║██║  ██╗██║  ██║╚██████╔╝     ║
║     ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝      ║
║                                                              ║
║     ─────────────────────────────────────────────────────    ║
║                                                              ║
║              Your debt exceeded 3x net worth.                ║
║              The investors have taken everything.            ║
║                                                              ║
║     ─────────────────────────────────────────────────────    ║
║                                                              ║
║              SURVIVED:     87 turns                          ║
║              PEAK WORTH:   $2,450,000                        ║
║              MILESTONES:   6 / 10                            ║
║                                                              ║
║                    [ NEW GAME ]                              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

#### Milestone Achievement

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ★ ═══════════════════════════════════════════════════ ★   ║
║                                                              ║
║              M I L E S T O N E   U N L O C K E D            ║
║                                                              ║
║                      ╔═══════════════╗                       ║
║                      ║   SERIES A    ║                       ║
║                      ╚═══════════════╝                       ║
║                                                              ║
║              Reached $500,000 net worth                      ║
║              UNLOCKED: Cargo Insurance                       ║
║                                                              ║
║   ★ ═══════════════════════════════════════════════════ ★   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

#### Loading/Traveling Animation (frames)

```
Frame 1:  ▓░░░░░░░░░  TRAVELING TO SINGAPORE...
Frame 2:  ▓▓░░░░░░░░  TRAVELING TO SINGAPORE...
Frame 3:  ▓▓▓░░░░░░░  TRAVELING TO SINGAPORE...
Frame 4:  ▓▓▓▓░░░░░░  TRAVELING TO SINGAPORE...
...
Frame 10: ▓▓▓▓▓▓▓▓▓▓  ARRIVED!
```

#### Supply Level Indicators

```
SURPLUS:   [▼▼▼] prices low, volatile
NORMAL:    [═══] stable market
SHORTAGE:  [▲▲▲] prices high, volatile
```

#### Decorative Borders

Use box-drawing characters consistently:
```
Single line:  ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼
Double line:  ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬
Mixed:        ╒ ╕ ╘ ╙ ╓ ╖ ╜ ╛
```

#### Terminal Color Palette

When rendering in the browser, map these to CSS:
```
├─ PROFIT GREEN ──────  #00ff00  (bright gains)
├─ LOSS RED ──────────  #ff4444  (losses, danger)
├─ WARNING AMBER ─────  #ffaa00  (caution)
├─ INFO CYAN ─────────  #00ffff  (neutral info)
├─ MUTED GRAY ────────  #888888  (secondary text)
├─ TERMINAL GREEN ────  #33ff33  (retro CRT vibe)
└─ BACKGROUND ────────  #0a0a0a  (near black)
```

### Visual Style

- Dark theme (easier on eyes, fits "trading terminal" aesthetic)
- Monospace font for ALL text (Fira Code, JetBrains Mono, or system monospace)
- Color coding:
  - Green: positive (profits, good events, below-average prices)
  - Red: negative (losses, bad events, above-average prices, debt)
  - Yellow: warnings (low funds, high debt)
  - Blue: neutral info, travel
- Minimal animations (number transitions, event fade-in)

### Responsive Behavior

- Desktop-first (1200px+ ideal)
- Tablet: stack sidebar below market panel
- Mobile: simplified single-column layout (playable but not optimal)

### Keyboard Shortcuts (Optional v1.1)

- `1-6`: Quick select goods
- `B`: Buy mode
- `S`: Sell mode
- `T`: Open travel
- `W`: Wait
- `Space`: Confirm action

### LocalStorage

Save game state to localStorage:
- Auto-save every turn
- Manual save button
- Load on page refresh
- Clear save on game over (after stats screen)

```typescript
interface SaveData {
  version: string;
  state: GameState;
  savedAt: string;  // ISO timestamp
}
```

---

## Implementation Notes

### For LLM Testing

The JSON interface allows:
1. Writing test cases as input/output pairs
2. Playing the game by generating valid action JSON
3. Verifying game logic without visual inspection

### Recommended Test Cases

- Buy/sell at various quantities
- Travel between all markets
- Trigger each event type
- Debt spiral to bankruptcy
- Achieve each milestone
- Edge cases: buy more than capacity, sell more than owned, etc.

### File Structure

```
compute-wars/
├── index.html      # Single-page UI
├── engine.js       # Game engine (pure logic, no DOM)
├── ui.js           # UI rendering and event handling
├── data.js         # Constants (goods, markets, events, upgrades)
└── test.js         # Engine test cases (optional)
```

The engine should be completely independent of the UI - importable as a module, callable with JSON actions, returns JSON responses.
