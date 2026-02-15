import { withRetry } from '@/lib/retry';

interface StockIndex {
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

interface StockData {
  indices: StockIndex[];
  futures: Array<{
    name: string;
    price: number;
    change: number;
    changePercent: number;
  }>;
  marketStatus: string;
  asOf: string;
}

async function fetchYahooQuote(symbol: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MorningDigest/1.0)',
    },
  });
  if (!res.ok) throw new Error(`Yahoo Finance error for ${symbol}: ${res.status}`);
  return res.json();
}

function parseYahooData(data: any, name: string): StockIndex | null {
  try {
    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      name,
      symbol: meta.symbol,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      previousClose: Math.round(previousClose * 100) / 100,
    };
  } catch {
    return null;
  }
}

export async function fetchStocks(): Promise<StockData> {
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;

  const indexSymbols = [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^DJI', name: 'Dow Jones' },
    { symbol: '^IXIC', name: 'Nasdaq' },
  ];

  const futuresSymbols = [
    { symbol: 'ES=F', name: 'S&P 500 Futures' },
    { symbol: 'YM=F', name: 'Dow Futures' },
    { symbol: 'NQ=F', name: 'Nasdaq Futures' },
  ];

  const indices: StockIndex[] = [];
  const futures: Array<{ name: string; price: number; change: number; changePercent: number }> = [];

  // Try Yahoo Finance first
  try {
    const indexResults = await Promise.allSettled(
      indexSymbols.map(({ symbol, name }) =>
        withRetry(
          async () => {
            const data = await fetchYahooQuote(symbol);
            return parseYahooData(data, name);
          },
          { label: `stock-${symbol}`, retries: 2 }
        )
      )
    );

    for (const result of indexResults) {
      if (result.status === 'fulfilled' && result.value) {
        indices.push(result.value);
      }
    }

    const futuresResults = await Promise.allSettled(
      futuresSymbols.map(({ symbol, name }) =>
        withRetry(
          async () => {
            const data = await fetchYahooQuote(symbol);
            const parsed = parseYahooData(data, name);
            if (parsed) {
              return {
                name: parsed.name,
                price: parsed.price,
                change: parsed.change,
                changePercent: parsed.changePercent,
              };
            }
            return null;
          },
          { label: `futures-${symbol}`, retries: 2 }
        )
      )
    );

    for (const result of futuresResults) {
      if (result.status === 'fulfilled' && result.value) {
        futures.push(result.value);
      }
    }
  } catch (error) {
    console.error('Yahoo Finance failed, trying Alpha Vantage:', error);

    if (alphaKey) {
      for (const { name } of indexSymbols) {
        const functionName = name === 'S&P 500' ? 'SPY' : name === 'Dow Jones' ? 'DIA' : 'QQQ';
        try {
          const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${functionName}&apikey=${alphaKey}`;
          const res = await fetch(url);
          const data = await res.json();
          const quote = data['Global Quote'];
          if (quote) {
            indices.push({
              name,
              symbol: functionName,
              price: parseFloat(quote['05. price']),
              change: parseFloat(quote['09. change']),
              changePercent: parseFloat(quote['10. change percent']),
              previousClose: parseFloat(quote['08. previous close']),
            });
          }
        } catch {
          // Skip
        }
      }
    }
  }

  const now = new Date();
  const hour = now.getUTCHours();
  const isWeekday = now.getDay() > 0 && now.getDay() < 6;
  let marketStatus = 'Closed';
  if (isWeekday) {
    if (hour >= 13 && hour < 14) marketStatus = 'Pre-Market';
    else if (hour >= 14 && hour < 21) marketStatus = 'Open';
    else if (hour >= 21 && hour < 22) marketStatus = 'After-Hours';
  }

  return {
    indices,
    futures,
    marketStatus,
    asOf: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
  };
}
