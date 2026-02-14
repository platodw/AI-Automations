import { withRetry } from '@/lib/retry';
import { format, subDays, startOfWeek } from 'date-fns';

interface BillingData {
  daily: {
    date: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number }>;
  };
  weekly?: {
    startDate: string;
    endDate: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    dailyBreakdown: Array<{
      date: string;
      cost: number;
    }>;
  };
  error?: string;
}

// Cost per 1K tokens (approximate)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3-5-haiku': { input: 0.0008, output: 0.004 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  'claude-sonnet-4': { input: 0.003, output: 0.015 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Find matching model cost
  const modelKey = Object.keys(MODEL_COSTS).find((k) => model.includes(k));
  const costs = modelKey ? MODEL_COSTS[modelKey] : { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

export async function fetchAnthropicBilling(includeFridayWeekly: boolean = false): Promise<BillingData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      daily: {
        date: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        byModel: {},
      },
      error: 'Anthropic API key not configured',
    };
  }

  const yesterday = subDays(new Date(), 1);
  const dateStr = format(yesterday, 'yyyy-MM-dd');

  try {
    // Fetch usage from Anthropic API
    const dailyData = await withRetry(
      async () => {
        const res = await fetch(
          `https://api.anthropic.com/v1/organizations/usage?start_date=${dateStr}&end_date=${dateStr}`,
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
          }
        );

        if (res.status === 404 || res.status === 403) {
          // API may not be available - return empty
          return null;
        }

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Anthropic API error ${res.status}: ${body}`);
        }

        return res.json();
      },
      { label: 'anthropic-billing', retries: 2 }
    );

    let dailyResult;
    if (dailyData && dailyData.data) {
      const byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number }> = {};
      let totalInput = 0;
      let totalOutput = 0;
      let totalCost = 0;

      for (const entry of dailyData.data) {
        const model = entry.model || 'unknown';
        const input = entry.input_tokens || 0;
        const output = entry.output_tokens || 0;
        const cost = entry.cost || estimateCost(model, input, output);

        if (!byModel[model]) {
          byModel[model] = { inputTokens: 0, outputTokens: 0, cost: 0 };
        }
        byModel[model].inputTokens += input;
        byModel[model].outputTokens += output;
        byModel[model].cost += cost;

        totalInput += input;
        totalOutput += output;
        totalCost += cost;
      }

      dailyResult = {
        date: dateStr,
        totalCost: Math.round(totalCost * 100) / 100,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        byModel,
      };
    } else {
      dailyResult = {
        date: dateStr,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        byModel: {},
      };
    }

    // Weekly summary for Fridays
    let weekly;
    if (includeFridayWeekly) {
      const weekStart = startOfWeek(yesterday, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');

      try {
        const weeklyData = await withRetry(
          async () => {
            const res = await fetch(
              `https://api.anthropic.com/v1/organizations/usage?start_date=${weekStartStr}&end_date=${dateStr}`,
              {
                headers: {
                  'x-api-key': apiKey,
                  'anthropic-version': '2023-06-01',
                  'Content-Type': 'application/json',
                },
              }
            );
            if (!res.ok) return null;
            return res.json();
          },
          { label: 'anthropic-billing-weekly', retries: 2 }
        );

        if (weeklyData?.data) {
          const dailyBreakdown: Record<string, number> = {};
          let totalCost = 0;
          let totalInput = 0;
          let totalOutput = 0;

          for (const entry of weeklyData.data) {
            const d = entry.date || dateStr;
            const cost = entry.cost || estimateCost(entry.model || '', entry.input_tokens || 0, entry.output_tokens || 0);
            dailyBreakdown[d] = (dailyBreakdown[d] || 0) + cost;
            totalCost += cost;
            totalInput += entry.input_tokens || 0;
            totalOutput += entry.output_tokens || 0;
          }

          weekly = {
            startDate: weekStartStr,
            endDate: dateStr,
            totalCost: Math.round(totalCost * 100) / 100,
            totalInputTokens: totalInput,
            totalOutputTokens: totalOutput,
            dailyBreakdown: Object.entries(dailyBreakdown).map(([date, cost]) => ({
              date,
              cost: Math.round(cost * 100) / 100,
            })),
          };
        }
      } catch {
        // Non-critical
      }
    }

    return { daily: dailyResult, weekly };
  } catch (error) {
    return {
      daily: {
        date: dateStr,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        byModel: {},
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
