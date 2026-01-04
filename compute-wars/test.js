// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE WARS - Test Suite
// ═══════════════════════════════════════════════════════════════════════════

import { createGame, submitAction, calculateNetWorth, calculateInventoryUsed, calculateAverageCost, getEffectiveBuyPrice, getEffectiveSellPrice, createSaveData, validateSaveData, SAVE_VERSION } from './engine.js';
import { GOODS, MARKETS } from './data.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

// Deterministic random for testing (seeded PRNG)
function createSeededRandom(seed) {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function withDeterministicRandom(seed, fn) {
  const originalRandom = Math.random;
  Math.random = createSeededRandom(seed);
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`${colors.green}✓${colors.reset} ${colors.dim}${name}${colors.reset}`);
    passed++;
  } catch (e) {
    console.log(`${colors.red}✗${colors.reset} ${colors.bright}${name}${colors.reset}`);
    failed++;
    failures.push({ name, error: e });
  }
}

function section(title) {
  console.log(`\n${colors.cyan}${colors.bright}═══ ${title} ═══${colors.reset}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    const err = new Error(message || 'Values not equal');
    err.expected = expected;
    err.actual = actual;
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Initialization Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Game Initialization');

test('createGame returns valid initial state', () => {
  const state = createGame();
  assert(state.player.balance === 10000, 'Starting balance should be 10000');
  assert(state.player.location === 'us-west', 'Starting location should be us-west');
  assert(state.player.inventoryCapacity === 10, 'Starting capacity should be 10');
  assert(state.turn === 1, 'Starting turn should be 1');
  assert(Object.keys(state.player.inventory).length === 0, 'Starting inventory should be empty');
});

test('all markets have prices for all goods', () => {
  const state = createGame();
  for (const marketId of Object.keys(MARKETS)) {
    const market = state.markets[marketId];
    for (const goodId of Object.keys(GOODS)) {
      assert(market.prices[goodId] > 0, `${marketId} should have price for ${goodId}`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Buy/Sell Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Buy/Sell Actions');

test('can buy goods with sufficient funds', () => {
  let state = createGame();
  // Buy 1 compute (cheapest good)
  const result = submitAction(state, { action: 'buy', good: 'compute', quantity: 1 });
  assert(result.success, 'Buy should succeed');
  assert(result.state.player.inventory.compute === 1, 'Should have 1 compute');
  assert(result.state.player.balance < 10000, 'Balance should decrease');
});

test('cannot buy more than can afford', () => {
  let state = createGame();
  // Try to buy 100 H100s (way too expensive)
  const result = submitAction(state, { action: 'buy', good: 'h100', quantity: 100 });
  assert(!result.success, 'Buy should fail');
  assert(result.error.includes('Insufficient funds'), 'Error should mention funds');
});

test('cannot buy more than inventory capacity', () => {
  let state = createGame();
  // Give player lots of money
  state.player.balance = 10000000;
  // Try to buy 20 compute (capacity is 10)
  const result = submitAction(state, { action: 'buy', good: 'compute', quantity: 20 });
  assert(!result.success, 'Buy should fail');
  assert(result.error.includes('cargo space'), 'Error should mention cargo');
});

test('can sell goods in inventory', () => {
  let state = createGame();
  state.player.inventory.compute = 5;
  const balanceBefore = state.player.balance;
  const result = submitAction(state, { action: 'sell', good: 'compute', quantity: 3 });
  assert(result.success, 'Sell should succeed');
  assert(result.state.player.inventory.compute === 2, 'Should have 2 compute left');
  assert(result.state.player.balance > balanceBefore, 'Balance should increase');
});

test('cannot sell more than owned', () => {
  let state = createGame();
  state.player.inventory.compute = 2;
  const result = submitAction(state, { action: 'sell', good: 'compute', quantity: 5 });
  assert(!result.success, 'Sell should fail');
  assert(result.error.includes('Insufficient inventory'), 'Error should mention inventory');
});

test('buy and sell do NOT advance turn', () => {
  let state = createGame();
  state.player.balance = 100000;

  const result1 = submitAction(state, { action: 'buy', good: 'compute', quantity: 1 });
  assert(result1.success, 'Buy should succeed');
  assertEqual(result1.state.turn, 1, 'Turn should still be 1 after buy');

  const result2 = submitAction(result1.state, { action: 'sell', good: 'compute', quantity: 1 });
  assert(result2.success, 'Sell should succeed');
  assertEqual(result2.state.turn, 1, 'Turn should still be 1 after sell');
});

// ─────────────────────────────────────────────────────────────────────────────
// Cost Basis Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Cost Basis');

test('buying tracks cost basis', () => {
  let state = createGame();
  const market = state.markets[state.player.location];
  const price = market.prices.compute;

  const result = submitAction(state, { action: 'buy', good: 'compute', quantity: 2 });
  assert(result.success, 'Buy should succeed');
  assertEqual(result.state.player.costBasis.compute, price * 2, 'Cost basis should equal total spent');
});

test('calculateAverageCost returns correct average', () => {
  let state = createGame();
  state.player.inventory.compute = 4;
  state.player.costBasis = { compute: 4000 };

  const avg = calculateAverageCost('compute', state.player);
  assertEqual(avg, 1000, 'Average cost should be 1000');
});

test('multiple buys accumulate cost basis', () => {
  let state = createGame();
  state.player.balance = 100000;
  const market = state.markets[state.player.location];
  const price = market.prices.compute;

  // Buy 2
  let result = submitAction(state, { action: 'buy', good: 'compute', quantity: 2 });
  state = result.state;

  // Buy 3 more
  result = submitAction(state, { action: 'buy', good: 'compute', quantity: 3 });
  state = result.state;

  assertEqual(state.player.inventory.compute, 5, 'Should have 5 compute');
  assertEqual(state.player.costBasis.compute, price * 5, 'Cost basis should equal total spent');
});

test('selling reduces cost basis proportionally', () => {
  let state = createGame();
  state.player.inventory.compute = 4;
  state.player.costBasis = { compute: 4000 }; // $1000 avg

  const result = submitAction(state, { action: 'sell', good: 'compute', quantity: 2 });
  assert(result.success, 'Sell should succeed');
  assertEqual(result.state.player.inventory.compute, 2, 'Should have 2 left');
  assertEqual(result.state.player.costBasis.compute, 2000, 'Cost basis should be halved');
});

test('selling all clears cost basis', () => {
  let state = createGame();
  state.player.inventory.compute = 3;
  state.player.costBasis = { compute: 3000 };

  const result = submitAction(state, { action: 'sell', good: 'compute', quantity: 3 });
  assert(result.success, 'Sell should succeed');
  assert(result.state.player.inventory.compute === undefined, 'Inventory should be cleared');
  assert(result.state.player.costBasis.compute === undefined, 'Cost basis should be cleared');
});

test('average cost after partial sell remains same', () => {
  let state = createGame();
  state.player.inventory.compute = 4;
  state.player.costBasis = { compute: 4000 }; // $1000 avg

  const result = submitAction(state, { action: 'sell', good: 'compute', quantity: 2 });
  const avgAfter = calculateAverageCost('compute', result.state.player);
  assertEqual(avgAfter, 1000, 'Average cost should remain 1000 after partial sell');
});

// ─────────────────────────────────────────────────────────────────────────────
// Effective Price Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Effective Prices');

test('getEffectiveBuyPrice returns base price without discount', () => {
  let state = createGame();
  const result = getEffectiveBuyPrice(state, 'compute');
  const basePrice = state.markets[state.player.location].prices.compute;
  assertEqual(result.price, basePrice, 'Price should equal base price');
  assertEqual(result.discount, 0, 'Discount should be 0');
});

test('getEffectiveBuyPrice applies discount from pending event', () => {
  let state = createGame();
  const basePrice = state.markets[state.player.location].prices.compute;
  // Simulate a discount event
  state.pendingEvents = [{ effect: 'discount_buy', good: 'compute', percent: 40 }];

  const result = getEffectiveBuyPrice(state, 'compute');
  assertEqual(result.discount, 40, 'Discount should be 40%');
  assertEqual(result.price, Math.round(basePrice * 0.6), 'Price should be 60% of base');
  assertEqual(result.basePrice, basePrice, 'Base price should be preserved');
});

test('getEffectiveSellPrice applies premium from pending event', () => {
  let state = createGame();
  const basePrice = state.markets[state.player.location].prices.compute;
  // Simulate a premium event
  state.pendingEvents = [{ effect: 'premium_sell', good: 'compute', percent: 30 }];

  const result = getEffectiveSellPrice(state, 'compute');
  assertEqual(result.premium, 30, 'Premium should be 30%');
  assertEqual(result.price, Math.round(basePrice * 1.3), 'Price should be 130% of base');
});

// ─────────────────────────────────────────────────────────────────────────────
// Travel Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Travel Actions');

test('can travel to different market', () => {
  let state = createGame();
  assertEqual(state.player.location, 'us-west', 'Should start in us-west');

  const result = submitAction(state, { action: 'travel', destination: 'singapore' });
  assert(result.success, 'Travel should succeed');
  assertEqual(result.state.player.location, 'singapore', 'Should be in singapore');
});

test('travel advances turn', () => {
  let state = createGame();
  const result = submitAction(state, { action: 'travel', destination: 'singapore' });
  assert(result.success, 'Travel should succeed');
  assertEqual(result.state.turn, 2, 'Turn should advance to 2');
  assert(result.turnAdvanced, 'turnAdvanced flag should be true');
});

test('cannot travel to current location', () => {
  let state = createGame();
  const result = submitAction(state, { action: 'travel', destination: 'us-west' });
  assert(!result.success, 'Travel should fail');
  assert(result.error.includes('Already at'), 'Error should mention already there');
});

test('travel updates markets visited stat', () => {
  let state = createGame();
  assertEqual(state.stats.marketsVisited.length, 1, 'Should have visited 1 market');

  const result = submitAction(state, { action: 'travel', destination: 'singapore' });
  assertEqual(result.state.stats.marketsVisited.length, 2, 'Should have visited 2 markets');
  assert(result.state.stats.marketsVisited.includes('singapore'), 'Singapore should be in visited');
});

// ─────────────────────────────────────────────────────────────────────────────
// Wait Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Wait Action');

test('wait advances turn', () => {
  let state = createGame();
  const result = submitAction(state, { action: 'wait' });
  assert(result.success, 'Wait should succeed');
  assertEqual(result.state.turn, 2, 'Turn should advance to 2');
  assert(result.turnAdvanced, 'turnAdvanced flag should be true');
});

test('wait causes price changes', () => {
  let state = createGame();
  const result = submitAction(state, { action: 'wait' });
  assert(result.success, 'Wait should succeed');
  assert(Object.keys(result.priceChanges).length > 0, 'Should have price changes');
});

test('handles old saves without priceHistory', () => {
  let state = createGame();
  // Simulate an old save by removing priceHistory from all markets
  for (const marketId of Object.keys(state.markets)) {
    delete state.markets[marketId].priceHistory;
  }
  // This should not crash
  const result = submitAction(state, { action: 'wait' });
  assert(result.success, 'Wait should succeed even without priceHistory');
  // priceHistory should now be initialized
  const market = result.state.markets[result.state.player.location];
  assert(market.priceHistory, 'priceHistory should be initialized');
});

// ─────────────────────────────────────────────────────────────────────────────
// Debt Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Debt System');

test('can borrow money', () => {
  let state = createGame();
  const balanceBefore = state.player.balance;
  const result = submitAction(state, { action: 'borrow', amount: 5000 });
  assert(result.success, 'Borrow should succeed');
  assertEqual(result.state.player.balance, balanceBefore + 5000, 'Balance should increase');
  assertEqual(result.state.player.debt, 5000, 'Debt should be 5000');
});

test('borrow does NOT advance turn', () => {
  let state = createGame();
  const result = submitAction(state, { action: 'borrow', amount: 5000 });
  assert(result.success, 'Borrow should succeed');
  assertEqual(result.state.turn, 1, 'Turn should still be 1');
});

test('debt accrues interest on turn advance', () => {
  let state = createGame();
  // Borrow money
  let result = submitAction(state, { action: 'borrow', amount: 10000 });
  assertEqual(result.state.player.debt, 10000, 'Debt should be 10000');

  // Wait to advance turn
  result = submitAction(result.state, { action: 'wait' });
  assert(result.state.player.debt > 10000, 'Debt should increase from interest');
});

test('can pay debt', () => {
  let state = createGame();
  state.player.debt = 5000;
  const result = submitAction(state, { action: 'payDebt', amount: 3000 });
  assert(result.success, 'PayDebt should succeed');
  assertEqual(result.state.player.debt, 2000, 'Debt should be 2000');
  assertEqual(result.state.player.balance, 7000, 'Balance should be 7000');
});

test('cannot pay more than balance', () => {
  let state = createGame();
  state.player.debt = 20000;
  const result = submitAction(state, { action: 'payDebt', amount: 15000 });
  assert(!result.success, 'PayDebt should fail');
  assert(result.error.includes('Insufficient funds'), 'Error should mention funds');
});

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Upgrades');

test('can purchase upgrade with funds', () => {
  let state = createGame();
  state.player.balance = 100000;
  const result = submitAction(state, { action: 'upgrade', upgradeId: 'cargo_1' });
  assert(result.success, 'Upgrade should succeed');
  assert(result.state.purchasedUpgrades.includes('cargo_1'), 'Should own cargo_1');
  assertEqual(result.state.player.inventoryCapacity, 15, 'Capacity should be 15');
});

test('upgrade does NOT advance turn', () => {
  let state = createGame();
  state.player.balance = 100000;
  const result = submitAction(state, { action: 'upgrade', upgradeId: 'cargo_1' });
  assert(result.success, 'Upgrade should succeed');
  assertEqual(result.state.turn, 1, 'Turn should still be 1');
});

test('cannot buy same upgrade twice', () => {
  let state = createGame();
  state.player.balance = 200000;
  state.purchasedUpgrades = ['cargo_1'];
  const result = submitAction(state, { action: 'upgrade', upgradeId: 'cargo_1' });
  assert(!result.success, 'Upgrade should fail');
  assert(result.error.includes('Already purchased'), 'Error should mention already purchased');
});

test('cannot buy upgrade without prerequisite', () => {
  let state = createGame();
  state.player.balance = 200000;
  const result = submitAction(state, { action: 'upgrade', upgradeId: 'cargo_2' });
  assert(!result.success, 'Upgrade should fail');
  assert(result.error.includes('Requires'), 'Error should mention prerequisite');
});

// ─────────────────────────────────────────────────────────────────────────────
// Milestone Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Milestones');

test('first trade milestone triggers on buy', () => {
  let state = createGame();
  state.player.balance = 100000;
  assert(!state.milestones.first_trade.achieved, 'First trade not achieved yet');

  const result = submitAction(state, { action: 'buy', good: 'compute', quantity: 1 });
  assert(result.success, 'Buy should succeed');
  assert(result.state.milestones.first_trade.achieved, 'First trade should be achieved');
  assert(result.milestonesAchieved.some(m => m.id === 'first_trade'), 'Milestone should be in response');
});

test('wealth milestone triggers when net worth reached', () => {
  let state = createGame();
  state.player.balance = 150000; // Over 100k threshold

  // Do any action to trigger milestone check
  const result = submitAction(state, { action: 'wait' });
  assert(result.state.milestones.seed_round.achieved, 'Seed round should be achieved');
});

// ─────────────────────────────────────────────────────────────────────────────
// Game Over Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Game Over');

test('bankruptcy when debt exceeds 3x net worth', () => {
  let state = createGame();
  state.player.balance = 1000;
  state.player.debt = 50000; // Way more than 3x net worth

  const result = submitAction(state, { action: 'wait' });
  assert(result.state.gameOver, 'Game should be over');
  assertEqual(result.state.gameOverReason, 'bankruptcy', 'Reason should be bankruptcy');
});

test('inventory value prevents bankruptcy', () => {
  // Use deterministic random to avoid price fluctuations affecting the test
  withDeterministicRandom(123, () => {
    let state = createGame();
    const market = state.markets[state.player.location];

    // Give player valuable inventory
    state.player.balance = 10000;
    state.player.inventory = { h100: 5 }; // 5 H100s
    state.player.costBasis = { h100: 150000 };

    // Calculate what inventory is worth
    const inventoryValue = market.prices.h100 * 5;
    const totalAssets = state.player.balance + inventoryValue;

    // Set debt to 50% of total assets (well below bankruptcy threshold)
    // Bankruptcy triggers when debt > 3 * netWorth
    // netWorth = totalAssets - debt
    // So debt > 3 * (totalAssets - debt) => debt > 0.75 * totalAssets
    state.player.debt = Math.floor(totalAssets * 0.5); // 50% of assets, safely below 75%

    const expectedNetWorth = totalAssets - state.player.debt;

    const result = submitAction(state, { action: 'wait' });

    assert(!result.state.gameOver, `Should NOT be bankrupt. Debt: ${state.player.debt}, Expected net worth: ${expectedNetWorth}`);
  });
});

test('bankruptcy triggers when debt exceeds threshold even with inventory', () => {
  withDeterministicRandom(456, () => {
    let state = createGame();
    const market = state.markets[state.player.location];

    // Set up: some balance and inventory
    state.player.balance = 10000;
    state.player.inventory = { h100: 2 };
    state.player.costBasis = { h100: 60000 };
    const inventoryValue = market.prices.h100 * 2;
    const totalAssets = state.player.balance + inventoryValue;

    // Set debt to 80% of total assets (above 75% threshold)
    state.player.debt = Math.floor(totalAssets * 0.8);

    const result = submitAction(state, { action: 'wait' });

    assert(result.state.gameOver, `Should be bankrupt. Debt: ${state.player.debt}, Total assets: ${totalAssets}`);
    assertEqual(result.state.gameOverReason, 'bankruptcy', 'Reason should be bankruptcy');
  });
});

test('cannot act after game over', () => {
  let state = createGame();
  state.gameOver = true;
  state.gameOverReason = 'bankruptcy';

  const result = submitAction(state, { action: 'wait' });
  assert(!result.success, 'Action should fail');
  assert(result.error.includes('Game is over'), 'Error should mention game over');
});

// ─────────────────────────────────────────────────────────────────────────────
// Save Data Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Save Data');

test('createSaveData creates valid save structure', () => {
  const state = createGame();
  const eventLog = [{ type: 'test', message: 'Test event' }];
  const saveData = createSaveData(state, eventLog);

  assertEqual(saveData.version, SAVE_VERSION, 'Should have correct version');
  assert(saveData.state === state, 'Should include state');
  assert(saveData.eventLog === eventLog, 'Should include eventLog');
  assert(typeof saveData.savedAt === 'string', 'Should have savedAt timestamp');
  assert(saveData.savedAt.includes('T'), 'savedAt should be ISO format');
});

test('createSaveData works with empty eventLog', () => {
  const state = createGame();
  const saveData = createSaveData(state);

  assert(Array.isArray(saveData.eventLog), 'eventLog should default to array');
  assertEqual(saveData.eventLog.length, 0, 'eventLog should be empty');
});

test('validateSaveData accepts valid save', () => {
  const state = createGame();
  const saveData = createSaveData(state);
  const result = validateSaveData(saveData);

  assert(result.valid, 'Should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateSaveData rejects null', () => {
  const result = validateSaveData(null);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.includes('Save data must be an object'), 'Should have correct error');
});

test('validateSaveData rejects missing version', () => {
  const state = createGame();
  const saveData = { state };
  const result = validateSaveData(saveData);

  assert(!result.valid, 'Should be invalid');
  assert(result.errors.includes('Missing version field'), 'Should report missing version');
});

test('validateSaveData rejects missing state', () => {
  const saveData = { version: '1.0' };
  const result = validateSaveData(saveData);

  assert(!result.valid, 'Should be invalid');
  assert(result.errors.includes('Missing state field'), 'Should report missing state');
});

test('validateSaveData rejects invalid player data', () => {
  const saveData = {
    version: '1.0',
    state: {
      player: { balance: 'not a number' },
      markets: {},
      turn: 1
    }
  };
  const result = validateSaveData(saveData);

  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('balance')), 'Should report balance error');
});

test('validateSaveData rejects missing markets', () => {
  const saveData = {
    version: '1.0',
    state: {
      player: { balance: 1000, location: 'us-west', inventory: {} },
      turn: 1
    }
  };
  const result = validateSaveData(saveData);

  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('markets')), 'Should report markets error');
});

test('round-trip save/validate works', () => {
  // Simulate a game with some actions
  let state = createGame();
  state = submitAction(state, { action: 'buy', good: 'compute', quantity: 3 }).state;
  state = submitAction(state, { action: 'borrow', amount: 5000 }).state;

  const saveData = createSaveData(state, [{ test: 'event' }]);
  const jsonString = JSON.stringify(saveData);
  const parsed = JSON.parse(jsonString);
  const result = validateSaveData(parsed);

  assert(result.valid, 'Round-tripped save should be valid');
  assertEqual(parsed.state.player.inventory.compute, 3, 'State should preserve inventory');
  assertEqual(parsed.state.player.debt, 5000, 'State should preserve debt');
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Test: Full Game Flow
// ─────────────────────────────────────────────────────────────────────────────

section('Integration: Full Game Flow');

test('can play through multiple turns', () => {
  // Use deterministic random to avoid random customs seizures
  withDeterministicRandom(42, () => {
    let state = createGame();

    // Buy some compute
    let result = submitAction(state, { action: 'buy', good: 'compute', quantity: 5 });
    assert(result.success, 'Buy compute should succeed');
    state = result.state;
    assertEqual(state.turn, 1, 'Turn should still be 1');

    // Travel to Singapore (higher prices)
    result = submitAction(state, { action: 'travel', destination: 'singapore' });
    assert(result.success, 'Travel should succeed');
    state = result.state;
    assertEqual(state.turn, 2, 'Turn should be 2');
    assertEqual(state.player.location, 'singapore', 'Should be in singapore');

    // Sell whatever compute we still have (might have lost some to customs)
    const computeOwned = state.player.inventory.compute || 0;
    if (computeOwned > 0) {
      result = submitAction(state, { action: 'sell', good: 'compute', quantity: computeOwned });
      assert(result.success, 'Sell should succeed');
      state = result.state;
      assertEqual(state.turn, 2, 'Turn should still be 2');
    }

    // Travel back
    result = submitAction(state, { action: 'travel', destination: 'us-west' });
    assert(result.success, 'Travel back should succeed');
    state = result.state;
    assertEqual(state.turn, 3, 'Turn should be 3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

// Print failure details with diff format
if (failures.length > 0) {
  console.log(`\n${colors.red}${colors.bright}════════════════════════════════════════`);
  console.log(`  FAILURES (${failures.length})`);
  console.log(`════════════════════════════════════════${colors.reset}\n`);

  for (const { name, error } of failures) {
    console.log(`${colors.red}${colors.bright}✗ ${name}${colors.reset}`);
    console.log(`${colors.dim}  ${error.message}${colors.reset}`);

    if (error.expected !== undefined && error.actual !== undefined) {
      console.log(`${colors.red}  - Expected: ${colors.bright}${JSON.stringify(error.expected)}${colors.reset}`);
      console.log(`${colors.green}  + Actual:   ${colors.bright}${JSON.stringify(error.actual)}${colors.reset}`);
    }
    console.log();
  }
}

// Print summary
console.log('\n═══════════════════════════════════════');
if (failed === 0) {
  console.log(`${colors.bgGreen}${colors.bright} PASS ${colors.reset} ${colors.green}${passed} tests passed${colors.reset}`);
} else {
  console.log(`${colors.bgRed}${colors.bright} FAIL ${colors.reset} ${colors.green}${passed} passed${colors.reset} ${colors.red}${failed} failed${colors.reset}`);
}
console.log('═══════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
