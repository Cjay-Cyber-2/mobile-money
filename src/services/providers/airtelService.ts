import axios, { AxiosError } from "axios";
import { BaseProvider, ProviderAuthConfig } from "./baseProvider";
import { recordTelecomLatency } from "../../utils/logger";
import logger from "../../utils/logger";

interface AirtelTokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
}

interface AirtelStatusResponse {
  data?: {
    transaction?: {
      status?: string;
      id?: string;
    };
    status?: string;
  };
  status?: {
    success?: boolean;
    code?: string;
    result_code?: string;
  };
  transaction_status?: string;
  status?: string;
}

export type AirtelTransactionStatus =
  | "completed"
  | "failed"
  | "pending"
  | "unknown";

export interface AirtelServiceConfig extends Partial<ProviderAuthConfig> {
  country?: string;
  currency?: string;
}

interface AirtelResolvedConfig extends ProviderAuthConfig {
  country: string;
  currency: string;
}

const POLL_DELAY_MS = 15_000;
const MAX_POLL_ATTEMPTS = 4;

let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
const pollEntries: Map<string, { reference: string; service: AirtelService; attempt: number }> = new Map();

function startPollProcessor(): void {
  if (pollTimeoutId !== null) return;
  if (pollEntries.size === 0) return;
  pollTimeoutId = setTimeout(async () => {
    pollTimeoutId = null;
    const batch = [...pollEntries.entries()];
    pollEntries.clear();
    for (const [, entry] of batch) {
      try {
        const result = await entry.service.getTransactionStatus(entry.reference);
        if (result.status === "pending" && entry.attempt < MAX_POLL_ATTEMPTS) {
          addPollEntry(entry.reference, entry.service, entry.attempt + 1);
        } else {
          logger.info(
            { reference: entry.reference, status: result.status, attempts: entry.attempt },
            "Airtel poll resolved transaction status",
          );
        }
      } catch (err) {
        logger.error(
          { reference: entry.reference, error: err instanceof Error ? err.message : err },
          "Airtel poll attempt failed, will retry",
        );
        if (entry.attempt < MAX_POLL_ATTEMPTS) {
          addPollEntry(entry.reference, entry.service, entry.attempt + 1);
        }
      }
    }
    startPollProcessor();
  }, POLL_DELAY_MS);
}

function addPollEntry(reference: string, service: AirtelService, attempt = 1): void {
  const key = `${reference}-${attempt}`;
  if (!pollEntries.has(key)) {
    pollEntries.set(key, { reference, service, attempt });
    startPollProcessor();
  }
}

function isNetworkTimeout(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return (
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNRESET" ||
      error.code === "ENOTFOUND" ||
      error.message?.toLowerCase().includes("timeout") ||
      error.message?.toLowerCase().includes("econnabort")
    );
  }
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /timeout|econnabort|etimedout|econnreset|enotfound/i.test(msg);
}

function buildAirtelConfig(opts: AirtelServiceConfig = {}): AirtelResolvedConfig {
  return {
    apiKey: opts.apiKey ?? process.env.AIRTEL_API_KEY ?? "",
    apiSecret: opts.apiSecret ?? process.env.AIRTEL_API_SECRET ?? "",
    baseUrl: opts.baseUrl ?? process.env.AIRTEL_BASE_URL ?? "https://openapi.airtel.africa",
    timeoutMs: opts.timeoutMs ?? 10_000,
    country: opts.country ?? process.env.AIRTEL_COUNTRY ?? "NG",
    currency: opts.currency ?? process.env.AIRTEL_CURRENCY ?? "NGN",
  };
}

export class AirtelService extends BaseProvider {
  private readonly country: string;
  private readonly currency: string;
  private readonly providerName: string = "airtel";

  constructor(opts: AirtelServiceConfig = {}) {
    const config = buildAirtelConfig(opts);
    super(config);
    this.country = config.country;
    this.currency = config.currency;
  }

  async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.cachedToken!;
    }

    const startTime = Date.now();
    const endpoint = "/auth/oauth2/token";
    try {
      const response = await axios.post<AirtelTokenResponse>(
        `${this.baseUrl}${endpoint}`,
        undefined,
        {
          headers: {
            Authorization: this.buildBasicAuthHeader(this.apiKey, this.apiSecret),
            "Content-Type": "application/json",
          },
          timeout: this.timeoutMs,
        },
      );

      const durationMs = Date.now() - startTime;
      recordTelecomLatency({
        provider: this.providerName,
        endpoint,
        durationMs,
        success: true,
      });

      const { access_token, expires_in } = response.data;
      if (!access_token || typeof access_token !== "string") {
        throw new Error("Airtel token response missing access_token");
      }

      const ttl = typeof expires_in === "number" && !isNaN(expires_in) ? expires_in : 3600;
      this.setCachedToken(access_token, ttl);
      return access_token;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordTelecomLatency({
        provider: this.providerName,
        endpoint,
        durationMs,
        success: false,
      });
      throw error;
    }
  }

  async getTransactionStatus(reference: string): Promise<{ status: AirtelTransactionStatus; raw?: unknown }> {
    const token = await this.getAccessToken();
    const endpoint = `/${this.country.toLowerCase()}/standard/v1/payments/${reference}`;
    const startTime = Date.now();

    try {
      const response = await axios.get<AirtelStatusResponse>(
        `${this.baseUrl}${endpoint}`,
        {
          headers: {
            Authorization: this.buildBearerAuthHeader(token),
            "X-Country": this.country,
            "X-Currency": this.currency,
            "Content-Type": "application/json",
          },
          timeout: this.timeoutMs,
        },
      );

      const durationMs = Date.now() - startTime;
      recordTelecomLatency({
        provider: this.providerName,
        endpoint,
        durationMs,
        success: true,
      });

      const data = response?.data;
      return {
        status: this.parseTransactionStatus(data),
        raw: data,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordTelecomLatency({
        provider: this.providerName,
        endpoint,
        durationMs,
        success: false,
      });

      if (error instanceof AxiosError && error.response?.status === 404) {
        return { status: "pending" };
      }

      throw error;
    }
  }

  private parseTransactionStatus(response?: AirtelStatusResponse): AirtelTransactionStatus {
    if (!response) {
      return "unknown";
    }

    const rawStatus =
      response.data?.transaction?.status ??
      response.data?.status ??
      response.status?.code ??
      (typeof response.status === "string" ? response.status : undefined) ??
      response.transaction_status;

    if (!rawStatus || typeof rawStatus !== "string") {
      if (response.status?.success === true) {
        return "completed";
      }
      if (response.status?.success === false) {
        return "failed";
      }
      return "unknown";
    }

    const lower = rawStatus.toLowerCase().trim();

    if (
      lower === "completed" ||
      lower === "success" ||
      lower === "successful" ||
      lower === "ts" ||
      lower === "tip" ||
      lower === "paid"
    ) {
      return "completed";
    }

    if (
      lower === "failed" ||
      lower === "failure" ||
      lower === "declined" ||
      lower === "rejected" ||
      lower === "cancelled"
    ) {
      return "failed";
    }

    if (
      lower === "pending" ||
      lower === "processing" ||
      lower === "initiated" ||
      lower === "in_progress"
    ) {
      return "pending";
    }

    return "unknown";
  }
}
