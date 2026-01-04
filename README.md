```
  ___ ___  __  __ ___ _   _ _____ ___   __      ___   ___  ___
 / __/ _ \|  \/  | _ | | | |_   _| __| \ \    / /_\ | _ \/ __|
| (_| (_) | |\/| |  _| |_| | | | | _|   \ \/\/ / _ \|   /\__ \
 \___\___/|_|  |_|_|  \___/  |_| |___|   \_/\_/_/ \_|_|_\|___/
```

A Drug Wars-style trading game with an AI/compute industry theme.

Trade GPUs, compute hours, datasets, and AI talent across global markets. Buy low, sell high, avoid customs, and survive the volatile world of AI infrastructure.

## Quick Start

```bash
# Install dependencies
npm install

# Start the game
npm start
# Open http://localhost:8080

# Run tests
npm test
```

## Gameplay

- **Buy low, sell high** - Each market has different prices based on supply and demand
- **Travel between markets** - US West, US East, EU, Singapore (travel advances the turn)
- **Manage risk** - Customs can seize cargo, hackers can steal funds
- **Take on debt** - Borrow money at interest to make bigger trades
- **Upgrade** - Increase cargo capacity, get insurance, improve security
- **Hit milestones** - Track your progress from first trade to tech mogul

### Goods

| Good | Price Range | Risk |
|------|-------------|------|
| H100 GPU | $25k-$40k | Medium |
| H200 GPU | $30k-$50k | Medium |
| B100 GPU | $40k-$80k | High |
| Compute Hours | $500-$2k | Low |
| Datasets | $2k-$8k | Medium |
| AI Talent | $10k-$25k | High |

## Architecture

Built for LLM development experimentation - the game engine is completely separate from the UI.

```
compute-wars/
├── engine.js     # Pure game logic - JSON in, JSON out
├── data.js       # Constants (goods, markets, events, upgrades)
├── ui.js         # Browser UI (terminal aesthetic)
├── index.html    # Styles and markup
└── test.js       # Automated test suite (28 tests)
```

### JSON API

The engine can be used programmatically without a browser:

```javascript
import { createGame, submitAction } from './engine.js';

// Create a new game
const state = createGame();

// Submit actions
const result = submitAction(state, { action: 'buy', good: 'h100', quantity: 2 });
console.log(result.success);  // true
console.log(result.state);    // updated game state

// Other actions
submitAction(state, { action: 'sell', good: 'h100', quantity: 1 });
submitAction(state, { action: 'travel', destination: 'singapore' });
submitAction(state, { action: 'wait' });
submitAction(state, { action: 'borrow', amount: 5000 });
submitAction(state, { action: 'payDebt', amount: 3000 });
submitAction(state, { action: 'upgrade', upgradeId: 'cargo_1' });
```

## Testing

```bash
npm test
```

28 automated tests covering:
- Game initialization
- Buy/sell mechanics
- Travel and turn advancement
- Debt system
- Upgrades and prerequisites
- Milestones
- Game over conditions

## Documentation

- `COMPUTE_WARS_SPEC.md` - Full game specification
- `COMPUTE_WARS_RESEARCH.md` - Design research and decisions
- `CLAUDE.md` - Context for AI assistants

## License

MIT
