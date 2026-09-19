const express = require("express");
const { ethers } = require("ethers");
const openapi = require("./openapi.json");
const { ensureSnapshotFresh, getSnapshot } = require("./collector");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const WALLET_ADDRESS =
  process.env.WALLET_ADDRESS || "0xF3aAD2304F711ad5f400Ad322442D67DeD3E8A25";
const PRICE = "0.001";
const PRICE_FIXED = "0.001000";
const CURRENCY = "USDC";
const NETWORKS = ["arc", "base"];
const BACKGROUND_REFRESH_ENABLED = process.env.COLLECTOR_BACKGROUND_REFRESH !== "false";

let gatewayMiddlewarePromise;

app.use(express.json());
app.use(requestTelemetry("zumpay-argus-pulse-api"));
app.use(humanFriendlyPulseAliases);

const freshLaunchesPaths = [
  "/v1/pulse/fresh-launches",
  "/v1/pulse/new-listings",
  "/v1/pulse/new-launches",
  "/v1/argus/fresh-launches",
  "/v1/argus/new-listings",
  "/v1/argus/new-launches",
  "/v1/argus/listings",
  "/v1/argus/lanzamientos",
  "/v1/argus/nuevos-lanzamientos",
  "/v1/pulso/lanzamientos",
  "/v1/pulso/nuevos lanzamientos"
];

const momentumPaths = [
  "/v1/pulse/momentum",
  "/v1/argus/momentum",
  "/v1/pulse/trending",
  "/v1/argus/trending",
  "/v1/pulso/momentum",
  "/v1/pulso/tendencia"
];

const whaleRadarPaths = [
  "/v1/pulse/whale-radar",
  "/v1/argus/whale-radar",
  "/v1/pulse/whales",
  "/v1/argus/whales",
  "/v1/pulso/ballenas",
  "/v1/argus/ballenas"
];

function humanFriendlyPulseAliases(req, _res, next) {
  if (req.method !== "GET") return next();

  const normalizedPath = normalizePath(req.path);
  const isFreshLaunchesAlias =
    normalizedPath === "/v1/pulso/nuevos lanzamientos" ||
    normalizedPath === "/v1/argus/nuevos lanzamientos";

  if (isFreshLaunchesAlias) {
    req.url = `/v1/pulse/fresh-launches${getQueryString(req.originalUrl)}`;
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
    name: "Argus Pulse API",
    openapi: "/openapi.json",
    docs: "/docs",
    endpoints: [
      "/v1/pulse/fresh-launches",
      "/v1/pulse/momentum",
      "/v1/pulse/whale-radar"
    ]
  });
});

app.get("/docs", (_req, res) => {
  res.status(200).json({
    name: "Argus Pulse API Docs",
    description:
      "Paid real-time launch intelligence for Argus tokens. Inteligencia paga en tiempo real para tokens lanzados en Argus.",
    openapi: "https://argus-pulse.zumpay.com.ar/openapi.json",
    paid_endpoints: {
      fresh_launches:
        "https://argus-pulse.zumpay.com.ar/v1/pulse/fresh-launches?timeframe=60m&limit=10",
      momentum: "https://argus-pulse.zumpay.com.ar/v1/pulse/momentum?limit=10",
      whale_radar: "https://argus-pulse.zumpay.com.ar/v1/pulse/whale-radar?limit=10"
    },
    payment: {
      protocols: ["x402", "mpp"],
      price: `$${PRICE} ${CURRENCY}`,
      seller: WALLET_ADDRESS,
      networks: NETWORKS
    },
    query_parameters: {
      timeframe:
        "Lookback window. Supported values include 5m, 15m, 60m, 1h, 6h, 24h. Default 60m.",
      limit: "Maximum number of launches to return. Default 10, accepted range 1..50."
    },
    response_fields: {
      timestamp: "Unix timestamp in seconds.",
      count: "Number of launches returned after filters.",
      data: "Fresh launch objects with symbol, name, contract, pair asset, market cap, price, creation time and buy/sell taxes."
    }
  });
});

app.get("/openapi.json", (_req, res) => {
  res.status(200).json(openapi);
});

app.get(freshLaunchesPaths, paymentGate, handleFreshLaunches);
app.get(momentumPaths, paymentGate, handleMomentum);
app.get(whaleRadarPaths, paymentGate, handleWhaleRadar);

async function handleFreshLaunches(req, res, next) {
  try {
    const filters = parseFreshLaunchesQuery(req.query);
    const snapshot = readFastSnapshot();
    const launches = snapshot.freshLaunches
      .filter((launch) => isWithinTimeframe(launch.createdAt, filters.timeframeSeconds))
      .slice(0, filters.limit);

    return res.status(200).json({
      timestamp: Math.floor(Date.now() / 1000),
      count: launches.length,
      data: launches,
      meta: snapshot.meta
    });
  } catch (err) {
    return next(err);
  }
}

async function handleMomentum(req, res, next) {
  try {
    const limit = parseInteger(req.query.limit, 10, "limit");
    if (limit < 1 || limit > 50) {
      throw badRequest("limit must be between 1 and 50.");
    }

    const snapshot = readFastSnapshot();
    const data = snapshot.momentum.slice(0, limit);

    return res.status(200).json({
      timestamp: Math.floor(Date.now() / 1000),
      count: data.length,
      data,
      meta: snapshot.meta
    });
  } catch (err) {
    return next(err);
  }
}

async function handleWhaleRadar(req, res, next) {
  try {
    const limit = parseInteger(req.query.limit, 10, "limit");
    if (limit < 1 || limit > 50) {
      throw badRequest("limit must be between 1 and 50.");
    }

    const snapshot = readFastSnapshot();
    const data = snapshot.whaleRadar.slice(0, limit);

    return res.status(200).json({
      timestamp: Math.floor(Date.now() / 1000),
      count: data.length,
      data,
      meta: snapshot.meta
    });
  } catch (err) {
    return next(err);
  }
}

function readFastSnapshot() {
  const snapshot = getSnapshot();

  if (BACKGROUND_REFRESH_ENABLED) {
    ensureSnapshotFresh().catch((err) => {
      console.error(
        JSON.stringify({
          event: "argus_pulse_background_refresh_failed",
          message: err.message || "Unknown refresh error",
          timestamp: new Date().toISOString()
        })
      );
    });
  }

  return snapshot;
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

function parseFreshLaunchesQuery(query) {
  const timeframe = String(query.timeframe || "60m").trim().toLowerCase();
  const timeframeSeconds = parseTimeframeSeconds(timeframe);
  const limit = parseInteger(query.limit, 10, "limit");

  if (limit < 1 || limit > 50) {
    throw badRequest("limit must be between 1 and 50.");
  }

  return {
    timeframe,
    timeframeSeconds,
    limit
  };
}

function parseTimeframeSeconds(timeframe) {
  const match = timeframe.match(/^(\d+)(m|h|d)$/);

  if (!match) {
    throw badRequest("timeframe must use m, h or d units. Examples: 15m, 60m, 1h, 24h.");
  }

  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  const seconds = value * multiplier;

  if (!Number.isInteger(value) || value < 1 || seconds > 86400) {
    throw badRequest("timeframe must be between 1 minute and 24 hours.");
  }

  return seconds;
}

function parseInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw badRequest(`${fieldName} must be an integer.`);
  }

  return parsed;
}

async function getFreshLaunches(filters) {
  if (ARGUS_API_URL) {
    const upstreamLaunches = await fetchArgusLaunches(filters);
    if (upstreamLaunches.length > 0) return upstreamLaunches;
  }

  return buildDeterministicLaunches(filters);
}

async function fetchArgusLaunches(filters) {
  const url = new URL(ARGUS_API_URL);
  url.searchParams.set("timeframe", filters.timeframe);
  url.searchParams.set("limit", String(filters.limit));

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "zumpay-argus-pulse-api/0.1.0"
    }
  });

  if (!response.ok) {
    throw badGateway(`Argus upstream returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const rawLaunches = Array.isArray(payload) ? payload : payload.data || payload.launches || [];

  return rawLaunches
    .map(normalizeArgusLaunch)
    .filter(Boolean)
    .filter((launch) => isWithinTimeframe(launch.createdAt, filters.timeframeSeconds))
    .slice(0, filters.limit);
}

function normalizeArgusLaunch(raw) {
  const contractAddress = raw.contractAddress || raw.contract_address || raw.address;

  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    return null;
  }

  return {
    tokenSymbol: normalizeSymbol(raw.tokenSymbol || raw.symbol || "UNKNOWN"),
    tokenName: String(raw.tokenName || raw.name || "Unknown Token"),
    contractAddress: ethers.getAddress(contractAddress),
    pairedWith: String(raw.pairedWith || raw.paired_with || "USDC").toUpperCase(),
    initialMarketCapUsd: toNumber(raw.initialMarketCapUsd || raw.initial_market_cap_usd || 0),
    priceUsd: toNumber(raw.priceUsd || raw.price_usd || 0),
    createdAt: new Date(raw.createdAt || raw.created_at || Date.now()).toISOString(),
    buyTaxPercent: toNumber(raw.buyTaxPercent || raw.buy_tax_percent || 0),
    sellTaxPercent: toNumber(raw.sellTaxPercent || raw.sell_tax_percent || 0)
  };
}

function buildDeterministicLaunches(filters) {
  const nowMs = Date.now();
  const fixtures = [
    {
      seed: "proxima",
      symbol: "$PROXIMA",
      name: "Proxima",
      pairedWith: "USDC",
      initialMarketCapUsd: 2680,
      priceUsd: 0.000002681,
      ageSeconds: Math.min(420, filters.timeframeSeconds)
    },
    {
      seed: "orion-ai",
      symbol: "$ORION",
      name: "Orion AI",
      pairedWith: "USDC",
      initialMarketCapUsd: 7420,
      priceUsd: 0.00000742,
      ageSeconds: Math.min(1200, filters.timeframeSeconds)
    },
    {
      seed: "luma",
      symbol: "$LUMA",
      name: "Luma",
      pairedWith: "WETH",
      initialMarketCapUsd: 18450,
      priceUsd: 0.00001845,
      ageSeconds: Math.min(3300, filters.timeframeSeconds)
    }
  ];

  return fixtures
    .map((token) => ({
      tokenSymbol: token.symbol,
      tokenName: token.name,
      contractAddress: deterministicAddress(`argus-pulse:${token.seed}:${Math.floor(nowMs / 60000)}`),
      pairedWith: token.pairedWith,
      initialMarketCapUsd: token.initialMarketCapUsd,
      priceUsd: token.priceUsd,
      createdAt: new Date(nowMs - token.ageSeconds * 1000).toISOString(),
      buyTaxPercent: getTaxPercent(token.initialMarketCapUsd),
      sellTaxPercent: getTaxPercent(token.initialMarketCapUsd)
    }))
    .filter((launch) => isWithinTimeframe(launch.createdAt, filters.timeframeSeconds))
    .slice(0, filters.limit);
}

function deterministicAddress(label) {
  return ethers.getAddress(`0x${ethers.keccak256(ethers.toUtf8Bytes(label)).slice(26)}`);
}

function isWithinTimeframe(createdAt, timeframeSeconds) {
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return false;

  return Date.now() - createdAtMs <= timeframeSeconds * 1000;
}

function normalizeSymbol(symbol) {
  const text = String(symbol).trim().toUpperCase();
  return text.startsWith("$") ? text : `$${text}`;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTaxPercent(initialMarketCapUsd) {
  if (initialMarketCapUsd < 3000) return 10;
  if (initialMarketCapUsd < 10000) return 5;
  return 0;
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = "bad_request";
  return err;
}

function badGateway(message) {
  const err = new Error(message);
  err.statusCode = 502;
  err.code = "bad_gateway";
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
            "Argus Pulse fresh-launch intelligence feed for AI agents discovering new token listings."
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
    `Payment realm="Argus Pulse API", currency="${CURRENCY}", amount="${PRICE}"`
  );

  return res.status(402).json({
    error: "payment_required",
    message: "Payment is required to access the Argus Pulse fresh-launches feed.",
    accepts: [
      {
        scheme: "exact",
        network: "arc",
        currency: CURRENCY,
        amount: PRICE_FIXED,
        payTo: WALLET_ADDRESS,
        protocols: ["x402", "mpp"]
      },
      {
        scheme: "exact",
        network: "base",
        currency: CURRENCY,
        amount: PRICE_FIXED,
        payTo: WALLET_ADDRESS,
        protocols: ["x402", "mpp"]
      }
    ]
  });
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Argus Pulse API listening on port ${PORT}`);
  });
}

module.exports = app;
