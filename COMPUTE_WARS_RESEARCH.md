# Compute Wars - Research & Design Discussion

## Project Goals

Build a game that is **well-suited for LLM development**:
- Easy for an LLM to write and modify
- Easy for an LLM to test its own work
- Browser-based or text-based (no 3D spatial reasoning required)
- Simple, proven mechanics

## Game Concept

**Compute Wars** - A trading/arbitrage simulation game inspired by the classic "Drug Wars" formula, themed around the AI industry.

Core loop: Buy low, sell high across different markets. Manage risk, respond to random events, maximize wealth within a time limit.

### Theme Elements

**Tradeable Goods:**
- Hardware: H100, H200, B100 chips, TPUs, custom ASICs
- Compute: GPU hours, cloud credits, reserved capacity
- Intangibles: Training datasets, model weights, AI company equity, talent contracts

**Markets/Locations:**
- Cloud providers (AWS, GCP, Azure, Oracle)
- Regions (US, EU, China, Singapore)
- Abstract markets (Wholesale, Gray Market, Government Contracts)

**Random Events:**
- "NVIDIA announces H300 - H200 prices crater"
- "Export ban to China - chip prices spike in Singapore"
- "Data center fire in Virginia - compute costs surge"
- "Antitrust probe opened - Big Tech stocks drop"
- "Breakthrough paper from DeepMind - talent prices soar"
- "Your shipment was intercepted by customs"

---

## Genre Research

### The Drug Wars Formula

The genre is called **arbitrage trading simulation**. Core mechanics:
1. Multiple markets with different prices
2. Price fluctuation (random or event-driven)
3. Limited inventory/cargo space
4. Limited time (turns/days)
5. Random events (positive and negative)
6. Risk elements

### Lineage

| Game | Year | Twist |
|------|------|-------|
| Taipan | 1982 | The original - trade in 1800s Hong Kong |
| Drug Wars | 1984 | Simplified Taipan, urban setting, calculator classic |
| Space Trader | 2000 | Palm OS, added ship combat and RPG elements |

### Genre Variations

- **Add action/combat**: Space Trader, Elite, FTL
- **Add narrative**: Cart Life, Neo Cab
- **Add shop management**: Recettear, Moonlighter
- **Add strategy/competition**: Offworld Trading Company
- **Add idle/automation**: Many mobile games
- **Roguelike fusion**: Permadeath runs, unlockable strategies

---

## Reference Games (Steam)

### Closest to Drug Wars Formula

**Space Warlord Organ Trading Simulator** - Very Positive (92%)
- Buy/sell organs in a dystopian future
- Market fluctuates based on events
- Cargo hold management, competing traders
- Dark comedy tone
- **Best reference** - modernized Drug Wars with personality

**Offworld Trading Company**
- RTS on Mars, zero combat, pure economic warfare
- Player-driven market with real supply/demand
- Black market sabotage, hacking, hostile takeovers
- Win by buying out competitors via stock market

### Shop Simulators (Different Genre, But Informative)

**Supermarket Simulator** - Overwhelmingly Positive (94%), 51k peak concurrent
- First-person physical stocking, checkout, expansion
- Success from satisfying tactile loop + streamer-friendly chaos

**Tiny Bookshop** - Overwhelmingly Positive
- Different locations have different customer tastes
- Decorations give passive buffs (deckbuilder-like mechanics)
- Weather and events affect daily sales
- Cozy vibes + light strategy

### Key Takeaway

Shop sims succeed through **physical busywork that feels satisfying**.
Drug Wars succeeds through **tension and quick decision-making**.

We're going for the latter.

---

## Architecture Decision

### The Problem

We want an LLM to be able to:
1. Build the game
2. Modify the game
3. Test the game

3D or heavy UI makes testing difficult - LLMs can't verify visual/spatial correctness.

### The Solution: Headless Game Engine with JSON API

Game takes structured input, returns structured output:

```json
// Input
{ "action": "buy", "item": "H100", "quantity": 10, "market": "singapore" }

// Output
{
  "success": true,
  "balance": 42000,
  "inventory": { "H100": 10 },
  "events": ["Export regulations tightened - H100 prices rising in Asia"],
  "markets": { "singapore": { "H100": 3200 }, "us-west": { "H100": 2800 } }
}
```

### Why This Works

**For LLM development:**
- Can play the game by generating JSON moves
- Tests are input/output JSON pairs
- No visual verification needed
- Deterministic, reproducible

**For the game:**
- Engine is pure logic, zero UI coupling
- Add any frontend later (web, CLI, Discord bot)
- Multiple LLMs could compete (on-theme for "Compute Wars")
- Players could write their own bots

**For scope:**
- v1 is the engine + simple interface
- UI is a separate, optional layer

---

## Final Decision

**Drug Wars mechanics + JSON interface**

- Proven fun mechanics (tension of buy low/sell high)
- LLM-friendly input format (testable)
- Clear success criteria (make money, don't go broke)
- Theme aligns with mechanics (trading AI assets, automatable interface)

---

## Next Steps

1. Define game state schema
2. Define action types and validation
3. Define market/pricing mechanics
4. Define event system
5. Implement core engine
6. Add simple CLI or browser interface for human play
