import convict from "convict";
import * as path from "path";
import * as fs from "fs";

/**
 * Centralized application configuration using Convict.
 * This system consolidates all hardcoded limits, provider configs, and app settings
 * into a single source of truth with environment-based overrides.
 * 
 * Added support for Orange Money Cameroon API endpoints configuration.
 */

// Define the configuration schema
export const configSchema = convict({
  // Environment
  env: {
    doc: "The application environment",
    format: ["production", "staging", "development", "test"],
    default: "development",
    env: "NODE_ENV",
  },
  isSandbox: {
    doc: "Whether the application is running in sandbox mode",
    format: Boolean,
    default: false,
    env: "IS_SANDBOX",
  },
  maintenance: {
    enabled: {
      doc: "Whether the application is in maintenance mode (read-only)",
      format: Boolean,
      default: false,
      env: "APP_MAINTENANCE_MODE",
    },
  },

  // Database
  database: {
    url: {
      doc: "PostgreSQL connection URL",
      format: String,
      default: "postgresql://localhost/mobile_money",
      env: "DATABASE_URL",
    },
    sandboxUrl: {
      doc: "PostgreSQL connection URL for sandbox environment",
      format: String,
      default: "postgresql://localhost/mobile_money_sandbox",
      env: "SANDBOX_DATABASE_URL",
    },
  },

  // Redis
  redis: {
    url: {
      doc: "Redis connection URL",
      format: String,
      default: "redis://localhost:6379",
      env: "REDIS_URL",
    },
  },

  // Mobile Money Provider Limits
  providers: {
    mtn: {
      minAmount: {
        doc: "Minimum transaction amount for MTN (XAF)",
        format: "nat",
        default: 100,
        env: "MTN_MIN_AMOUNT",
      },
      maxAmount: {
        doc: "Maximum transaction amount for MTN (XAF)",
        format: "nat",
        default: 500000,
        env: "MTN_MAX_AMOUNT",
      },
      callbackSecret: {
        doc: "MTN callback HMAC secret for verifying incoming callbacks",
        format: String,
        default: "",
        env: "MTN_CALLBACK_SECRET",
      },
      callbackSignatureHeader: {
        doc: "Header used by MTN for callback signature verification",
        format: String,
        default: "X-Callback-Signature",
        env: "MTN_CALLBACK_SIGNATURE_HEADER",
      },
    },
    orangeCameroon: {
      minAmount: {
        doc: "Minimum transaction amount for Orange Cameroon (XAF)",
        format: "nat",
        default: 100,
        env: "ORANGE_CAMEROON_MIN_AMOUNT",
      },
      maxAmount: {
        doc: "Maximum transaction amount for Orange Cameroon (XAF)",
        format: "nat",
        default: 500000,
        env: "ORANGE_CAMEROON_MAX_AMOUNT",
      },
      baseUrl: {
        doc: "Base URL for Orange Cameroon API",
        format: String,
        default: "https://api.orange.com",
        env: "ORANGE_CAMEROON_BASE_URL",
      },
      apiKey: {
        doc: "API Key for Orange Cameroon",
        format: String,
        default: "",
        env: "ORANGE_CAMEROON_API_KEY",
      },
      apiSecret: {
        doc: "API Secret for Orange Cameroon",
        format: String,
        default: "",
        env: "ORANGE_CAMEROON_API_SECRET",
      },
    }
  }
});
