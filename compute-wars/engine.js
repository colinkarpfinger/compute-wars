// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE WARS - Game Engine
// Pure game logic, no DOM dependencies
// ═══════════════════════════════════════════════════════════════════════════

import { GOODS, MARKETS, SUPPLY_LEVELS, UPGRADES, MILESTONES, EVENTS, TRAVEL_CHOICES, ORACLE, CONFIG } from './data.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function formatMoney(amount) {
  return '$' + Math.round(amount).toLocaleString();
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─────────────────────────────────────────────────────────────────────────────
// State Initialization
// ─────────────────────────────────────────────────────────────────────────────

export function createInitialState() {
  const markets = {};

  for (const marketId of Object.keys(MARKETS)) {
    const market = MARKETS[marketId];
    const prices = {};
    const supply = {};
    const priceHistory = {};

    for (const goodId of Object.keys(GOODS)) {
      const good = GOODS[goodId];
      const modifier = market.priceModifiers[goodId] || 1.0;
      const basePrice = (good.baseMin + good.baseMax) / 2;
      const initialPrice = Math.round(basePrice * modifier);
      prices[goodId] = initialPrice;
      supply[goodId] = 'normal';
      // Initialize price history with starting price
      priceHistory[goodId] = [initialPrice];
    }

    markets[marketId] = {
      id: marketId,
      name: market.name,
      subtitle: market.subtitle,
      prices,
      supply,
      priceHistory,
      restricted: []
    };
  }

  const milestones = {};
  for (const [id, milestone] of Object.entries(MILESTONES)) {
    milestones[id] = {
      ...milestone,
      achieved: false,
      achievedOnTurn: null
    };
  }

  return {
    player: {
      balance: CONFIG.startingBalance,
      debt: 0,
      debtInterestRate: CONFIG.debtBaseInterestRate,
      location: CONFIG.startingLocation,
      inventory: {},
      costBasis: {},  // Total cost paid per good (for avg cost calculation)
      inventoryCapacity: CONFIG.startingInventoryCapacity,
      reputation: CONFIG.startingReputation
    },
    markets,
    turn: 1,
    milestones,
    unlockedUpgrades: [],
    purchasedUpgrades: [],
    pendingEvents: [],

    // Stats tracking for milestones
    stats: {
      totalTrades: 0,
      goodsTraded: 0,
      marketsVisited: [CONFIG.startingLocation],
      hadDebt: false,
      peakNetWorth: CONFIG.startingBalance
    },

    // Choice event system - when set, player must resolve before continuing
    pendingChoice: null,  // { type, data, choices, onResolve }

    // Oracle predictions
    oraclePrediction: null,  // Current active prediction

    gameOver: false,
    gameOverReason: null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculations
// ─────────────────────────────────────────────────────────────────────────────

export function calculateInventoryUsed(inventory) {
  return Object.values(inventory).reduce((sum, qty) => sum + qty, 0);
}

export function calculateAverageCost(good, player) {
  const quantity = player.inventory[good] || 0;
  const costBasis = player.costBasis[good] || 0;
  if (quantity === 0) return 0;
  return Math.round(costBasis / quantity);
}

export function calculateInventoryValue(inventory, prices) {
  let total = 0;
  for (const [goodId, quantity] of Object.entries(inventory)) {
    total += (prices[goodId] || 0) * quantity;
  }
  return total;
}

export function calculateNetWorth(state) {
  const inventoryValue = calculateInventoryValue(
    state.player.inventory,
    state.markets[state.player.location].prices
  );
  return state.player.balance + inventoryValue - state.player.debt;
}

export function getDebtInterestRate(state) {
  const netWorth = calculateNetWorth(state);
  if (netWorth <= 0) return CONFIG.debtHighInterestRate;

  const debtRatio = state.player.debt / netWorth;
  if (debtRatio >= CONFIG.debtHighThreshold) return CONFIG.debtHighInterestRate;
  if (debtRatio >= CONFIG.debtMediumThreshold) return CONFIG.debtMediumInterestRate;
  return CONFIG.debtBaseInterestRate;
}

// Get effective buy price considering any active discount events
export function getEffectiveBuyPrice(state, goodId) {
  const market = state.markets[state.player.location];
  const basePrice = market.prices[goodId];

  const discountEvent = state.pendingEvents?.find(
    e => e.effect === 'discount_buy' && e.good === goodId
  );

  if (discountEvent) {
    return {
      price: Math.round(basePrice * (1 - discountEvent.percent / 100)),
      basePrice,
      discount: discountEvent.percent
    };
  }

  return { price: basePrice, basePrice, discount: 0 };
}

// Get effective sell price considering any active premium events
export function getEffectiveSellPrice(state, goodId) {
  const market = state.markets[state.player.location];
  const basePrice = market.prices[goodId];

  const premiumEvent = state.pendingEvents?.find(
    e => e.effect === 'premium_sell' && e.good === goodId
  );

  if (premiumEvent) {
    return {
      price: Math.round(basePrice * (1 + premiumEvent.percent / 100)),
      basePrice,
      premium: premiumEvent.percent
    };
  }

  return { price: basePrice, basePrice, premium: 0 };
}

export function getMaxBorrowable(state) {
  const netWorth = Math.max(0, calculateNetWorth(state));
  const maxDebt = netWorth * CONFIG.maxDebtMultiplier;
  return Math.max(0, maxDebt - state.player.debt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Price Updates
// ─────────────────────────────────────────────────────────────────────────────

function updatePrices(state) {
  const priceChanges = {};

  for (const marketId of Object.keys(state.markets)) {
    priceChanges[marketId] = {};
    const market = state.markets[marketId];
    const marketData = MARKETS[marketId];

    for (const goodId of Object.keys(GOODS)) {
      const good = GOODS[goodId];
      const supply = SUPPLY_LEVELS[market.supply[goodId]];
      const oldPrice = market.prices[goodId];

      // Base volatility from supply level
      const volatility = supply.volatility;
      const change = (Math.random() - 0.5) * 2 * volatility;

      // Apply supply multiplier
      const supplyMult = supply.priceMultiplier;

      // Calculate new price with market modifier
      const modifier = marketData.priceModifiers[goodId] || 1.0;
      let newPrice = oldPrice * (1 + change);

      // Trend toward supply-adjusted base price
      const basePrice = ((good.baseMin + good.baseMax) / 2) * modifier * supplyMult;
      newPrice = newPrice * 0.9 + basePrice * 0.1;

      // Clamp to bounds
      newPrice = clamp(
        Math.round(newPrice),
        Math.round(good.baseMin * modifier * 0.7),
        Math.round(good.baseMax * modifier * 1.3)
      );

      market.prices[goodId] = newPrice;
      priceChanges[marketId][goodId] = { old: oldPrice, new: newPrice };

      // Record price history (keep last 8 prices)
      // Initialize priceHistory for saves from before this feature existed
      if (!market.priceHistory) {
        market.priceHistory = {};
      }
      if (!market.priceHistory[goodId]) {
        market.priceHistory[goodId] = [];
      }
      market.priceHistory[goodId].push(newPrice);
      if (market.priceHistory[goodId].length > 8) {
        market.priceHistory[goodId].shift();
      }
    }

    // Random supply level shifts
    for (const goodId of Object.keys(GOODS)) {
      if (Math.random() < CONFIG.supplyShiftChance) {
        const currentSupply = market.supply[goodId];
        const levels = ['surplus', 'normal', 'shortage'];
        const currentIndex = levels.indexOf(currentSupply);

        // Shift up or down
        const direction = Math.random() < 0.5 ? -1 : 1;
        const newIndex = clamp(currentIndex + direction, 0, 2);
        market.supply[goodId] = levels[newIndex];
      }
    }
  }

  return priceChanges;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event System
// ─────────────────────────────────────────────────────────────────────────────

function rollForEvents(state, isTraveling = false, destination = null) {
  const events = [];
  const reputationMod = (state.player.reputation - 50) * CONFIG.reputationEventModifier;

  // Market shift events
  for (const [eventId, eventData] of Object.entries(EVENTS)) {
    if (eventData.type === 'market_shift') {
      const prob = eventData.probability - reputationMod * 0.5;
      if (Math.random() < prob) {
        const template = randomChoice(eventData.templates);
        const good = randomChoice(Object.keys(GOODS));
        const percent = Math.floor(Math.random() * 20) + 10;

        events.push({
          id: eventId + '_' + Date.now(),
          type: eventData.type,
          title: eventData.title,
          description: template.text
            .replace('{good}', GOODS[good].name)
            .replace('{percent}', percent),
          effect: template.effect,
          good,
          percent
        });
      }
    }

    // Regulation events
    if (eventData.type === 'regulation') {
      const prob = eventData.probability;
      if (Math.random() < prob) {
        const template = randomChoice(eventData.templates);
        const good = randomChoice(Object.keys(GOODS));
        const market = template.market || randomChoice(Object.keys(MARKETS));

        events.push({
          id: eventId + '_' + Date.now(),
          type: eventData.type,
          title: eventData.title,
          description: template.text
            .replace('{good}', GOODS[good].name),
          effect: template.effect || 'restrict',
          good,
          market
        });
      }
    }

    // Customs events (only when traveling)
    if (eventData.type === 'customs' && isTraveling && destination) {
      const marketRisk = MARKETS[destination].customsRisk;
      const hasInsurance = state.purchasedUpgrades.includes('insurance');
      let prob = marketRisk - reputationMod;

      if (hasInsurance && Math.random() < 0.5) {
        prob = 0; // Insurance saved you
      }

      if (Math.random() < prob && calculateInventoryUsed(state.player.inventory) > 0) {
        const template = randomChoice(eventData.templates);
        const inventoryGoods = Object.entries(state.player.inventory).filter(([, qty]) => qty > 0);

        if (inventoryGoods.length > 0) {
          const [good, qty] = randomChoice(inventoryGoods);
          const seizeQty = Math.max(1, Math.floor(qty * (Math.random() * 0.3 + 0.1)));

          events.push({
            id: eventId + '_' + Date.now(),
            type: eventData.type,
            title: eventData.title,
            description: template.text
              .replace('{good}', GOODS[good].name)
              .replace('{quantity}', seizeQty),
            effect: 'seize',
            good,
            quantity: seizeQty
          });
        }
      }
    }

    // Hack events
    if (eventData.type === 'hack') {
      const hasSecurity = state.purchasedUpgrades.includes('security');
      let prob = eventData.probability + reputationMod * 0.5;

      if (hasSecurity && Math.random() < 0.5) {
        prob = 0;
      }

      if (Math.random() < prob) {
        const template = randomChoice(eventData.templates);
        const amount = Math.floor(state.player.balance * (Math.random() * 0.15 + 0.05));

        events.push({
          id: eventId + '_' + Date.now(),
          type: eventData.type,
          title: eventData.title,
          description: template.text.replace('{amount}', formatMoney(amount)),
          effect: 'money_loss',
          amount
        });
      }
    }

    // Audit events
    if (eventData.type === 'audit') {
      const netWorth = calculateNetWorth(state);
      const wealthMod = Math.min(0.05, netWorth / 10000000); // Higher wealth = more audits
      const prob = eventData.probability + wealthMod + reputationMod * 0.5;

      if (Math.random() < prob) {
        const template = randomChoice(eventData.templates);
        const amount = Math.floor(netWorth * (Math.random() * 0.05 + 0.02));

        events.push({
          id: eventId + '_' + Date.now(),
          type: eventData.type,
          title: eventData.title,
          description: template.text.replace('{amount}', formatMoney(amount)),
          effect: 'fine',
          amount
        });
      }
    }

    // Opportunity events
    if (eventData.type === 'opportunity') {
      const prob = eventData.probability + reputationMod;
      if (Math.random() < prob) {
        const template = randomChoice(eventData.templates);
        const good = randomChoice(Object.keys(GOODS));
        const percent = Math.floor(Math.random() * 30) + 20;

        events.push({
          id: eventId + '_' + Date.now(),
          type: eventData.type,
          title: eventData.title,
          description: template.text
            .replace('{good}', GOODS[good].name)
            .replace('{percent}', percent),
          effect: template.effect,
          good,
          percent
        });
      }
    }

    // Windfall events
    if (eventData.type === 'windfall') {
      const prob = eventData.probability + reputationMod;
      if (Math.random() < prob) {
        const template = randomChoice(eventData.templates);
        const amount = Math.floor(Math.random() * 30000) + 10000;

        events.push({
          id: eventId + '_' + Date.now(),
          type: eventData.type,
          title: eventData.title,
          description: template.text.replace('{amount}', formatMoney(amount)),
          effect: 'money_gain',
          amount
        });
      }
    }
  }

  return events;
}

function applyEvents(state, events) {
  for (const event of events) {
    switch (event.effect) {
      case 'drop':
        // Drop price of specific good globally
        for (const market of Object.values(state.markets)) {
          market.prices[event.good] = Math.round(
            market.prices[event.good] * (1 - event.percent / 100)
          );
        }
        break;

      case 'rise':
        // Raise price of specific good globally
        for (const market of Object.values(state.markets)) {
          market.prices[event.good] = Math.round(
            market.prices[event.good] * (1 + event.percent / 100)
          );
        }
        break;

      case 'rise_all':
        // Raise all GPU prices
        for (const market of Object.values(state.markets)) {
          for (const goodId of ['h100', 'h200', 'b100']) {
            market.prices[goodId] = Math.round(
              market.prices[goodId] * (1 + event.percent / 100)
            );
          }
        }
        break;

      case 'compute_rise':
      case 'compute_spike':
        for (const market of Object.values(state.markets)) {
          market.prices.compute = Math.round(market.prices.compute * 1.3);
        }
        break;

      case 'compute_drop':
        for (const market of Object.values(state.markets)) {
          market.prices.compute = Math.round(market.prices.compute * 0.75);
        }
        break;

      case 'talent_rise':
        for (const market of Object.values(state.markets)) {
          market.prices.talent = Math.round(market.prices.talent * 1.25);
        }
        break;

      case 'datasets_drop':
        for (const market of Object.values(state.markets)) {
          market.prices.datasets = Math.round(market.prices.datasets * 0.7);
        }
        break;

      case 'restrict':
        if (event.market && event.good) {
          const market = state.markets[event.market];
          if (!market.restricted.includes(event.good)) {
            market.restricted.push(event.good);
          }
        }
        break;

      case 'unrestrict':
        // Remove a random restriction
        for (const market of Object.values(state.markets)) {
          if (market.restricted.length > 0) {
            market.restricted.pop();
            break;
          }
        }
        break;

      case 'seize':
        if (event.good && event.quantity) {
          const currentQty = state.player.inventory[event.good] || 0;
          if (currentQty > 0) {
            const seizeQty = Math.min(event.quantity, currentQty);
            // Reduce cost basis proportionally
            const currentCostBasis = state.player.costBasis[event.good] || 0;
            const costBasisReduction = (seizeQty / currentQty) * currentCostBasis;
            state.player.costBasis[event.good] = currentCostBasis - costBasisReduction;

            state.player.inventory[event.good] = currentQty - seizeQty;
            if (state.player.inventory[event.good] === 0) {
              delete state.player.inventory[event.good];
              delete state.player.costBasis[event.good];
            }
          }
        }
        break;

      case 'money_loss':
      case 'fine':
        state.player.balance = Math.max(0, state.player.balance - event.amount);
        break;

      case 'money_gain':
        state.player.balance += event.amount;
        break;

      // Opportunity effects are handled at sell time (stored in pendingEvents)
      case 'premium_sell':
      case 'discount_buy':
        state.pendingEvents.push(event);
        break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone Checking
// ─────────────────────────────────────────────────────────────────────────────

function checkMilestones(state) {
  const achieved = [];
  const netWorth = calculateNetWorth(state);

  // Update peak net worth
  if (netWorth > state.stats.peakNetWorth) {
    state.stats.peakNetWorth = netWorth;
  }

  for (const [id, milestone] of Object.entries(state.milestones)) {
    if (milestone.achieved) continue;

    let conditionMet = false;
    const condition = milestone.condition;

    switch (condition.type) {
      case 'net_worth':
        conditionMet = netWorth >= condition.value;
        break;
      case 'trades':
        conditionMet = state.stats.totalTrades >= condition.value;
        break;
      case 'markets_visited':
        conditionMet = state.stats.marketsVisited.length >= condition.value;
        break;
      case 'goods_traded':
        conditionMet = state.stats.goodsTraded >= condition.value;
        break;
      case 'turns':
        conditionMet = state.turn >= condition.value;
        break;
      case 'paid_off_debt':
        conditionMet = state.stats.hadDebt && state.player.debt === 0;
        break;
    }

    if (conditionMet) {
      milestone.achieved = true;
      milestone.achievedOnTurn = state.turn;
      achieved.push(milestone);

      // Apply rewards
      if (milestone.reward.type === 'unlock_upgrade') {
        if (!state.unlockedUpgrades.includes(milestone.reward.value)) {
          state.unlockedUpgrades.push(milestone.reward.value);
        }
      } else if (milestone.reward.type === 'reputation') {
        state.player.reputation += milestone.reward.value;
      }
    }
  }

  return achieved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Over Checking
// ─────────────────────────────────────────────────────────────────────────────

function checkGameOver(state) {
  const netWorth = calculateNetWorth(state);

  // Bankruptcy: debt exceeds 3x net worth (or net worth is negative with debt)
  if (state.player.debt > 0) {
    if (netWorth <= 0 || state.player.debt > netWorth * CONFIG.bankruptcyMultiplier) {
      state.gameOver = true;
      state.gameOverReason = 'bankruptcy';
      return true;
    }
  }

  // Destitution: no money, no inventory, can't borrow
  if (state.player.balance <= 0 &&
      calculateInventoryUsed(state.player.inventory) === 0 &&
      getMaxBorrowable(state) <= 0) {
    state.gameOver = true;
    state.gameOverReason = 'destitution';
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Travel Choice Events
// ─────────────────────────────────────────────────────────────────────────────

function rollForTravelChoice(state, destination) {
  const reputationMod = (state.player.reputation - 50) * CONFIG.reputationEventModifier;

  for (const [eventId, eventData] of Object.entries(TRAVEL_CHOICES)) {
    // Check if event requires restricted goods
    if (eventData.requiresRestrictedGoods) {
      const destMarket = MARKETS[destination];
      const hasRestricted = Object.keys(state.player.inventory).some(
        goodId => state.player.inventory[goodId] > 0 && destMarket.restrictedGoods[goodId]
      );
      if (!hasRestricted) continue;
    }

    // Roll for event with reputation modifier
    const prob = eventData.probability + reputationMod * 0.3;
    if (Math.random() < prob) {
      return generateChoiceEvent(eventData, state, destination);
    }
  }

  return null;
}

function generateChoiceEvent(eventData, state, destination) {
  const template = randomChoice(eventData.templates);
  const goodId = randomChoice(Object.keys(GOODS));
  const good = GOODS[goodId];

  // Generate event-specific parameters
  const params = {
    good: good.name,
    goodId,
    quantity: Math.floor(Math.random() * 5) + 1,
    discount: Math.floor(Math.random() * 30) + 20, // 20-50%
    risk: Math.floor(Math.random() * 25) + 15,     // 15-40%
    amount: Math.floor(state.player.balance * (0.1 + Math.random() * 0.3)), // 10-40% of balance
    entryFee: Math.floor(Math.random() * 15000) + 5000,
    cost: Math.floor(Math.random() * 10000) + 5000,
    company: eventData.companies ? randomChoice(eventData.companies) : 'NVIDIA',
    accuracy: Math.floor(50 + state.player.reputation * 0.3), // 50-80% based on rep
    success: Math.floor(60 + state.player.reputation * 0.2)   // 60-80% based on rep
  };

  // Build display text
  let text = template.text;
  let riskText = template.riskText;
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(`{${key}}`, value).replace(`$\{${key}}`, formatMoney(value));
    if (riskText) {
      riskText = riskText.replace(`{${key}}`, value);
    }
  }

  return {
    id: eventData.id,
    type: eventData.type,
    title: eventData.title,
    text,
    riskText,
    choices: template.choices,
    params,
    destination
  };
}

function resolveChoiceEvent(state, choiceId) {
  const choice = state.pendingChoice;
  if (!choice) return { success: false, message: 'No pending choice' };

  const result = { success: true, message: '', gainedGoods: null, lostMoney: 0, gainedMoney: 0 };

  switch (choice.type) {
    case 'shady_deal':
      if (choiceId === 'accept') {
        const roll = Math.random() * 100;
        if (roll > choice.params.risk) {
          // Success - get the goods at discount
          const price = Math.round(
            state.markets[state.player.location].prices[choice.params.goodId] *
            (1 - choice.params.discount / 100)
          ) * choice.params.quantity;

          if (state.player.balance >= price) {
            state.player.balance -= price;
            state.player.inventory[choice.params.goodId] =
              (state.player.inventory[choice.params.goodId] || 0) + choice.params.quantity;
            state.player.costBasis[choice.params.goodId] =
              (state.player.costBasis[choice.params.goodId] || 0) + price;
            result.message = `Deal successful! Got ${choice.params.quantity}x ${choice.params.good} at ${choice.params.discount}% off.`;
            result.gainedGoods = { good: choice.params.goodId, quantity: choice.params.quantity };
            result.lostMoney = price;
          } else {
            result.message = `You can't afford the deal.`;
          }
        } else {
          // Failed - counterfeit goods, lose money
          const lostAmount = Math.round(
            state.markets[state.player.location].prices[choice.params.goodId] *
            (1 - choice.params.discount / 100)
          ) * choice.params.quantity;
          if (state.player.balance >= lostAmount) {
            state.player.balance -= lostAmount;
            result.message = `Counterfeit! The goods were worthless. Lost ${formatMoney(lostAmount)}.`;
            result.lostMoney = lostAmount;
          } else {
            result.message = `Lucky break - you couldn't afford it anyway.`;
          }
        }
      } else {
        result.message = 'You walked away from the deal.';
      }
      break;

    case 'gambling':
      if (choiceId === 'gamble') {
        const amount = Math.min(choice.params.amount, state.player.balance);
        if (Math.random() < 0.5) {
          state.player.balance += amount;
          result.message = `You won! Doubled your money: +${formatMoney(amount)}`;
          result.gainedMoney = amount;
        } else {
          state.player.balance -= amount;
          result.message = `You lost! -${formatMoney(amount)}`;
          result.lostMoney = amount;
        }
      } else if (choiceId === 'enter') {
        const fee = Math.min(choice.params.entryFee, state.player.balance);
        state.player.balance -= fee;
        // Random prize - could be great or terrible
        const multiplier = Math.random() < 0.3 ? (2 + Math.random() * 3) : (Math.random() * 0.5);
        const prize = Math.round(fee * multiplier);
        state.player.balance += prize;
        if (prize > fee) {
          result.message = `Auction win! Prize: ${formatMoney(prize)} (profit: +${formatMoney(prize - fee)})`;
          result.gainedMoney = prize - fee;
        } else {
          result.message = `Bad luck at the auction. Only got ${formatMoney(prize)} back.`;
          result.lostMoney = fee - prize;
        }
      } else {
        result.message = 'You passed on the gamble.';
      }
      break;

    case 'intel':
      if (choiceId === 'buy') {
        const cost = Math.min(choice.params.cost, state.player.balance);
        state.player.balance -= cost;
        result.lostMoney = cost;

        // Generate intel (may be true or false)
        const isAccurate = Math.random() * 100 < choice.params.accuracy;
        const priceDirection = Math.random() < 0.5 ? 'rise' : 'fall';

        if (isAccurate) {
          // Schedule a real price event for next turn
          const eventGood = choice.params.goodId;
          state.pendingEvents.push({
            type: 'intel_tip',
            good: eventGood,
            direction: priceDirection,
            turnsRemaining: Math.floor(Math.random() * 2) + 1
          });
          result.message = `Intel acquired: "${choice.params.good} prices will ${priceDirection} soon."`;
        } else {
          // Bad intel - just a vague message
          result.message = `Intel acquired: "${choice.params.good} prices will ${priceDirection} soon." (Reliability unclear)`;
        }
      } else {
        result.message = 'You passed on the intel.';
      }
      break;

    case 'smuggler':
      if (choiceId === 'use_smuggler') {
        const cost = Math.min(choice.params.cost, state.player.balance);
        state.player.balance -= cost;
        result.lostMoney = cost;

        if (Math.random() * 100 < choice.params.success) {
          result.message = `Smuggler succeeded! Your cargo made it through safely.`;
          // Mark this travel as "smuggled" - skip seizure check
          state._smuggledThisTrip = true;
        } else {
          // Total seizure of restricted goods
          const destMarket = MARKETS[choice.destination];
          let seized = [];
          for (const [goodId, qty] of Object.entries(state.player.inventory)) {
            if (qty > 0 && destMarket.restrictedGoods[goodId]) {
              seized.push(`${qty}x ${GOODS[goodId].name}`);
              delete state.player.inventory[goodId];
              delete state.player.costBasis[goodId];
            }
          }
          result.message = `Smuggler caught! Lost all restricted cargo: ${seized.join(', ')}`;
        }
      } else {
        result.message = 'You declined the smuggler. Taking the normal route.';
      }
      break;
  }

  state.pendingChoice = null;
  return result;
}

// Check for seizure when traveling to restricted market
function checkSeizureRisk(state, destination) {
  if (state._smuggledThisTrip) {
    delete state._smuggledThisTrip;
    return [];
  }

  const destMarket = MARKETS[destination];
  const seized = [];
  const reputationMod = (state.player.reputation - 50) * 0.002; // 0.2% per rep point

  for (const [goodId, restriction] of Object.entries(destMarket.restrictedGoods || {})) {
    const qty = state.player.inventory[goodId] || 0;
    if (qty <= 0) continue;

    const seizureChance = Math.max(0.05, restriction.seizureRisk - reputationMod);

    // Check if cargo insurance helps
    const hasInsurance = state.purchasedUpgrades.includes('insurance');
    const insuranceSaves = hasInsurance && Math.random() < 0.5;

    if (Math.random() < seizureChance && !insuranceSaves) {
      // Seize a portion (30-70% of that good)
      const seizePercent = 0.3 + Math.random() * 0.4;
      const seizeQty = Math.max(1, Math.floor(qty * seizePercent));

      state.player.inventory[goodId] -= seizeQty;
      if (state.player.inventory[goodId] <= 0) {
        delete state.player.inventory[goodId];
      }

      // Reduce cost basis proportionally
      if (state.player.costBasis[goodId]) {
        state.player.costBasis[goodId] = Math.round(
          state.player.costBasis[goodId] * (1 - seizeQty / qty)
        );
      }

      seized.push({
        good: goodId,
        goodName: GOODS[goodId].name,
        quantity: seizeQty,
        insuranceSaved: false
      });
    } else if (insuranceSaves && Math.random() < seizureChance) {
      seized.push({
        good: goodId,
        goodName: GOODS[goodId].name,
        quantity: 0,
        insuranceSaved: true
      });
    }
  }

  return seized;
}

// Get at-risk goods for travel confirmation
export function getAtRiskGoods(state, destination) {
  const destMarket = MARKETS[destination];
  const atRisk = [];

  for (const [goodId, restriction] of Object.entries(destMarket.restrictedGoods || {})) {
    const qty = state.player.inventory[goodId] || 0;
    if (qty > 0) {
      atRisk.push({
        goodId,
        goodName: GOODS[goodId].name,
        quantity: qty,
        seizureRisk: Math.round(restriction.seizureRisk * 100),
        pricePremium: Math.round((restriction.pricePremium - 1) * 100)
      });
    }
  }

  return atRisk;
}

// ─────────────────────────────────────────────────────────────────────────────
// Oracle System
// ─────────────────────────────────────────────────────────────────────────────

function rollForOracle(state) {
  if (Math.random() < ORACLE.probability) {
    const prediction = randomChoice(ORACLE.predictions);
    const goodId = randomChoice(Object.keys(GOODS));
    const marketId = randomChoice(Object.keys(MARKETS));

    let text = prediction.text
      .replace('{good}', GOODS[goodId].name)
      .replace('{market}', MARKETS[marketId].name);

    // Adjust accuracy based on reputation
    const adjustedAccuracy = prediction.accuracy + (state.player.reputation - 50) * 0.003;

    return {
      text,
      type: prediction.type,
      good: goodId,
      market: marketId,
      accuracy: adjustedAccuracy,
      cost: ORACLE.baseCost,
      isFree: Math.random() < 0.3  // 30% chance of free hint
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Processing
// ─────────────────────────────────────────────────────────────────────────────

export function processAction(state, action) {
  // Clone state to avoid mutation
  state = deepClone(state);

  const response = {
    success: false,
    error: null,
    state,
    events: [],
    priceChanges: {},
    milestonesAchieved: [],
    netWorth: 0,
    turnSummary: '',
    // New choice system
    choiceEvent: null,
    choiceResult: null,
    seizures: [],
    oracleMessage: null
  };

  // Check if game is over
  if (state.gameOver) {
    response.error = 'Game is over. Start a new game.';
    response.netWorth = calculateNetWorth(state);
    return response;
  }

  // If there's a pending choice, only allow resolveChoice action
  if (state.pendingChoice && action.action !== 'resolveChoice') {
    response.error = 'You must resolve the current choice first.';
    response.choiceEvent = state.pendingChoice;
    return response;
  }

  const market = state.markets[state.player.location];

  // Process the action
  switch (action.action) {
    case 'buy': {
      const { good, quantity } = action;

      // Validation
      if (!GOODS[good]) {
        response.error = `Invalid good: ${good}`;
        return response;
      }
      if (quantity <= 0) {
        response.error = 'Quantity must be greater than 0';
        return response;
      }
      if (market.restricted.includes(good)) {
        response.error = `${GOODS[good].name} is restricted in this market`;
        return response;
      }

      const price = market.prices[good];

      // Check for discount opportunity
      let finalPrice = price;
      const discountEvent = state.pendingEvents.find(
        e => e.effect === 'discount_buy' && e.good === good
      );
      if (discountEvent) {
        finalPrice = Math.round(price * (1 - discountEvent.percent / 100));
        state.pendingEvents = state.pendingEvents.filter(e => e !== discountEvent);
        response.turnSummary += `Used discount: -${discountEvent.percent}%! `;
      }

      const totalCost = finalPrice * quantity;

      if (totalCost > state.player.balance) {
        response.error = `Insufficient funds. Need ${formatMoney(totalCost)}, have ${formatMoney(state.player.balance)}`;
        return response;
      }

      const inventoryUsed = calculateInventoryUsed(state.player.inventory);
      if (inventoryUsed + quantity > state.player.inventoryCapacity) {
        response.error = `Insufficient cargo space. Need ${quantity} slots, have ${state.player.inventoryCapacity - inventoryUsed}`;
        return response;
      }

      // Execute buy
      state.player.balance -= totalCost;
      state.player.inventory[good] = (state.player.inventory[good] || 0) + quantity;
      state.player.costBasis[good] = (state.player.costBasis[good] || 0) + totalCost;
      state.stats.totalTrades++;
      state.stats.goodsTraded += quantity;

      response.turnSummary += `Bought ${quantity}x ${GOODS[good].name} for ${formatMoney(totalCost)}. `;
      response.success = true;
      break;
    }

    case 'sell': {
      const { good, quantity } = action;

      if (!GOODS[good]) {
        response.error = `Invalid good: ${good}`;
        return response;
      }
      if (quantity <= 0) {
        response.error = 'Quantity must be greater than 0';
        return response;
      }
      if (market.restricted.includes(good)) {
        response.error = `${GOODS[good].name} is restricted in this market`;
        return response;
      }

      const owned = state.player.inventory[good] || 0;
      if (quantity > owned) {
        response.error = `Insufficient inventory. Have ${owned}, trying to sell ${quantity}`;
        return response;
      }

      let price = market.prices[good];

      // Check for premium opportunity
      const premiumEvent = state.pendingEvents.find(
        e => e.effect === 'premium_sell' && e.good === good
      );
      if (premiumEvent) {
        price = Math.round(price * (1 + premiumEvent.percent / 100));
        state.pendingEvents = state.pendingEvents.filter(e => e !== premiumEvent);
        response.turnSummary += `Used premium: +${premiumEvent.percent}%! `;
      }

      const totalRevenue = price * quantity;

      // Execute sell
      state.player.balance += totalRevenue;

      // Reduce cost basis proportionally
      const currentCostBasis = state.player.costBasis[good] || 0;
      const costBasisReduction = (quantity / owned) * currentCostBasis;
      state.player.costBasis[good] = currentCostBasis - costBasisReduction;

      state.player.inventory[good] -= quantity;
      if (state.player.inventory[good] === 0) {
        delete state.player.inventory[good];
        delete state.player.costBasis[good];
      }
      state.stats.totalTrades++;
      state.stats.goodsTraded += quantity;

      response.turnSummary += `Sold ${quantity}x ${GOODS[good].name} for ${formatMoney(totalRevenue)}. `;
      response.success = true;
      break;
    }

    case 'travel': {
      const { destination, confirmed } = action;

      if (!MARKETS[destination]) {
        response.error = `Invalid destination: ${destination}`;
        return response;
      }
      if (destination === state.player.location) {
        response.error = 'Already at this location';
        return response;
      }

      // Check for at-risk goods if not confirmed
      const atRiskGoods = getAtRiskGoods(state, destination);
      if (atRiskGoods.length > 0 && !confirmed) {
        response.error = 'CONFIRM_RISK';
        response.atRiskGoods = atRiskGoods;
        response.destination = destination;
        return response;
      }

      // Roll for choice events during travel
      const choiceEvent = rollForTravelChoice(state, destination);
      if (choiceEvent) {
        state.pendingChoice = choiceEvent;
        state._pendingDestination = destination;  // Store destination for after choice
        response.choiceEvent = choiceEvent;
        response.success = true;
        response.turnSummary = 'An encounter during your journey...';
        response.state = state;
        response.netWorth = calculateNetWorth(state);
        return response;
      }

      // Check for seizure of restricted goods
      const seizures = checkSeizureRisk(state, destination);
      if (seizures.length > 0) {
        response.seizures = seizures;
        for (const s of seizures) {
          if (s.insuranceSaved) {
            response.turnSummary += `Insurance saved your ${s.goodName}! `;
          } else {
            response.turnSummary += `Customs seized ${s.quantity}x ${s.goodName}! `;
          }
        }
      }

      // Roll for customs events during travel (before arriving)
      const travelEvents = rollForEvents(state, true, destination);
      response.events.push(...travelEvents);
      applyEvents(state, travelEvents);

      // Complete the travel immediately
      state.player.location = destination;
      if (!state.stats.marketsVisited.includes(destination)) {
        state.stats.marketsVisited.push(destination);
      }

      response.turnSummary += `Traveled to ${MARKETS[destination].name}. `;
      response.success = true;
      break;
    }

    case 'resolveChoice': {
      const { choiceId } = action;

      if (!state.pendingChoice) {
        response.error = 'No pending choice to resolve';
        return response;
      }

      const result = resolveChoiceEvent(state, choiceId);
      response.choiceResult = result;
      response.turnSummary = result.message + ' ';

      // If we have a pending destination, complete the travel
      if (state._pendingDestination) {
        const destination = state._pendingDestination;
        delete state._pendingDestination;

        // Check for seizure (unless smuggler succeeded)
        const seizures = checkSeizureRisk(state, destination);
        if (seizures.length > 0) {
          response.seizures = seizures;
          for (const s of seizures) {
            if (s.insuranceSaved) {
              response.turnSummary += `Insurance saved your ${s.goodName}! `;
            } else {
              response.turnSummary += `Customs seized ${s.quantity}x ${s.goodName}! `;
            }
          }
        }

        // Roll for other travel events
        const travelEvents = rollForEvents(state, true, destination);
        response.events.push(...travelEvents);
        applyEvents(state, travelEvents);

        // Complete the travel
        state.player.location = destination;
        if (!state.stats.marketsVisited.includes(destination)) {
          state.stats.marketsVisited.push(destination);
        }
        response.turnSummary += `Arrived at ${MARKETS[destination].name}. `;
        response._completedTravel = true;  // Flag for turn advancement
      }

      response.success = true;
      break;
    }

    case 'wait': {
      response.turnSummary += 'Waited. ';
      response.success = true;
      break;
    }

    case 'borrow': {
      const { amount } = action;

      if (amount <= 0) {
        response.error = 'Amount must be greater than 0';
        return response;
      }

      const maxBorrowable = getMaxBorrowable(state);
      if (amount > maxBorrowable) {
        response.error = `Can only borrow up to ${formatMoney(maxBorrowable)}`;
        return response;
      }

      state.player.balance += amount;
      state.player.debt += amount;
      state.stats.hadDebt = true;

      response.turnSummary += `Borrowed ${formatMoney(amount)}. `;
      response.success = true;
      break;
    }

    case 'payDebt': {
      const { amount } = action;

      if (amount <= 0) {
        response.error = 'Amount must be greater than 0';
        return response;
      }
      if (amount > state.player.balance) {
        response.error = `Insufficient funds. Have ${formatMoney(state.player.balance)}`;
        return response;
      }
      if (amount > state.player.debt) {
        response.error = `Debt is only ${formatMoney(state.player.debt)}`;
        return response;
      }

      state.player.balance -= amount;
      state.player.debt -= amount;

      response.turnSummary += `Paid ${formatMoney(amount)} toward debt. `;
      response.success = true;
      break;
    }

    case 'upgrade': {
      const { upgradeId } = action;

      const upgrade = UPGRADES[upgradeId];
      if (!upgrade) {
        response.error = `Invalid upgrade: ${upgradeId}`;
        return response;
      }
      if (state.purchasedUpgrades.includes(upgradeId)) {
        response.error = 'Already purchased this upgrade';
        return response;
      }
      if (upgrade.prerequisite && !state.purchasedUpgrades.includes(upgrade.prerequisite)) {
        response.error = `Requires ${UPGRADES[upgrade.prerequisite].name} first`;
        return response;
      }
      if (upgrade.unlockedByMilestone && !state.milestones[upgrade.unlockedByMilestone]?.achieved) {
        response.error = `Locked. Requires milestone: ${MILESTONES[upgrade.unlockedByMilestone].name}`;
        return response;
      }
      if (upgrade.cost > state.player.balance) {
        response.error = `Insufficient funds. Need ${formatMoney(upgrade.cost)}`;
        return response;
      }

      // Execute upgrade
      state.player.balance -= upgrade.cost;
      state.purchasedUpgrades.push(upgradeId);

      // Apply effect
      if (upgrade.effect.type === 'inventory') {
        state.player.inventoryCapacity += upgrade.effect.value;
      } else if (upgrade.effect.type === 'reputation') {
        state.player.reputation += upgrade.effect.value;
      }

      response.turnSummary += `Purchased ${upgrade.name}. `;
      response.success = true;
      break;
    }

    default:
      response.error = `Unknown action: ${action.action}`;
      return response;
  }

  // Determine if this action should advance the turn
  // Only travel and wait advance the turn (classic Drug Wars style)
  // resolveChoice also advances turn if it completed a travel
  const turnAdvancingActions = ['travel', 'wait'];
  let shouldAdvanceTurn = response.success && turnAdvancingActions.includes(action.action);

  // resolveChoice advances turn if it completed a travel
  if (action.action === 'resolveChoice' && response._completedTravel) {
    shouldAdvanceTurn = true;
    delete response._completedTravel;
  }

  if (response.success) {
    // Always check milestones (even on non-turn-advancing actions)
    response.milestonesAchieved = checkMilestones(state);

    if (shouldAdvanceTurn) {
      // Apply debt interest
      if (state.player.debt > 0) {
        const interestRate = getDebtInterestRate(state);
        const interest = Math.round(state.player.debt * interestRate);
        state.player.debt += interest;
        state.player.debtInterestRate = interestRate;
        if (interest > 0) {
          response.turnSummary += `Debt interest: +${formatMoney(interest)}. `;
        }
      }

      // Roll for random events
      const events = rollForEvents(state);
      response.events.push(...events);
      applyEvents(state, events);

      // Update prices
      response.priceChanges = updatePrices(state);

      // Roll for Oracle appearance
      const oracle = rollForOracle(state);
      if (oracle) {
        response.oracleMessage = oracle;
        state.oraclePrediction = oracle;
      }

      // Check game over
      checkGameOver(state);

      // Advance turn
      state.turn++;

      // Clear expired opportunity events
      state.pendingEvents = state.pendingEvents.filter(e => {
        // Opportunities last 3 turns
        return state.turn - (e.turn || state.turn) < 3;
      });
    }
  }

  response.netWorth = calculateNetWorth(state);
  response.turnAdvanced = shouldAdvanceTurn;

  if (shouldAdvanceTurn) {
    response.turnSummary += `Net worth: ${formatMoney(response.netWorth)}`;
  }

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export for JSON API usage
// ─────────────────────────────────────────────────────────────────────────────

export function createGame() {
  return createInitialState();
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Data Functions
// ─────────────────────────────────────────────────────────────────────────────

export const SAVE_VERSION = '1.0';

export function createSaveData(state, eventLog = []) {
  return {
    version: SAVE_VERSION,
    state: state,
    eventLog: eventLog,
    savedAt: new Date().toISOString()
  };
}

export function validateSaveData(saveData) {
  const errors = [];

  if (!saveData || typeof saveData !== 'object') {
    return { valid: false, errors: ['Save data must be an object'] };
  }

  if (!saveData.version) {
    errors.push('Missing version field');
  }

  if (!saveData.state) {
    errors.push('Missing state field');
  } else {
    // Validate essential state properties
    if (!saveData.state.player) {
      errors.push('Missing player in state');
    } else {
      if (typeof saveData.state.player.balance !== 'number') {
        errors.push('Invalid or missing player.balance');
      }
      if (typeof saveData.state.player.location !== 'string') {
        errors.push('Invalid or missing player.location');
      }
      if (!saveData.state.player.inventory || typeof saveData.state.player.inventory !== 'object') {
        errors.push('Invalid or missing player.inventory');
      }
    }

    if (!saveData.state.markets || typeof saveData.state.markets !== 'object') {
      errors.push('Invalid or missing markets');
    }

    if (typeof saveData.state.turn !== 'number') {
      errors.push('Invalid or missing turn');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function submitAction(state, action) {
  return processAction(state, action);
}

// Helper to get available actions
export function getAvailableActions(state) {
  const actions = [];
  const market = state.markets[state.player.location];
  const inventoryUsed = calculateInventoryUsed(state.player.inventory);

  // Buy actions
  for (const goodId of Object.keys(GOODS)) {
    if (!market.restricted.includes(goodId)) {
      const maxAfford = Math.floor(state.player.balance / market.prices[goodId]);
      const maxCapacity = state.player.inventoryCapacity - inventoryUsed;
      const max = Math.min(maxAfford, maxCapacity);
      if (max > 0) {
        actions.push({ action: 'buy', good: goodId, maxQuantity: max });
      }
    }
  }

  // Sell actions
  for (const [goodId, quantity] of Object.entries(state.player.inventory)) {
    if (!market.restricted.includes(goodId) && quantity > 0) {
      actions.push({ action: 'sell', good: goodId, maxQuantity: quantity });
    }
  }

  // Travel actions
  if (!state.travelingTo) {
    for (const marketId of Object.keys(MARKETS)) {
      if (marketId !== state.player.location) {
        actions.push({ action: 'travel', destination: marketId });
      }
    }
  }

  // Wait
  actions.push({ action: 'wait' });

  // Borrow
  const maxBorrow = getMaxBorrowable(state);
  if (maxBorrow > 0) {
    actions.push({ action: 'borrow', maxAmount: maxBorrow });
  }

  // Pay debt
  if (state.player.debt > 0 && state.player.balance > 0) {
    actions.push({
      action: 'payDebt',
      maxAmount: Math.min(state.player.balance, state.player.debt)
    });
  }

  // Upgrades
  for (const [upgradeId, upgrade] of Object.entries(UPGRADES)) {
    if (!state.purchasedUpgrades.includes(upgradeId)) {
      const canAfford = state.player.balance >= upgrade.cost;
      const hasPrereq = !upgrade.prerequisite || state.purchasedUpgrades.includes(upgrade.prerequisite);
      const isUnlocked = !upgrade.unlockedByMilestone || state.milestones[upgrade.unlockedByMilestone]?.achieved;

      if (hasPrereq && isUnlocked) {
        actions.push({
          action: 'upgrade',
          upgradeId,
          cost: upgrade.cost,
          canAfford
        });
      }
    }
  }

  return actions;
}
