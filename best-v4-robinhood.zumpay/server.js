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
const ROBINHOOD_CHAIN_ID = 4663;
const ROBINHOOD_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const ROBINHOOD_STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b";
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
    pool_id: "0xa5f23cae4e5c3388c5a8a6b08a83f53e56df8f1a63757e606b362994b68a2361",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "USDe",
      name: "USDe",
      address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
      decimals: 18
    },
    token1: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    fee_tier_bps: 1,
    tick_spacing: 1,
    liquidity_raw: "250285423749273031723",
    liquidity_usd: 250000,
    volume_1h_usd: 18400,
    volume_24h_usd: 306000,
    tx_count_24h: 2210,
    active: true,
    health: "STRONG",
    bot_hint: "STABLE_CORE_FAST_ENTRY"
  },
  {
    pool_id: "0xfcfae8fa0bd6da961bcf5d990f27690932deac4f093e99bf3e871691c6586593",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      decimals: 18
    },
    token1: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    fee_tier_bps: 5,
    tick_spacing: 10,
    liquidity_raw: "11481091544566761",
    liquidity_usd: 425000,
    volume_1h_usd: 28800,
    volume_24h_usd: 392000,
    tx_count_24h: 2310,
    active: true,
    health: "STRONG",
    bot_hint: "DEEPEST_ROUTE"
  },
  {
    pool_id: "0x77c25b9386d47de62e0155c393696e9f43f7e6d036c6ca52f66735ccbb8808a7",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      decimals: 18
    },
    token1: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    fee_tier_bps: 30,
    tick_spacing: 60,
    liquidity_raw: "5106804663311967",
    liquidity_usd: 185000,
    volume_1h_usd: 15800,
    volume_24h_usd: 242000,
    tx_count_24h: 1380,
    active: true,
    health: "STRONG",
    bot_hint: "WETH_MEDIUM_FEE_ACTIVE"
  },
  {
    pool_id: "0xc748f4671a867db48b552f6b7650bf3255e05f80f00e3f7aad1b17ccb7898fdb",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    token1: {
      symbol: "AAPL",
      name: "AAPL",
      address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
      decimals: 18
    },
    fee_tier_bps: 30,
    tick_spacing: 60,
    liquidity_raw: "3203172856107032050",
    liquidity_usd: 156000,
    volume_1h_usd: 9800,
    volume_24h_usd: 167500,
    tx_count_24h: 610,
    active: true,
    health: "GOOD",
    bot_hint: "TOKENIZED_EQUITY_ACTIVE"
  },
  {
    pool_id: "0x8567e70dbf639a618ba5eaf9402743452b93ca45c9bf8b97462407f07d7b7448",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "SPCX",
      name: "SPCX",
      address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
      decimals: 18
    },
    token1: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    fee_tier_bps: 30,
    tick_spacing: 60,
    liquidity_raw: "31370883197515231",
    liquidity_usd: 126000,
    volume_1h_usd: 8400,
    volume_24h_usd: 151000,
    tx_count_24h: 790,
    active: true,
    health: "GOOD",
    bot_hint: "SPCX_USDG_ACTIVE"
  },
  {
    pool_id: "0x3bb34a44f1b2b5f32c034c38a53065a521a47b199700fa9bd19d60985ff24bf1",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    token1: {
      symbol: "NVDA",
      name: "NVDA",
      address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      decimals: 18
    },
    fee_tier_bps: 30,
    tick_spacing: 60,
    liquidity_raw: "587185932210930904",
    liquidity_usd: 112000,
    volume_1h_usd: 6900,
    volume_24h_usd: 138000,
    tx_count_24h: 720,
    active: true,
    health: "GOOD",
    bot_hint: "TOKENIZED_EQUITY_ACTIVE"
  },
  {
    pool_id: "0xd313d79d9d6a714e7bdf02fc42a2c27ede7e51928ffd605126fe9e1192630cf8",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "ETH",
      name: "Native ETH",
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18
    },
    token1: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    fee_tier_bps: 30,
    tick_spacing: 60,
    liquidity_raw: "20834518276603772",
    liquidity_usd: 108000,
    volume_1h_usd: 7200,
    volume_24h_usd: 132000,
    tx_count_24h: 680,
    active: true,
    health: "GOOD",
    bot_hint: "NATIVE_ETH_USDG_ACTIVE"
  },
  {
    pool_id: "0xcb6ffbcc84359535c2cc0a5688c0a76520ea6e0a4820fddd3ac8d7880e576370",
    version: "v4",
    pool_type: "concentrated_liquidity",
    chain_id: ROBINHOOD_CHAIN_ID,
    pool_manager: ROBINHOOD_POOL_MANAGER,
    state_view: ROBINHOOD_STATE_VIEW,
    token0: {
      symbol: "SPCX",
      name: "SPCX",
      address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
      decimals: 18
    },
    token1: {
      symbol: "USDG",
      name: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    fee_tier_bps: 100,
    tick_spacing: 200,
    liquidity_raw: "1051914887345998245",
    liquidity_usd: 64000,
    volume_1h_usd: 2100,
    volume_24h_usd: 48100,
    tx_count_24h: 190,
    active: true,
    health: "WATCH",
    bot_hint: "HIGH_FEE_SECONDARY_ROUTE"
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
