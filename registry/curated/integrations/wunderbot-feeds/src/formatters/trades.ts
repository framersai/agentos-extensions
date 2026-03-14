/**
 * @fileoverview Trades formatters — short squeeze + CMC trending.
 * Ported from bots/trades_poster.py.
 */

import type { DiscordEmbed, ShortSqueezeStock, TrendingCoin, TrendingCryptoHistory } from '../types.js';
import { BRAND_COLOR, truncate, nowIso, humanNumber, EMBED_DESCRIPTION_LIMIT, EMBED_TITLE_LIMIT } from './common.js';

// ---------------------------------------------------------------------------
// Short Squeeze
// ---------------------------------------------------------------------------

export function formatShortSqueezeEmbed(stocks: ShortSqueezeStock[]): DiscordEmbed {
  const lines: string[] = [];

  for (let i = 0; i < Math.min(stocks.length, 10); i++) {
    const s = stocks[i];
    if (!s.ticker) continue;

    // Color-coded SI% indicator
    let bar = '⚪';
    const siVal = parseFloat(s.si_pct.replace('%', ''));
    if (!isNaN(siVal)) {
      if (siVal >= 40) bar = '🔴';       // extreme
      else if (siVal >= 30) bar = '🟠';   // very high
      else bar = '🟡';                    // high
    }

    const header = `${bar} **${i + 1}. ${s.ticker}** — ${s.name}`;
    const row1 = `\u2003\u2003**Short Interest:** \`${s.si_pct}\` \u2003**Exchange:** ${s.exchange}`;
    const row2 = `\u2003\u2003**Float:** \`${s.float_shares}\` \u2003**Outstanding:** \`${s.outstanding}\``;
    let entry = `${header}\n${row1}\n${row2}`;
    if (s.industry) {
      entry += `\n\u2003\u2003*${s.industry}*`;
    }
    lines.push(entry);
  }

  return {
    title: truncate('📉 Short Squeeze Radar — Top 10', EMBED_TITLE_LIMIT),
    url: 'https://www.highshortinterest.com/',
    description: truncate(lines.join('\n\n') || 'No data.', EMBED_DESCRIPTION_LIMIT),
    color: BRAND_COLOR,
    timestamp: nowIso(),
    author: { name: '📉 Wunderland Markets' },
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
  };
}

// ---------------------------------------------------------------------------
// Trending Crypto
// ---------------------------------------------------------------------------

function changeIndicator(changeStr: string): string {
  const val = parseFloat(changeStr.replace('%', '').trim());
  if (isNaN(val)) return '⚪';
  if (val > 0) return '🟢';
  if (val < 0) return '🔴';
  return '⚪';
}

function format7dLine(currentRank: number, currentPrice: string, hist: TrendingCryptoHistory[string]): string {
  const parts: string[] = [];

  // Rank change
  try {
    const oldRank = hist.rank;
    if (oldRank !== currentRank) {
      parts.push(`rank ${oldRank}→${currentRank}`);
    } else {
      parts.push(`rank ${currentRank} (=)`);
    }
  } catch { /* skip */ }

  // Price change
  try {
    const oldPrice = hist.price_usd;
    const newPrice = parseFloat(currentPrice.replace(/[$,]/g, ''));
    if (oldPrice > 0 && !isNaN(newPrice)) {
      const pct = ((newPrice - oldPrice) / oldPrice) * 100;
      const oldFmt = oldPrice >= 1 ? `$${oldPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${oldPrice.toFixed(6)}`;
      const newFmt = newPrice >= 1 ? `$${newPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${newPrice.toFixed(6)}`;
      parts.push(`${oldFmt}→${newFmt} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`);
    }
  } catch { /* skip */ }

  if (parts.length === 0) return '';
  return `\u2003📅 7d: ${parts.join(' · ')}`;
}

export function formatTrendingCryptoEmbed(
  coins: TrendingCoin[],
  history7d: TrendingCryptoHistory = {},
): DiscordEmbed {
  const lines: string[] = [];

  for (const coin of coins) {
    const indicator = changeIndicator(coin.change_24h);
    const mcapShort = humanNumber(coin.market_cap);
    const volShort = humanNumber(coin.volume);

    const coinLink = coin.url && coin.url !== '—'
      ? `[${coin.symbol}](${coin.url})`
      : `**${coin.symbol}**`;

    const header = `${indicator} **${coin.rank}. ${coinLink}** — ${truncate(coin.name, 40)}`;
    const row1 = `\u2003\u2003**Price:** \`${coin.price}\` \u2003**24h:** \`${coin.change_24h}\``;
    const row2 = `\u2003\u2003**MCap:** \`${mcapShort}\` \u2003**Vol:** \`${volShort}\``;
    let entry = `${header}\n${row1}\n${row2}`;

    // 7d comparison
    const hist = history7d[coin.symbol];
    if (hist) {
      const line7d = format7dLine(coin.rank, coin.price, hist);
      if (line7d) entry += '\n' + line7d;
    } else if (Object.keys(history7d).length > 0) {
      entry += '\n\u2003\u20031️⃣🆕 *new to trending*';
    }

    lines.push(entry);
  }

  if (lines.length === 0) {
    return {
      description: 'No trending crypto data.',
      color: BRAND_COLOR,
      timestamp: nowIso(),
    };
  }

  return {
    title: '📈 Trending Crypto — Top 10',
    url: 'https://www.coingecko.com/en/trending-cryptocurrencies',
    description: truncate(lines.join('\n\n'), EMBED_DESCRIPTION_LIMIT),
    color: BRAND_COLOR,
    timestamp: nowIso(),
    author: { name: '📈 Wunderland Markets' },
    footer: { text: 'Powered by Wunderbots | rabbithole.inc' },
  };
}
