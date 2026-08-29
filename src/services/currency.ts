import logger from "../utils/logger";
import axios from "axios";
import {
  exchangeRateBufferService,
  BufferedRate,
} from "./exchangeRateBufferService";
import {
  dynamicSpreadService,
  SpreadInputs,
  SpreadResult,
} from "./dynamicSpreadService";

// ---------------------------------------------------------------------------
// Supported currencies
// ---------------------------------------------------------------------------

export const SUPPORTED_CURRENCIES = [
  "USD",
  "XAF",
  "NGN",
  "KES",
  "GHS",
  "TZS",
  "ZMW",
  "RWF",
  "GNF",
  "MGA",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** All exchange rates expressed as units-per-USD (i.e. USD = 1). */
type ExchangeRates = Record<string, number>;

/** Base currency for all conversions (stored amounts are in this currency). */
export const BASE_CURRENCY: SupportedCurrency = "USD";

/**
 * NOTE: XLM price fluctuation rate buffer locks are pending full integration.
 * See issue description for details on 60-second locks and 0.5% buffer threshold.
 */

// ---------------------------------------------------------------------------
// Internal API response shape (exchangerate-api.com v6)
// ---------------------------------------------------------------------------

interface ExchangeRateApiResponse {
  result: "success" | "error";
  "error-type"?: string;
  base_code: string;
  conversion_rates: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ConversionResult {
  originalAmount: number;
  originalCurrency: SupportedCurrency;
  convertedAmount: number;
  baseCurrency: SupportedCurrency;
  /** Rate applied: how many baseCurrency units equal 1 originalCurrency unit. */
  rate: number;
}

export interface CurrencyServiceStatus {
  cachePopulated: boolean;
  isStale: boolean;
  lastUpdated: Date | null;
  usingFallback: boolean;
  rates: ExchangeRates;
}

// ---------------------------------------------------------------------------
// Static fallback rates (approximate — updated 2025 Q1)
// Used when the API is unavailable to ensure the service degrades gracefully.
// ---------------------------------------------------------------------------

const FALLBACK_RATES: ExchangeRates = {
  USD: 1,
  XAF: 600, // Central African CFA franc (pegged to EUR/USD)
  NGN: 1550, // Nigerian Naira
  KES: 130, // Kenyan Shilling
  GHS: 15, // Ghanaian Cedi
  TZS: 2600, // Tanzanian Shilling
  ZMW: 27, // Zambian Kwacha
  RWF: 1320, // Rwandan Franc
  GNF: 8500, // Guinean Franc
  MGA: 4500, // Malagasy Ariary
};

// ---------------------------------------------------------------------------
// CurrencyService
// ---------------------------------------------------------------------------

export class CurrencyService {
  private readonly apiBaseUrl = "https://v6.exchangerate-api.com/v6";
  private readonly cacheTtlMs = 60 * 60 * 1000; // 1 hour
  private readonly fetchTimeoutMs = 10_000;

  private cache: { rates: ExchangeRates; fetchedAt: Date } | null = null;
  private usingFallback = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Fetch initial rates and schedule hourly refreshes.
   * Call this once during application startup.
   */
  async initialize(): Promise<void> {
    await this.fetchRates();

    this.refreshTimer = setInterval(() => {
      this.fetchRates().catch((err: Error) => {
        logger.error(
          "[CurrencyService] Scheduled rate refresh failed:",
          err.message,
        );
      });
    }, this.cacheTtlMs);
  }

  /** Stop the background refresh timer (call during graceful shutdown). */
  shutdown(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Public query methods
  // -------------------------------------------------------------------------

  isSupportedCurrency(currency: string): currency is SupportedCurrency {
    return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
  }

  /**
   * Convert `amount` from `from` currency to `to` currency.
   * Throws if either currency has no known rate.
   */
  convert(
    amount: number,
    from: SupportedCurrency,
    to: SupportedCurrency,
  ): ConversionResult {
    if (amount < 0) throw new Error("Amount must be non-negative");

    const rates = this.getRates();

    if (rates[from] === undefined)
      throw new Error(`No exchange rate available for ${from}`);
    if (rates[to] === undefined)
      throw new Error(`No exchange rate available for ${to}`);

    // Convert via USD base
    const amountInUsd = amount / rates[from];
    const convertedAmount = amountInUsd * rates[to];

    // Effective rate: how many 'to' units per 1 'from' unit
    const rate = rates[to] / rates[from];

    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount,
      baseCurrency: to,
      rate,
    };
  }

  /**
   * Convert with rate buffer applied (delegates to ExchangeRateBufferService).
   */
  async convertWithBuffer(
    amount: number,
    from: SupportedCurrency,
    to: SupportedCurrency,
    provider: string,
    direction: "sell" | "buy" = "sell",
  ): Promise<ConversionResult & { bufferedRate: number; bufferApplied: number; mode: string }>
  {
    const baseResult = this.convert(amount, from, to);
    const buffered = await exchangeRateBufferService.applyBuffer(
      baseResult.rate,
      provider,
      from,
      to,
      direction,
    );

    const convertedAmount = amount * buffered.bufferedRate;

    return {
      ...baseResult,
      rate: buffered.bufferedRate,
      convertedAmount,
      bufferedRate: buffered.bufferedRate,
      bufferApplied: buffered.bufferApplied,
      mode: buffered.mode,
    };
  }

  /**
   * Convert with dynamic spread scaling (liquidity depth + settlement time).
   */
  async convertWithDynamicSpread(
    amount: number,
    from: SupportedCurrency,
    to: SupportedCurrency,
    provider: string,
    direction: "sell" | "buy" = "sell",
    overrides?: { liquidityVolumeUsd?: number; settlementTimeMs?: number },
  ): Promise<ConversionResult & { spreadResult: SpreadResult }> {
    const baseResult = this.convert(amount, from, to);
    const spreadResult = await dynamicSpreadService.calculateSpread({
      provider,
      fromCurrency: from,
      toCurrency: to,
      ...overrides,
    });

    const rate = spreadResult.adjustedRate;
    const convertedAmount = amount * rate;

    return {
      ...baseResult,
      rate,
      convertedAmount,
      spreadResult,
    };
  }

  // -------------------------------------------------------------------------
  // Private fetch and cache methods
  // -------------------------------------------------------------------------

  private getRates(): ExchangeRates {
    if (this.cache && !this.isCacheStale()) {
      return this.cache.rates;
    }
    return FALLBACK_RATES;
  }

  private isCacheStale(): boolean {
    if (!this.cache) return true;
    const ageMs = Date.now() - this.cache.fetchedAt.getTime();
    return ageMs > this.cacheTtlMs * 2;
  }

  private async fetchRates(): Promise<void> {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    if (!apiKey) {
      logger.warn("[CurrencyService] EXCHANGE_RATE_API_KEY not set. Using fallback rates.");
      this.usingFallback = true;
      return;
    }

    try {
      const url = `${this.apiBaseUrl}/${apiKey}/latest/${BASE_CURRENCY}`;
      const response = await axios.get<ExchangeRateApiResponse>(url, {
        timeout: this.fetchTimeoutMs,
      });

      if (response.data.result === "success") {
        this.cache = {
          rates: response.data.conversion_rates,
          fetchedAt: new Date(),
        };
        this.usingFallback = false;
        logger.info("[CurrencyService] Exchange rates successfully fetched and cached.");
      } else {
        logger.error(
          "[CurrencyService] API error response:",
          response.data["error-type"],
        );
        this.usingFallback = true;
      }
    } catch (err: any) {
      logger.error(
        "[CurrencyService] Failed to fetch rates from API, using fallback:",
        err.message,
      );
      this.usingFallback = true;
    }
  }

  getStatus(): CurrencyServiceStatus {
    return {
      cachePopulated: this.cache !== null,
      isStale: this.isCacheStale(),
      lastUpdated: this.cache ? this.cache.fetchedAt : null,
      usingFallback: this.usingFallback,
      rates: this.getRates(),
    };
  }
}

export const currencyService = new CurrencyService();
