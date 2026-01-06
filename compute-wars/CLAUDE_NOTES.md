# Claude Session Notes

## Session: Risk System Implementation (2026-01-06)

### Just completed:
- Interactive travel choice events (shady deals, gambling, intel tips, smuggler offers)
- Restricted goods system (China East restricts h100/h200/b100 with seizure risk + price premium)
- Travel confirmation modal when carrying at-risk inventory
- Choice modal now shows results before closing (win/loss/neutral with dramatic styling)
- 56 tests passing

### Key files:
- `engine.js` - `pendingChoice` state, `resolveChoice` action, `getAtRiskGoods()`, `checkSeizureRisk()`
- `data.js` - `TRAVEL_CHOICES`, `ORACLE`, `MARKETS.restrictedGoods`
- `ui.js` - `renderChoiceModal()`, `showChoiceResult()`, `renderTravelConfirmModal()`

### Not yet activated:
- **Oracle character** - Data is in place (`ORACLE` in data.js, `rollForOracle()` in engine.js) but not wired into the UI yet. The Oracle gives price predictions with accuracy affected by reputation.

### Potential next features discussed but not implemented:
- Terminal/CLI version of the game (discussed SSH approach with blessed.js or ink)
- More markets with different restriction profiles
- Could add more choice event types

### Testing note:
Travel tests use `withDeterministicRandom(999, ...)` to avoid random choice events interfering with assertions.
