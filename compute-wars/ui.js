// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE WARS - User Interface
// DOM rendering and event handling
// ═══════════════════════════════════════════════════════════════════════════

import { GOODS, MARKETS, SUPPLY_LEVELS, UPGRADES, ASCII, TRAVEL_CHOICES } from './data.js';
import {
  createGame,
  submitAction,
  calculateNetWorth,
  calculateInventoryUsed,
  calculateAverageCost,
  getAvailableActions,
  getMaxBorrowable,
  getEffectiveBuyPrice,
  getEffectiveSellPrice,
  getAtRiskGoods,
  createSaveData,
  validateSaveData,
  SAVE_VERSION
} from './engine.js';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let gameState = null;
let eventLog = [];
let travelingTo = null;  // UI state for travel animation
const MAX_LOG_ENTRIES = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function formatMoney(amount) {
  if (amount >= 1000000000) {
    return '$' + (amount / 1000000000).toFixed(2) + 'B';
  }
  if (amount >= 1000000) {
    return '$' + (amount / 1000000).toFixed(2) + 'M';
  }
  if (amount >= 1000) {
    return '$' + (amount / 1000).toFixed(1) + 'K';
  }
  return '$' + Math.round(amount).toLocaleString();
}

function formatMoneyFull(amount) {
  return '$' + Math.round(amount).toLocaleString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderSparkline(prices, goodId, hasDiscount = false, hasPremium = false) {
  const width = 70; // Wider to fit indicator
  const height = 20;
  const padding = 2;

  if (!prices || prices.length < 2) {
    // Show flat line placeholder
    let indicator = '';
    if (hasDiscount) {
      indicator = `<polygon points="62,10 68,6 68,14" fill="#4f4"/>`;
    } else if (hasPremium) {
      indicator = `<polygon points="62,10 68,6 68,14" fill="#0ff"/>`;
    }
    return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <line x1="${padding}" y1="${height/2}" x2="${width-padding-10}" y2="${height/2}" stroke="#333" stroke-width="1" stroke-dasharray="2,2"/>
      ${indicator}
    </svg>`;
  }

  // Get the price range for this good to scale against
  const good = GOODS[goodId];
  const min = good.baseMin * 0.7;
  const max = good.baseMax * 1.3;

  const displayPrices = prices.slice(-8);

  // Build SVG path points (leave room for indicator)
  const chartWidth = width - 12;
  const points = displayPrices.map((price, i) => {
    const x = padding + (i / (displayPrices.length - 1)) * (chartWidth - padding * 2);
    const normalized = Math.max(0, Math.min(1, (price - min) / (max - min)));
    const y = height - padding - (normalized * (height - padding * 2));
    return `${x},${y}`;
  }).join(' ');

  // Color based on overall trend (first vs last)
  const first = displayPrices[0];
  const last = displayPrices[displayPrices.length - 1];
  let color = '#666'; // neutral
  if (last > first * 1.02) color = '#f44'; // up = bad for buyer (red)
  else if (last < first * 0.98) color = '#4f4'; // down = good for buyer (green)

  // Add arrow indicator for active discount/premium
  let indicator = '';
  if (hasDiscount) {
    // Green down arrow = good deal to buy
    indicator = `<polygon points="62,14 66,6 70,14" fill="#4f4"><title>Buy discount active!</title></polygon>`;
  } else if (hasPremium) {
    // Cyan up arrow = good deal to sell
    indicator = `<polygon points="62,6 66,14 70,6" fill="#0ff"><title>Sell premium active!</title></polygon>`;
  }

  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${indicator}
  </svg>`;
}

function getPriceClass(price, good) {
  const goodData = GOODS[good];
  const avg = (goodData.baseMin + goodData.baseMax) / 2;
  if (price < avg * 0.9) return 'price-low';
  if (price > avg * 1.1) return 'price-high';
  return 'price-normal';
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering Functions
// ─────────────────────────────────────────────────────────────────────────────

function renderHeader() {
  const netWorth = calculateNetWorth(gameState);
  const netWorthClass = netWorth >= 0 ? 'positive' : 'negative';

  return `
    <div class="header">
      <div class="header-title">
        <span class="title-text">COMPUTE WARS</span>
        <span class="subtitle">Trade · Profit · Survive</span>
      </div>
      <div class="header-stats">
        <div class="stat">
          <span class="stat-label">TURN</span>
          <span class="stat-value">${String(gameState.turn).padStart(3, '0')}</span>
        </div>
        <div class="stat">
          <span class="stat-label">LOCATION</span>
          <span class="stat-value location">${MARKETS[gameState.player.location].name}</span>
        </div>
        <div class="stat">
          <span class="stat-label">NET WORTH</span>
          <span class="stat-value ${netWorthClass}">${formatMoney(netWorth)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderPlayerPanel() {
  const inventoryUsed = calculateInventoryUsed(gameState.player.inventory);
  const debtClass = gameState.player.debt > 0 ? 'negative' : '';
  const market = gameState.markets[gameState.player.location];

  // Calculate bankruptcy risk
  const netWorth = calculateNetWorth(gameState);
  const inventoryValue = Object.entries(gameState.player.inventory).reduce((sum, [goodId, qty]) => {
    return sum + (market.prices[goodId] || 0) * qty;
  }, 0);
  const totalAssets = gameState.player.balance + inventoryValue;
  const debt = gameState.player.debt;

  // Bankruptcy triggers at debt > 75% of assets
  // Risk = how close we are to that threshold
  let riskPercent = 0;
  let riskLevel = 'safe';
  let riskClass = 'risk-safe';

  if (debt > 0 && totalAssets > 0) {
    const debtRatio = debt / totalAssets;
    riskPercent = Math.round((debtRatio / 0.75) * 100); // % of way to bankruptcy

    if (riskPercent >= 100) {
      riskLevel = 'BANKRUPT';
      riskClass = 'risk-critical';
    } else if (riskPercent >= 85) {
      riskLevel = 'CRITICAL';
      riskClass = 'risk-critical';
    } else if (riskPercent >= 65) {
      riskLevel = 'HIGH';
      riskClass = 'risk-high';
    } else if (riskPercent >= 40) {
      riskLevel = 'MODERATE';
      riskClass = 'risk-moderate';
    } else {
      riskLevel = 'LOW';
      riskClass = 'risk-safe';
    }
  }

  let inventoryHtml = '';
  if (Object.keys(gameState.player.inventory).length === 0) {
    inventoryHtml = '<div class="empty-inventory">[ Empty ]</div>';
  } else {
    for (const [goodId, quantity] of Object.entries(gameState.player.inventory)) {
      const good = GOODS[goodId];
      const avgCost = calculateAverageCost(goodId, gameState.player);
      const currentPrice = market.prices[goodId];
      const pnlPercent = avgCost > 0 ? ((currentPrice - avgCost) / avgCost * 100) : 0;
      const pnlClass = pnlPercent >= 0 ? 'positive' : 'negative';
      const pnlSign = pnlPercent >= 0 ? '+' : '';
      inventoryHtml += `
        <div class="inventory-item">
          <div class="item-main">
            <span class="item-icon">${good.icon}</span>
            <span class="item-name">${good.name}</span>
            <span class="item-quantity">x${quantity}</span>
          </div>
          <div class="item-cost">
            <span class="cost-label">Avg: $${avgCost.toLocaleString()}</span>
            <span class="pnl ${pnlClass}">${pnlSign}${pnlPercent.toFixed(0)}%</span>
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="panel player-panel">
      <div class="panel-header">┌─ PLAYER STATUS ─┐</div>
      <div class="panel-content">
        <div class="stat-row">
          <span class="label">Balance:</span>
          <span class="value positive">${formatMoneyFull(gameState.player.balance)}</span>
        </div>
        <div class="stat-row">
          <span class="label">Debt:</span>
          <span class="value ${debtClass}">${formatMoneyFull(gameState.player.debt)}</span>
          ${gameState.player.debt > 0 ? `<span class="interest">(${(gameState.player.debtInterestRate * 100).toFixed(0)}%/turn)</span>` : ''}
        </div>
        ${debt > 0 ? `
        <div class="stat-row bankruptcy-risk">
          <span class="label">Risk:</span>
          <span class="risk-indicator ${riskClass}">${riskLevel}</span>
          <span class="risk-bar">
            <span class="risk-fill ${riskClass}" style="width: ${Math.min(100, riskPercent)}%"></span>
          </span>
        </div>
        ` : ''}
        <div class="stat-row">
          <span class="label">Cargo:</span>
          <span class="value">${inventoryUsed}/${gameState.player.inventoryCapacity}</span>
        </div>
        <div class="stat-row">
          <span class="label">Reputation:</span>
          <span class="value">${gameState.player.reputation}</span>
        </div>
        <div class="divider">├─ INVENTORY ─────┤</div>
        <div class="inventory-list">
          ${inventoryHtml}
        </div>
      </div>
    </div>
  `;
}

function renderMarketPanel() {
  const market = gameState.markets[gameState.player.location];
  const marketData = MARKETS[market.id];

  let goodsHtml = '';
  for (const [goodId, good] of Object.entries(GOODS)) {
    const basePrice = market.prices[goodId];
    const supply = market.supply[goodId];
    const supplyData = SUPPLY_LEVELS[supply];
    const isRestricted = market.restricted.includes(goodId);

    // Check for active discounts/premiums
    const buyInfo = getEffectiveBuyPrice(gameState, goodId);
    const sellInfo = getEffectiveSellPrice(gameState, goodId);

    const owned = gameState.player.inventory[goodId] || 0;
    const canAfford = gameState.player.balance >= buyInfo.price;
    const hasSpace = calculateInventoryUsed(gameState.player.inventory) < gameState.player.inventoryCapacity;

    const priceHistory = market.priceHistory?.[goodId] || [];

    // Build price display with discount/premium indicators
    let priceHtml;
    if (buyInfo.discount > 0) {
      priceHtml = `<span class="base-price strikethrough">${formatMoneyFull(basePrice)}</span>
                   <span class="discount-price">${formatMoneyFull(buyInfo.price)}</span>
                   <span class="discount-badge">-${buyInfo.discount}%</span>`;
    } else if (sellInfo.premium > 0) {
      priceHtml = `<span class="base-price strikethrough">${formatMoneyFull(basePrice)}</span>
                   <span class="premium-price">${formatMoneyFull(sellInfo.price)}</span>
                   <span class="premium-badge">+${sellInfo.premium}%</span>`;
    } else {
      const priceClass = getPriceClass(basePrice, goodId);
      priceHtml = `<span class="${priceClass}">${formatMoneyFull(basePrice)}</span>`;
    }

    goodsHtml += `
      <div class="market-row ${isRestricted ? 'restricted' : ''}">
        <span class="good-icon">${good.icon}</span>
        <span class="good-name">${good.name}</span>
        <span class="good-price">${priceHtml}</span>
        <span class="good-supply ${supply}">${supplyData.icon}</span>
        <span class="good-sparkline">${renderSparkline(priceHistory, goodId, buyInfo.discount > 0, sellInfo.premium > 0)}</span>
        <div class="good-actions">
          ${isRestricted
            ? '<span class="restricted-label">[RESTRICTED]</span>'
            : `
              <button class="btn btn-buy" ${!canAfford || !hasSpace ? 'disabled' : ''} data-good="${goodId}">BUY</button>
              <button class="btn btn-sell" ${owned === 0 ? 'disabled' : ''} data-good="${goodId}">SELL</button>
            `
          }
        </div>
      </div>
    `;
  }

  return `
    <div class="panel market-panel">
      <div class="panel-header">
        ╔════════════════════════════════════════════════╗
      </div>
      <div class="market-title">
        <span class="market-name">▓▓▓ ${marketData.name.toUpperCase()} ▓▓▓</span>
        <span class="market-subtitle">${marketData.subtitle}</span>
      </div>
      <div class="panel-header">
        ╚════════════════════════════════════════════════╝
      </div>
      <div class="market-table">
        <div class="market-header-row">
          <span class="col-icon"></span>
          <span class="col-name">GOOD</span>
          <span class="col-price">PRICE</span>
          <span class="col-supply">SUPPLY</span>
          <span class="col-sparkline">TREND</span>
          <span class="col-actions">ACTIONS</span>
        </div>
        ${goodsHtml}
      </div>
    </div>
  `;
}

function renderTravelPanel() {
  // Show traveling animation if in progress
  if (travelingTo) {
    const dest = MARKETS[travelingTo];
    return `
      <div class="panel travel-panel">
        <div class="panel-header">┌─ TRAVELING ─────┐</div>
        <div class="traveling-status">
          <div class="travel-progress">▓▓▓▓▓░░░░░</div>
          <div class="travel-dest">En route to ${dest.name}...</div>
        </div>
      </div>
    `;
  }

  let buttonsHtml = '';
  for (const [marketId, market] of Object.entries(MARKETS)) {
    if (marketId !== gameState.player.location) {
      buttonsHtml += `
        <button class="btn btn-travel" data-destination="${marketId}">
          ${market.name}
        </button>
      `;
    }
  }

  return `
    <div class="panel travel-panel">
      <div class="panel-header">┌─ TRAVEL TO ─────┐</div>
      <div class="travel-buttons">
        ${buttonsHtml}
      </div>
      <div class="travel-note">Travel takes 1 turn</div>
    </div>
  `;
}

function renderEventLog() {
  let logHtml = '';
  for (const entry of eventLog.slice(0, 20)) {
    logHtml += `
      <div class="log-entry ${entry.type}">
        <span class="log-turn">[${String(entry.turn).padStart(3, '0')}]</span>
        <span class="log-text">${escapeHtml(entry.text)}</span>
      </div>
    `;
  }

  return `
    <div class="panel event-log-panel">
      <div class="panel-header">┌─ EVENT LOG ─────────────────────────────────────┐</div>
      <div class="event-log">
        ${logHtml || '<div class="log-entry neutral">Game started. Good luck, trader.</div>'}
      </div>
    </div>
  `;
}

function renderActionBar() {
  const maxBorrow = getMaxBorrowable(gameState);
  const canPayDebt = gameState.player.debt > 0 && gameState.player.balance > 0;

  return `
    <div class="action-bar">
      <button class="btn btn-wait" id="btn-wait">WAIT</button>
      <div class="action-group">
        <button class="btn btn-borrow" id="btn-borrow" ${maxBorrow <= 0 ? 'disabled' : ''}>
          BORROW
        </button>
        <button class="btn btn-pay-debt" id="btn-pay-debt" ${!canPayDebt ? 'disabled' : ''}>
          PAY DEBT
        </button>
      </div>
      <button class="btn btn-upgrades" id="btn-upgrades">UPGRADES</button>
      <div class="action-group">
        <button class="btn btn-save" id="btn-save">SAVE</button>
        <button class="btn btn-load" id="btn-load">LOAD</button>
        <button class="btn btn-export" id="btn-export">EXPORT</button>
        <button class="btn btn-import" id="btn-import">IMPORT</button>
        <input type="file" id="import-file" accept=".json" style="display: none;">
      </div>
    </div>
  `;
}

function renderModal(content) {
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        ${content}
      </div>
    </div>
  `;
}

function renderBuySellModal(action, goodId) {
  const good = GOODS[goodId];
  const market = gameState.markets[gameState.player.location];
  const basePrice = market.prices[goodId];
  const owned = gameState.player.inventory[goodId] || 0;

  const isBuy = action === 'buy';

  // Get effective price considering discounts/premiums
  const buyInfo = getEffectiveBuyPrice(gameState, goodId);
  const sellInfo = getEffectiveSellPrice(gameState, goodId);
  const effectivePrice = isBuy ? buyInfo.price : sellInfo.price;
  const hasDiscount = isBuy && buyInfo.discount > 0;
  const hasPremium = !isBuy && sellInfo.premium > 0;

  const maxAfford = Math.floor(gameState.player.balance / effectivePrice);
  const maxCapacity = gameState.player.inventoryCapacity - calculateInventoryUsed(gameState.player.inventory);
  const maxQuantity = isBuy ? Math.min(maxAfford, maxCapacity) : owned;

  // Cost basis info for sell modal
  const avgCost = !isBuy ? calculateAverageCost(goodId, gameState.player) : 0;
  const profitPerUnit = effectivePrice - avgCost;
  const profitClass = profitPerUnit >= 0 ? 'positive' : 'negative';
  const profitSign = profitPerUnit >= 0 ? '+' : '';

  // Price display with discount/premium indicator
  let priceDisplay;
  if (hasDiscount) {
    priceDisplay = `<span class="strikethrough">${formatMoneyFull(basePrice)}</span> <span class="discount-price">${formatMoneyFull(effectivePrice)}</span> <span class="discount-badge">-${buyInfo.discount}%</span>`;
  } else if (hasPremium) {
    priceDisplay = `<span class="strikethrough">${formatMoneyFull(basePrice)}</span> <span class="premium-price">${formatMoneyFull(effectivePrice)}</span> <span class="premium-badge">+${sellInfo.premium}%</span>`;
  } else {
    priceDisplay = `<span class="${getPriceClass(basePrice, goodId)}">${formatMoneyFull(effectivePrice)} each</span>`;
  }

  return renderModal(`
    <div class="modal-header">${isBuy ? 'BUY' : 'SELL'} ${good.name}</div>
    <div class="modal-divider">────────────────────────</div>
    <div class="modal-content">
      <div class="modal-row">
        <span>${hasDiscount || hasPremium ? 'Special Price:' : 'Market Price:'}</span>
        ${priceDisplay}
      </div>
      ${isBuy ? `
        <div class="modal-row">
          <span>You can afford:</span>
          <span>${maxAfford}</span>
        </div>
        <div class="modal-row">
          <span>Cargo space:</span>
          <span>${maxCapacity} slots</span>
        </div>
      ` : `
        <div class="modal-row">
          <span>Your Avg Cost:</span>
          <span>${formatMoneyFull(avgCost)} each</span>
        </div>
        <div class="modal-row">
          <span>P&L per unit:</span>
          <span class="${profitClass}">${profitSign}${formatMoneyFull(profitPerUnit)}</span>
        </div>
        <div class="modal-row">
          <span>You own:</span>
          <span>${owned}</span>
        </div>
      `}
      <div class="modal-input-row">
        <label>Quantity:</label>
        <input type="number" id="modal-quantity" value="1" min="1" max="${maxQuantity}"
               data-avg-cost="${avgCost}" data-is-buy="${isBuy}" data-price="${effectivePrice}">
        <button class="btn btn-small" id="btn-max">MAX</button>
      </div>
      <div class="modal-row">
        <span>Total:</span>
        <span id="modal-total" class="${isBuy ? 'negative' : 'positive'}">${formatMoneyFull(effectivePrice)}</span>
      </div>
      ${!isBuy ? `
        <div class="modal-row">
          <span>Net Profit:</span>
          <span id="modal-profit" class="${profitClass}">${profitSign}${formatMoneyFull(profitPerUnit)}</span>
        </div>
      ` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="btn-modal-cancel">CANCEL</button>
      <button class="btn btn-confirm" id="btn-modal-confirm"
              data-action="${action}" data-good="${goodId}">CONFIRM</button>
    </div>
  `);
}

function renderBorrowModal() {
  const maxBorrow = getMaxBorrowable(gameState);

  return renderModal(`
    <div class="modal-header">BORROW FUNDS</div>
    <div class="modal-divider">────────────────────────</div>
    <div class="modal-content">
      <div class="modal-row">
        <span>Current debt:</span>
        <span class="negative">${formatMoneyFull(gameState.player.debt)}</span>
      </div>
      <div class="modal-row">
        <span>Interest rate:</span>
        <span class="warning">${(gameState.player.debtInterestRate * 100).toFixed(0)}% per turn</span>
      </div>
      <div class="modal-row">
        <span>Max borrowable:</span>
        <span>${formatMoneyFull(maxBorrow)}</span>
      </div>
      <div class="modal-input-row">
        <label>Amount:</label>
        <input type="number" id="modal-amount" value="${Math.min(10000, maxBorrow)}" min="1" max="${maxBorrow}">
        <button class="btn btn-small" id="btn-max">MAX</button>
      </div>
      <div class="modal-warning">
        ⚠ Debt exceeding 3x net worth = BANKRUPTCY
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="btn-modal-cancel">CANCEL</button>
      <button class="btn btn-confirm" id="btn-modal-confirm" data-action="borrow">BORROW</button>
    </div>
  `);
}

function renderPayDebtModal() {
  const maxPay = Math.min(gameState.player.balance, gameState.player.debt);

  return renderModal(`
    <div class="modal-header">PAY DEBT</div>
    <div class="modal-divider">────────────────────────</div>
    <div class="modal-content">
      <div class="modal-row">
        <span>Current debt:</span>
        <span class="negative">${formatMoneyFull(gameState.player.debt)}</span>
      </div>
      <div class="modal-row">
        <span>Your balance:</span>
        <span class="positive">${formatMoneyFull(gameState.player.balance)}</span>
      </div>
      <div class="modal-input-row">
        <label>Amount:</label>
        <input type="number" id="modal-amount" value="${maxPay}" min="1" max="${maxPay}">
        <button class="btn btn-small" id="btn-max">MAX</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="btn-modal-cancel">CANCEL</button>
      <button class="btn btn-confirm" id="btn-modal-confirm" data-action="payDebt">PAY</button>
    </div>
  `);
}

function renderUpgradesModal() {
  let upgradesHtml = '';

  for (const [upgradeId, upgrade] of Object.entries(UPGRADES)) {
    const purchased = gameState.purchasedUpgrades.includes(upgradeId);
    const hasPrereq = !upgrade.prerequisite || gameState.purchasedUpgrades.includes(upgrade.prerequisite);
    const isUnlocked = !upgrade.unlockedByMilestone || gameState.milestones[upgrade.unlockedByMilestone]?.achieved;
    const canAfford = gameState.player.balance >= upgrade.cost;

    let statusHtml = '';
    if (purchased) {
      statusHtml = '<span class="upgrade-status purchased">[ PURCHASED ]</span>';
    } else if (!isUnlocked) {
      const milestone = upgrade.unlockedByMilestone;
      statusHtml = `<span class="upgrade-status locked">[ LOCKED: ${gameState.milestones[milestone]?.name || milestone} ]</span>`;
    } else if (!hasPrereq) {
      statusHtml = `<span class="upgrade-status locked">[ REQUIRES: ${UPGRADES[upgrade.prerequisite].name} ]</span>`;
    } else {
      statusHtml = `
        <button class="btn btn-small btn-buy-upgrade"
                data-upgrade="${upgradeId}"
                ${!canAfford ? 'disabled' : ''}>
          ${canAfford ? 'BUY' : 'NEED ' + formatMoney(upgrade.cost)}
        </button>
      `;
    }

    upgradesHtml += `
      <div class="upgrade-row ${purchased ? 'purchased' : ''} ${!isUnlocked || !hasPrereq ? 'locked' : ''}">
        <div class="upgrade-info">
          <span class="upgrade-name">${purchased ? '[x]' : '[ ]'} ${upgrade.name}</span>
          <span class="upgrade-cost">${formatMoneyFull(upgrade.cost)}</span>
        </div>
        <div class="upgrade-desc">${upgrade.description}</div>
        <div class="upgrade-action">${statusHtml}</div>
      </div>
    `;
  }

  return renderModal(`
    <div class="modal-header">UPGRADES</div>
    <div class="modal-divider">────────────────────────────────</div>
    <div class="modal-content upgrades-list">
      ${upgradesHtml}
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="btn-modal-cancel">CLOSE</button>
    </div>
  `);
}

function renderChoiceModal(choice) {
  let choicesHtml = '';
  for (const opt of choice.choices) {
    choicesHtml += `
      <button class="btn btn-choice" data-choice-id="${opt.id}">
        <span class="choice-icon">${opt.icon || ''}</span>
        <span class="choice-label">${opt.label}</span>
      </button>
    `;
  }

  return renderModal(`
    <div class="modal-header choice-header">${choice.title}</div>
    <div class="modal-divider">════════════════════════════════</div>
    <div class="modal-content choice-content">
      <div class="choice-text">${choice.text}</div>
      ${choice.riskText ? `<div class="choice-risk">⚠ ${choice.riskText}</div>` : ''}
    </div>
    <div class="choice-actions">
      ${choicesHtml}
    </div>
  `);
}

function renderTravelConfirmModal(destination, atRiskGoods) {
  const destMarket = MARKETS[destination];

  let riskTableHtml = '';
  for (const item of atRiskGoods) {
    riskTableHtml += `
      <div class="risk-row">
        <span class="risk-good">${GOODS[item.goodId].icon} ${item.goodName}</span>
        <span class="risk-qty">x${item.quantity}</span>
        <span class="risk-chance">${item.seizureRisk}% seizure</span>
        <span class="risk-premium">+${item.pricePremium}% price</span>
      </div>
    `;
  }

  return renderModal(`
    <div class="modal-header travel-confirm-header">⚠ RESTRICTED ZONE</div>
    <div class="modal-divider">════════════════════════════════</div>
    <div class="modal-content travel-confirm-content">
      <div class="confirm-warning">
        You are entering <strong>${destMarket.name}</strong>, which has restrictions on some of your cargo.
      </div>
      <div class="confirm-subtitle">AT-RISK INVENTORY:</div>
      <div class="risk-table">
        ${riskTableHtml}
      </div>
      <div class="confirm-note">
        Restricted goods sell for higher prices here, but customs may seize part of your cargo.
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="btn-modal-cancel">CANCEL</button>
      <button class="btn btn-confirm btn-danger" id="btn-modal-confirm"
              data-action="travel" data-destination="${destination}">PROCEED ANYWAY</button>
    </div>
  `);
}

function renderSeizureNotice(seizureInfo) {
  if (!seizureInfo || seizureInfo.length === 0) return '';

  let seizureHtml = '';
  for (const item of seizureInfo) {
    seizureHtml += `<div class="seized-item">${GOODS[item.goodId].icon} ${item.quantity}x ${item.goodName} SEIZED!</div>`;
  }

  return `
    <div class="seizure-notice" id="seizure-notice">
      <div class="seizure-border">╔══════════════════════════════════════╗</div>
      <div class="seizure-content">
        <div class="seizure-title">⚠ CUSTOMS SEIZURE ⚠</div>
        ${seizureHtml}
      </div>
      <div class="seizure-border">╚══════════════════════════════════════╝</div>
    </div>
  `;
}

function renderMilestoneToast(milestone) {
  return `
    <div class="milestone-toast" id="milestone-toast">
      <div class="toast-border">╔══════════════════════════════════════╗</div>
      <div class="toast-content">
        <div class="toast-stars">★ ═══════════════════════════════ ★</div>
        <div class="toast-title">M I L E S T O N E</div>
        <div class="toast-name">${milestone.name}</div>
        <div class="toast-desc">${milestone.description}</div>
        ${milestone.reward.type === 'unlock_upgrade'
          ? `<div class="toast-reward">UNLOCKED: ${UPGRADES[milestone.reward.value]?.name || milestone.reward.value}</div>`
          : milestone.reward.type === 'reputation'
            ? `<div class="toast-reward">+${milestone.reward.value} REPUTATION</div>`
            : ''
        }
        <div class="toast-stars">★ ═══════════════════════════════ ★</div>
      </div>
      <div class="toast-border">╚══════════════════════════════════════╝</div>
    </div>
  `;
}

function renderGameOver() {
  const reason = gameState.gameOverReason === 'bankruptcy'
    ? 'Your debt exceeded 3x net worth.\nThe investors have taken everything.'
    : 'No funds, no inventory, no credit.\nYou have nothing left.';

  const milestonesAchieved = Object.values(gameState.milestones).filter(m => m.achieved).length;
  const totalMilestones = Object.keys(gameState.milestones).length;

  return `
    <div class="game-over-overlay">
      <div class="game-over-box">
        <pre class="game-over-ascii">${ASCII.bankrupt}</pre>
        <div class="game-over-divider">═══════════════════════════════════════</div>
        <div class="game-over-reason">${reason}</div>
        <div class="game-over-divider">═══════════════════════════════════════</div>
        <div class="game-over-stats">
          <div class="stat-row">
            <span>SURVIVED:</span>
            <span>${gameState.turn} turns</span>
          </div>
          <div class="stat-row">
            <span>PEAK NET WORTH:</span>
            <span>${formatMoneyFull(gameState.stats.peakNetWorth)}</span>
          </div>
          <div class="stat-row">
            <span>MILESTONES:</span>
            <span>${milestonesAchieved} / ${totalMilestones}</span>
          </div>
        </div>
        <button class="btn btn-new-game" id="btn-new-game">[ NEW GAME ]</button>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Render
// ─────────────────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');

  if (gameState.gameOver) {
    app.innerHTML = renderGameOver();
    attachGameOverEvents();
    return;
  }

  app.innerHTML = `
    ${renderHeader()}
    <div class="main-content">
      <div class="left-column">
        ${renderPlayerPanel()}
        ${renderTravelPanel()}
      </div>
      <div class="right-column">
        ${renderMarketPanel()}
        ${renderEventLog()}
      </div>
    </div>
    ${renderActionBar()}
  `;

  attachEvents();
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Handling
// ─────────────────────────────────────────────────────────────────────────────

function attachEvents() {
  // Buy buttons
  document.querySelectorAll('.btn-buy').forEach(btn => {
    btn.addEventListener('click', () => {
      const goodId = btn.dataset.good;
      showModal(renderBuySellModal('buy', goodId));
      attachModalEvents('buy', goodId);
    });
  });

  // Sell buttons
  document.querySelectorAll('.btn-sell').forEach(btn => {
    btn.addEventListener('click', () => {
      const goodId = btn.dataset.good;
      showModal(renderBuySellModal('sell', goodId));
      attachModalEvents('sell', goodId);
    });
  });

  // Travel buttons
  document.querySelectorAll('.btn-travel').forEach(btn => {
    btn.addEventListener('click', () => {
      const destination = btn.dataset.destination;

      // Check for at-risk goods
      const atRiskGoods = getAtRiskGoods(gameState, destination);

      if (atRiskGoods.length > 0) {
        // Show confirmation modal
        showModal(renderTravelConfirmModal(destination, atRiskGoods));
        attachTravelConfirmModalEvents(destination);
      } else {
        // No risk, travel directly
        startTravel(destination);
      }
    });
  });

  // Wait button
  document.getElementById('btn-wait')?.addEventListener('click', () => {
    executeAction({ action: 'wait' });
  });

  // Borrow button
  document.getElementById('btn-borrow')?.addEventListener('click', () => {
    showModal(renderBorrowModal());
    attachBorrowModalEvents();
  });

  // Pay debt button
  document.getElementById('btn-pay-debt')?.addEventListener('click', () => {
    showModal(renderPayDebtModal());
    attachPayDebtModalEvents();
  });

  // Upgrades button
  document.getElementById('btn-upgrades')?.addEventListener('click', () => {
    showModal(renderUpgradesModal());
    attachUpgradesModalEvents();
  });

  // Save button
  document.getElementById('btn-save')?.addEventListener('click', saveGame);

  // Load button
  document.getElementById('btn-load')?.addEventListener('click', loadGame);

  // Export button
  document.getElementById('btn-export')?.addEventListener('click', exportGame);

  // Import button
  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('import-file')?.click();
  });

  // Import file handler
  document.getElementById('import-file')?.addEventListener('change', importGame);
}

function showModal(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container.firstElementChild);
}

function closeModal() {
  const modal = document.getElementById('modal-overlay');
  if (modal) modal.remove();
}

function attachModalEvents(action, goodId) {
  const quantityInput = document.getElementById('modal-quantity');
  const totalDisplay = document.getElementById('modal-total');
  const profitDisplay = document.getElementById('modal-profit');
  const avgCost = parseFloat(quantityInput?.dataset.avgCost) || 0;
  const isBuy = quantityInput?.dataset.isBuy === 'true';
  // Use effective price from data attribute (includes discounts/premiums)
  const price = parseFloat(quantityInput?.dataset.price) || 0;

  // Update total (and profit for sell) on quantity change
  quantityInput?.addEventListener('input', () => {
    const qty = parseInt(quantityInput.value) || 0;
    totalDisplay.textContent = formatMoneyFull(price * qty);

    // Update net profit for sell transactions
    if (!isBuy && profitDisplay) {
      const netProfit = (price - avgCost) * qty;
      const sign = netProfit >= 0 ? '+' : '';
      profitDisplay.textContent = sign + formatMoneyFull(netProfit);
      profitDisplay.className = netProfit >= 0 ? 'positive' : 'negative';
    }
  });

  // Max button
  document.getElementById('btn-max')?.addEventListener('click', () => {
    quantityInput.value = quantityInput.max;
    quantityInput.dispatchEvent(new Event('input'));
  });

  // Cancel
  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeModal);

  // Confirm
  document.getElementById('btn-modal-confirm')?.addEventListener('click', () => {
    const quantity = parseInt(quantityInput.value) || 0;
    if (quantity > 0) {
      executeAction({ action, good: goodId, quantity });
      closeModal();
    }
  });

  // Click outside to close
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function attachBorrowModalEvents() {
  const amountInput = document.getElementById('modal-amount');
  const maxBorrow = getMaxBorrowable(gameState);

  document.getElementById('btn-max')?.addEventListener('click', () => {
    amountInput.value = maxBorrow;
  });

  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeModal);

  document.getElementById('btn-modal-confirm')?.addEventListener('click', () => {
    const amount = parseInt(amountInput.value) || 0;
    if (amount > 0) {
      executeAction({ action: 'borrow', amount });
      closeModal();
    }
  });

  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function attachPayDebtModalEvents() {
  const amountInput = document.getElementById('modal-amount');
  const maxPay = Math.min(gameState.player.balance, gameState.player.debt);

  document.getElementById('btn-max')?.addEventListener('click', () => {
    amountInput.value = maxPay;
  });

  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeModal);

  document.getElementById('btn-modal-confirm')?.addEventListener('click', () => {
    const amount = parseInt(amountInput.value) || 0;
    if (amount > 0) {
      executeAction({ action: 'payDebt', amount });
      closeModal();
    }
  });

  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function attachUpgradesModalEvents() {
  document.querySelectorAll('.btn-buy-upgrade').forEach(btn => {
    btn.addEventListener('click', () => {
      const upgradeId = btn.dataset.upgrade;
      executeAction({ action: 'upgrade', upgradeId });
      closeModal();
    });
  });

  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeModal);

  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function attachGameOverEvents() {
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    localStorage.removeItem('aiWars_save');
    eventLog = [];
    gameState = createGame();
    render();
  });
}

function startTravel(destination) {
  // Show traveling animation
  travelingTo = destination;
  render();

  // Execute travel and show result after delay
  setTimeout(() => {
    travelingTo = null;
    executeAction({ action: 'travel', destination, confirmed: true });
  }, 800);
}

function attachTravelConfirmModalEvents(destination) {
  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeModal);

  document.getElementById('btn-modal-confirm')?.addEventListener('click', () => {
    closeModal();
    startTravel(destination);
  });

  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function attachChoiceModalEvents() {
  document.querySelectorAll('.btn-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const choiceId = btn.dataset.choiceId;

      // Execute action and get result
      const result = submitAction(gameState, { action: 'resolveChoice', choiceId });

      if (!result.success) {
        closeModal();
        addLogEntry('error', result.error);
        return;
      }

      // Update game state
      gameState = result.state;

      // Show result in the modal
      showChoiceResult(result.choiceResult, choiceId);
    });
  });
}

function showChoiceResult(choiceResult, choiceId) {
  const modal = document.querySelector('.modal');
  if (!modal) return;

  // Determine result type for styling
  const isWin = choiceResult.gainedMoney > 0 || choiceResult.gainedGoods;
  const isLoss = choiceResult.lostMoney > 0 && !choiceResult.gainedGoods;
  const isNeutral = choiceId === 'decline' || (!isWin && !isLoss);

  let resultClass = 'result-neutral';
  let resultIcon = '→';
  if (isWin) {
    resultClass = 'result-win';
    resultIcon = '✓';
  } else if (isLoss) {
    resultClass = 'result-loss';
    resultIcon = '✗';
  }

  // Update modal content to show result
  const content = modal.querySelector('.choice-content');
  const actions = modal.querySelector('.choice-actions');

  if (content) {
    content.innerHTML = `
      <div class="choice-result ${resultClass}">
        <div class="result-icon">${resultIcon}</div>
        <div class="result-message">${choiceResult.message}</div>
        ${choiceResult.gainedMoney > 0 ? `<div class="result-gain">+${formatMoneyFull(choiceResult.gainedMoney)}</div>` : ''}
        ${choiceResult.lostMoney > 0 ? `<div class="result-loss-amount">-${formatMoneyFull(choiceResult.lostMoney)}</div>` : ''}
      </div>
    `;
  }

  if (actions) {
    actions.innerHTML = `
      <button class="btn btn-confirm" id="btn-choice-ok">OK</button>
    `;
  }

  // Attach OK button handler
  document.getElementById('btn-choice-ok')?.addEventListener('click', () => {
    closeModal();
    finalizeChoiceAction(choiceResult);
  });
}

function finalizeChoiceAction(choiceResult) {
  // Log the result
  const type = choiceResult.gainedMoney > 0 ? 'positive'
    : choiceResult.lostMoney > 0 ? 'negative'
    : 'neutral';
  addLogEntry(type, choiceResult.message);

  // Auto-save and render
  saveGame(true);
  render();
}

function showChoiceModal(choiceEvent) {
  showModal(renderChoiceModal(choiceEvent));
  attachChoiceModalEvents();
}

function showSeizureNotice(seizureInfo) {
  const container = document.createElement('div');
  container.innerHTML = renderSeizureNotice(seizureInfo);
  document.body.appendChild(container.firstElementChild);

  // Auto-dismiss after delay
  setTimeout(() => {
    const notice = document.getElementById('seizure-notice');
    if (notice) {
      notice.classList.add('fade-out');
      setTimeout(() => notice.remove(), 500);
    }
  }, 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Execution
// ─────────────────────────────────────────────────────────────────────────────

function executeAction(action) {
  const result = submitAction(gameState, action);

  if (!result.success) {
    addLogEntry('error', result.error);
    return;
  }

  gameState = result.state;

  // Log the turn summary if present
  if (result.turnSummary) {
    addLogEntry('action', result.turnSummary);
  }

  // Note: choice results are logged by finalizeChoiceAction after modal closes

  // Log events
  for (const event of result.events) {
    const type = ['customs', 'hack', 'audit'].includes(event.type) ? 'negative'
      : ['opportunity', 'windfall'].includes(event.type) ? 'positive'
      : 'neutral';
    addLogEntry(type, `${event.title}: ${event.description}`);
  }

  // Show seizure notice if any goods were seized
  if (result.seizureInfo && result.seizureInfo.length > 0) {
    showSeizureNotice(result.seizureInfo);
    for (const item of result.seizureInfo) {
      addLogEntry('negative', `CUSTOMS: ${item.quantity}x ${item.goodName} seized!`);
    }
  }

  // Show milestone toasts
  for (const milestone of result.milestonesAchieved) {
    showMilestoneToast(milestone);
  }

  // Auto-save
  saveGame(true);

  render();

  // Show choice modal if there's a pending choice (after render)
  if (result.choiceEvent) {
    setTimeout(() => showChoiceModal(result.choiceEvent), 100);
  }
}

function addLogEntry(type, text) {
  eventLog.unshift({
    turn: gameState.turn,
    type,
    text
  });
  if (eventLog.length > MAX_LOG_ENTRIES) {
    eventLog.pop();
  }
}

function showMilestoneToast(milestone) {
  const container = document.createElement('div');
  container.innerHTML = renderMilestoneToast(milestone);
  document.body.appendChild(container.firstElementChild);

  setTimeout(() => {
    const toast = document.getElementById('milestone-toast');
    if (toast) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 500);
    }
  }, 3000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Save/Load
// ─────────────────────────────────────────────────────────────────────────────

function saveGame(silent = false) {
  const saveData = createSaveData(gameState, eventLog);
  localStorage.setItem('aiWars_save', JSON.stringify(saveData));
  if (!silent) {
    addLogEntry('neutral', 'Game saved.');
    render();
  }
}

function loadGame() {
  const saved = localStorage.getItem('aiWars_save');
  if (!saved) {
    addLogEntry('error', 'No saved game found.');
    render();
    return;
  }

  try {
    const saveData = JSON.parse(saved);
    const validation = validateSaveData(saveData);
    if (!validation.valid) {
      addLogEntry('error', `Invalid save: ${validation.errors[0]}`);
      render();
      return;
    }
    gameState = saveData.state;
    eventLog = saveData.eventLog || [];
    addLogEntry('neutral', 'Game loaded.');
    render();
  } catch (e) {
    addLogEntry('error', 'Failed to load save.');
    render();
  }
}

function exportGame() {
  const saveData = createSaveData(gameState, eventLog);

  const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compute-wars-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  addLogEntry('neutral', 'Game exported to file.');
  render();
}

function importGame(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const saveData = JSON.parse(e.target.result);
      const validation = validateSaveData(saveData);

      if (!validation.valid) {
        addLogEntry('error', `Invalid save file: ${validation.errors[0]}`);
        render();
        return;
      }

      gameState = saveData.state;
      eventLog = saveData.eventLog || [];
      addLogEntry('neutral', `Game imported from file (saved ${saveData.savedAt || 'unknown'}).`);
      render();
    } catch (err) {
      addLogEntry('error', 'Failed to parse save file.');
      render();
    }
  };
  reader.readAsText(file);

  // Reset the input so the same file can be imported again
  event.target.value = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

export function init() {
  // Try to load existing save
  const saved = localStorage.getItem('aiWars_save');
  if (saved) {
    try {
      const saveData = JSON.parse(saved);
      gameState = saveData.state;
      eventLog = saveData.eventLog || [];
    } catch (e) {
      gameState = createGame();
    }
  } else {
    gameState = createGame();
  }

  render();
}
