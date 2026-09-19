const express = require("express");
const { ethers } = require("ethers");
const openapi = require("./openapi.json");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const WALLET_ADDRESS =
  process.env.WALLET_ADDRESS || "0xF3aAD2304F711ad5f400Ad322442D67DeD3E8A25";
const PRICE = "0.001";
const PRICE_FIXED = "0.001000";
const PRICE_USDC_ATOMIC = "1000";
const CURRENCY = "USDC";
const NETWORKS = ["arc", "base"];
const ARC_USDC_ADDRESS =
  process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
const BASE_USDC_ADDRESS =
  process.env.BASE_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SERVICE_URL = process.env.SERVICE_URL || "https://best-v4-robinhood.zumpay.com.ar";

let gatewayMiddlewarePromise;

app.use(express.json());
app.use(requestTelemetry("zumpay-best-v4-robinhood-api"));
app.use(humanFriendlyAliases);

const bestV4Paths = [
  "/v1/robinhood/v4/best-pools",
  "/v1/robinhood/best-v4-pools",
  "/v1/rh/v4/best-pools",
  "/v1/robinhood/pools/v4",
  "/v1/robinhood/v4/pools",
  "/v1/robinhood/mejores-pools-v4"
];

const BEST_V4_POOLS = [
  {
    pool_address: "0x1111111111111111111111111111111111111001",
    version: "v4",
    pool_type: "concentrated_liquidity",
    token0: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6
    },
    token1: {
      symbol: "WKR",
      name: "Wiker Token",
      address: "0x434d86063e8dd545f0ae4db7dd69ce8a47a044a0",
      decimals: 18
    },
    fee_tier_bps: 30,
    liquidity_usd: 182500,
    volume_1h_usd: 12400,
    volume_24h_usd: 218000,
    tx_count_24h: 1840,
    active: true,
    health: "STRONG",
    bot_hint: "HIGH_LIQUIDITY_FAST_ENTRY"
  },
  {
    pool_address: "0x1111111111111111111111111111111111111002",
    version: "v4",
    pool_type: "concentrated_liquidity",
    token0: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6
    },
    token1: {
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB",
      decimals: 18
    },
    fee_tier_bps: 5,
    liquidity_usd: 425000,
    volume_1h_usd: 28800,
    volume_24h_usd: 392000,
    tx_count_24h: 2310,
    active: true,
    health: "STRONG",
    bot_hint: "DEEPEST_ROUTE"
  },
  {
    pool_address: "0x1111111111111111111111111111111111111003",
    version: "v4",
    pool_type: "concentrated_liquidity",
    token0: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6
    },
    token1: {
      symbol: "EURC",
      name: "EURC",
      address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
      decimals: 6
    },
    fee_tier_bps: 5,
    liquidity_usd: 94000,
    volume_1h_usd: 7600,
    volume_24h_usd: 121000,
    tx_count_24h: 920,
    active: true,
    health: "GOOD",
    bot_hint: "STABLE_PAIR_LOW_SPREAD"
  },
  {
    pool_address: "0x1111111111111111111111111111111111111004",
    version: "v4",
    pool_type: "concentrated_liquidity",
    token0: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6
    },
    token1: {
      symbol: "WBTC",
      name: "Circle Wrapped Bitcoin",
      address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
      decimals: 8
    },
    fee_tier_bps: 30,
    liquidity_usd: 156000,
    volume_1h_usd: 9800,
    volume_24h_usd: 167500,
    tx_count_24h: 610,
    active: true,
    health: "GOOD",
    bot_hint: "BTC_EXPOSURE_ACTIVE"
  },
  {
    pool_address: "0x1111111111111111111111111111111111111005",
    version: "v4",
    pool_type: "concentrated_liquidity",
    token0: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6
    },
    token1: {
      symbol: "AUDD",
      name: "Forte AUD",
      address: "0xd2a530170D71a9Cfe1651Fb468E2B98F7Ed7456b",
      decimals: 6
    },
    fee_tier_bps: 5,
    liquidity_usd: 61000,
    volume_1h_usd: 2400,
    volume_24h_usd: 43200,
    tx_count_24h: 310,
    active: true,
    health: "GOOD",
    bot_hint: "FX_STABLE_ROUTE"
  }
];

function humanFriendlyAliases(req, _res, next) {
  if (req.method !== "GET") return next();

  const normalizedPath = normalizePath(req.path);
  if (
    normalizedPath === "/v1/robinhood/mejores pools v4" ||
    normalizedPath === "/v1/robinhood/best v4 pools" ||
    normalizedPath === "/v1/rh/best v4"
  ) {
    req.url = `/v1/robinhood/v4/best-pools${getQueryString(req.originalUrl)}`;
  }

  return next();
}

function normalizePath(path) {
  try {
    return decodeURIComponent(path)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  } catch (_err) {
    return path.toLowerCase();
  }
}

function getQueryString(originalUrl) {
  const queryStart = originalUrl.indexOf("?");
  return queryStart === -1 ? "" : originalUrl.slice(queryStart);
}

function requestTelemetry(serviceName) {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      const hasXPayment = Boolean(req.headers["x-payment"]);
      const hasAuthorization = Boolean(req.headers.authorization);
      const statusCode = res.statusCode;
      const paymentState =
        statusCode === 402
          ? "payment_required_402"
          : statusCode >= 200 && statusCode < 300 && (hasXPayment || hasAuthorization)
            ? "paid_or_authorized_success"
            : "other";

      console.log(
        JSON.stringify({
          event: "agent_api_request",
          service: serviceName,
          method: req.method,
          path: req.path,
          status_code: statusCode,
          payment_state: paymentState,
          has_x_payment: hasXPayment,
          has_authorization: hasAuthorization,
          user_agent: req.headers["user-agent"] || "unknown",
          duration_ms: Date.now() - startedAt,
          timestamp: new Date().toISOString()
        })
      );
    });

    next();
  };
}

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    name: "BEST V4 ROBINHOOD",
    openapi: "/openapi.json",
    docs: "/docs",
    endpoints: ["/v1/robinhood/v4/best-pools"]
  });
});

app.get("/docs", (_req, res) => {
  res.status(200).json({
    name: "BEST V4 ROBINHOOD Docs",
    description:
      "Paid lightweight V4 pool intelligence for Robinhood bots and AI agents. Feed liviano de mejores pools V4 activas para entrada rapida.",
    openapi: `${SERVICE_URL}/openapi.json`,
    paid_endpoints: {
      best_v4_pools: `${SERVICE_URL}/v1/robinhood/v4/best-pools?limit=5&min_volume_24h_usd=50000`
    },
    payment: {
      protocols: ["x402", "mpp"],
      price: `$${PRICE} ${CURRENCY}`,
      seller: WALLET_ADDRESS,
      networks: NETWORKS
    },
    query_parameters: {
      limit: "Maximum number of pools to return. Default 5, accepted range 1..20.",
      min_volume_24h_usd: "Minimum 24h volume filter. Default 0.",
      min_liquidity_usd: "Minimum liquidity filter. Default 0.",
      token: "Optional token symbol or address filter. Example: USDC, WETH, 0x..."
    },
    response_fields: {
      total_detected: "Number of pools returned after filters.",
      pools:
        "Short pool objects with address, tokens, fee tier, liquidity, 1h/24h volume, activity state and bot hint."
    }
  });
});

app.get("/openapi.json", (_req, res) => {
  res.status(200).json(openapi);
});

app.get(bestV4Paths, paymentGate, handleBestV4Pools);

async function handleBestV4Pools(req, res, next) {
  try {
    const filters = parsePoolQuery(req.query);
    const pools = BEST_V4_POOLS
      .filter((pool) => pool.active)
      .filter((pool) => pool.volume_24h_usd >= filters.minVolume24hUsd)
      .filter((pool) => pool.liquidity_usd >= filters.minLiquidityUsd)
      .filter((pool) => matchesTokenFilter(pool, filters.token))
      .sort((a, b) => b.volume_24h_usd - a.volume_24h_usd)
      .slice(0, filters.limit);

    return res.status(200).json({
      status: "success",
      network: "Robinhood",
      product: "BEST V4 ROBINHOOD",
      feed: "best_v4_pools",
      query_filters: filters,
      total_detected: pools.length,
      pools,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return next(err);
  }
}

function parsePoolQuery(query) {
  const limit = parseInteger(query.limit, 5, "limit");
  if (limit < 1 || limit > 20) {
    throw badRequest("limit must be between 1 and 20.");
  }

  return {
    limit,
    minVolume24hUsd: parseNumber(query.min_volume_24h_usd, 0, "min_volume_24h_usd"),
    minLiquidityUsd: parseNumber(query.min_liquidity_usd, 0, "min_liquidity_usd"),
    token: query.token ? String(query.token).trim() : null
  };
}

function parseInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw badRequest(`${fieldName} must be an integer.`);
  }

  return parsed;
}

function parseNumber(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw badRequest(`${fieldName} must be a positive number.`);
  }

  return parsed;
}

function matchesTokenFilter(pool, tokenFilter) {
  if (!tokenFilter) return true;

  const normalized = tokenFilter.toLowerCase();
  return [pool.token0, pool.token1].some((token) => {
    return (
      token.symbol.toLowerCase() === normalized ||
      token.address.toLowerCase() === normalized ||
      token.name.toLowerCase() === normalized
    );
  });
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = "bad_request";
  return err;
}

async function paymentGate(req, res, next) {
  if (!req.headers["x-payment"] && !req.headers.authorization) {
    return sendManualPaymentRequired(res);
  }

  if (req.headers.authorization && !req.headers["x-payment"]) {
    return next();
  }

  try {
    const middleware = await getGatewayMiddleware();
    return middleware(req, res, next);
  } catch (_err) {
    if (!req.headers["x-payment"]) {
      return sendManualPaymentRequired(res);
    }

    return next(_err);
  }
}

async function getGatewayMiddleware() {
  if (!gatewayMiddlewarePromise) {
    gatewayMiddlewarePromise = import("@circle-fin/x402-batching/server").then(
      ({ createGatewayMiddleware }) => {
        const gateway = createGatewayMiddleware({
          sellerAddress: WALLET_ADDRESS,
          arcPrivateMainnet: true,
          description:
            "BEST V4 ROBINHOOD pool intelligence for bots discovering active high-volume V4 pools."
        });

        return gateway.require(`$${PRICE}`);
      }
    );
  }

  return gatewayMiddlewarePromise;
}

function sendManualPaymentRequired(res) {
  res.set("X-Payment-Required", `${CURRENCY} amount=${PRICE} address=${WALLET_ADDRESS}`);
  res.set(
    "WWW-Authenticate",
    `Payment realm="BEST V4 ROBINHOOD", currency="${CURRENCY}", amount="${PRICE}"`
  );

  return res.status(402).json({
    error: "payment_required",
    message: "Payment is required to access BEST V4 ROBINHOOD pool intelligence.",
    accepts: [
      {
        scheme: "exact",
        network: "arc",
        maxAmountRequired: PRICE_USDC_ATOMIC,
        asset: ARC_USDC_ADDRESS,
        payTo: WALLET_ADDRESS,
        resource: `${SERVICE_URL}/v1/robinhood/v4/best-pools`,
        description: `BEST V4 ROBINHOOD API call priced at ${PRICE_FIXED} ${CURRENCY}.`,
        mimeType: "application/json",
        maxTimeoutSeconds: 60,
        protocols: ["x402", "mpp"]
      },
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: PRICE_USDC_ATOMIC,
        asset: BASE_USDC_ADDRESS,
        payTo: WALLET_ADDRESS,
        resource: `${SERVICE_URL}/v1/robinhood/v4/best-pools`,
        description: `BEST V4 ROBINHOOD API call priced at ${PRICE_FIXED} ${CURRENCY}.`,
        mimeType: "application/json",
        maxTimeoutSeconds: 60,
        protocols: ["x402", "mpp"]
      }
    ]
  });
}

app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Route ${req.method} ${req.path} was not found.`
  });
});

app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 500).json({
    error: err.code || "internal_error",
    message: err.message || "Unexpected server error."
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BEST V4 ROBINHOOD API listening on port ${PORT}`);
  });
}

module.exports = app;
