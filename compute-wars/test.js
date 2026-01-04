// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE WARS - Test Suite
// Run with: node --experimental-vm-modules test.js
// ═══════════════════════════════════════════════════════════════════════════

import { createGame, submitAction, calculateNetWorth, calculateInventoryUsed } from './engine.js';
import { GOODS, MARKETS } from './data.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values not equal'}: expected ${expected}, got ${actual}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Initialization Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ Game Initialization ═══');

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

console.log('\n═══ Buy/Sell Actions ═══');

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
// Travel Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ Travel Actions ═══');

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

console.log('\n═══ Wait Action ═══');

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

// ─────────────────────────────────────────────────────────────────────────────
// Debt Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ Debt System ═══');

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

console.log('\n═══ Upgrades ═══');

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

console.log('\n═══ Milestones ═══');

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

console.log('\n═══ Game Over ═══');

test('bankruptcy when debt exceeds 3x net worth', () => {
  let state = createGame();
  state.player.balance = 1000;
  state.player.debt = 50000; // Way more than 3x net worth

  const result = submitAction(state, { action: 'wait' });
  assert(result.state.gameOver, 'Game should be over');
  assertEqual(result.state.gameOverReason, 'bankruptcy', 'Reason should be bankruptcy');
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
// Integration Test: Full Game Flow
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ Integration: Full Game Flow ═══');

test('can play through multiple turns', () => {
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

  // Sell compute
  result = submitAction(state, { action: 'sell', good: 'compute', quantity: 5 });
  assert(result.success, 'Sell should succeed');
  state = result.state;
  assertEqual(state.turn, 2, 'Turn should still be 2');

  // Travel back
  result = submitAction(state, { action: 'travel', destination: 'us-west' });
  assert(result.success, 'Travel back should succeed');
  state = result.state;
  assertEqual(state.turn, 3, 'Turn should be 3');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════');
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
