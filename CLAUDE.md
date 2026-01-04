# AI Wars

A Drug Wars-style trading game with an AI industry theme, built for LLM development experimentation.

## Quick Context

- **Game**: Buy/sell AI commodities (GPUs, compute, datasets, talent) across global markets
- **Architecture**: Headless JSON engine + browser UI
- **Goal**: A game format that LLMs can easily build, modify, and test

## Key Files

```
ai-wars/
├── index.html    # Browser UI (terminal aesthetic)
├── engine.js     # Pure game logic - JSON input/output
├── ui.js         # DOM rendering
└── data.js       # Constants (goods, markets, events, upgrades, milestones)
```

## Documentation

- `AI_WARS_SPEC.md` - Full game specification (mechanics, schema, events, UI)
- `AI_WARS_RESEARCH.md` - Design research and decisions

## Running

```bash
cd ai-wars && python3 -m http.server 8080
# Open http://localhost:8080
```

## JSON API

The engine can be used programmatically:

```javascript
import { createGame, submitAction } from './engine.js';

const state = createGame();
const result = submitAction(state, { action: 'buy', good: 'h100', quantity: 2 });
```

## Current Status

- Core game loop working
- Known issue: turns advance on every action (should only advance on travel, per classic Drug Wars)
