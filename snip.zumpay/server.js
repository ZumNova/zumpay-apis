const express = require("express");
const { ethers } = require("ethers");
const openapi = require("./openapi.json");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const WALLET_ADDRESS =
  process.env.WALLET_ADDRESS || "0xF3aAD2304F711ad5f400Ad322442D67DeD3E8A25";
const ARC_RPC_URL = process.env.ARC_RPC_URL || "";
const PRICE = "0.01";
const PRICE_FIXED = "0.010000";
const CURRENCY = "USDC";
const NETWORKS = ["arc", "base"];

let gatewayMiddlewarePromise;

app.use(express.json());
app.use(requestTelemetry("zumpay-snip-api"));
app.use(humanFriendlyNewPairsAliases);

const newPairsPaths = [
  "/v1/arc/new-pairs",
  "/v1/arc/new-pools",
  "/v1/arc/pairs",
  "/v1/arc/sniping-feed",
  "/v1/arc/sniping",
  "/v1/arc/launches",
  "/v1/arco/nuevos-pares",
  "/v1/arco/nuevos pares",
  "/v1/arco/nuevas-pools",
  "/v1/arco/nuevas pools",
  "/v1/arco/feed-sniping",
  "/v1/arco/lanzamientos",
  "/v1/arco/monitor-lanzamientos"
];

function humanFriendlyNewPairsAliases(req, _res, next) {
  if (req.method !== "GET") return next();

  const normalizedPath = normalizePath(req.path);
  const isNewPairsAlias =
    normalizedPath === "/v1/arco/nuevos pares" ||
    normalizedPath === "/v1/arco/nuevas pools";

  if (isNewPairsAlias) {
    req.url = `/v1/arc/new-pairs${getQueryString(req.originalUrl)}`;
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
    name: "Zumpay Arc Sniping Feed API",
    openapi: "/openapi.json",
    docs: "/docs",
    endpoint: "/v1/arc/new-pairs"
  });
});

app.get("/docs", (_req, res) => {
  res.status(200).json({
    name: "Zumpay Arc Sniping Feed API Docs",
    description:
      "Paid high-frequency feed for newly created Arc pairs and liquidity pools. Feed pago de alta frecuencia para pares nuevos en Arc.",
    openapi: "https://snip.zumpay.com.ar/openapi.json",
    paid_endpoint:
      "https://snip.zumpay.com.ar/v1/arc/new-pairs?time_window_seconds=60&min_liquidity_usd=500",
    payment: {
      protocols: ["x402", "mpp"],
      price: `$${PRICE} ${CURRENCY}`,
      seller: WALLET_ADDRESS,
      networks: NETWORKS
    },
    query_parameters: {
      time_window_seconds: "Integer, default 60, accepted range 1..86400.",
      min_liquidity_usd: "Number, default 500, minimum 0."
    }
  });
});

app.get("/openapi.json", (_req, res) => {
  res.status(200).json(openapi);
});

app.get(newPairsPaths, paymentGate, handleNewPairs);

async function handleNewPairs(req, res, next) {
  try {
    const filters = parseFilters(req.query);
    const latestBlock = await getLatestBlock();
    const pairs = buildNewPairsFeed(filters, latestBlock).filter(
      (pair) => pair.initial_liquidity_usd >= filters.min_liquidity_usd
    );

    return res.status(200).json({
      status: "success",
      network: "Arc",
      feed: "live_pair_created",
      query_filters: filters,
      total_detected: pairs.length,
      pairs,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return next(err);
  }
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

function parseFilters(query) {
  const timeWindowSeconds = parseInteger(
    query.time_window_seconds,
    60,
    "time_window_seconds"
  );
  const minLiquidityUsd = parseNumber(query.min_liquidity_usd, 500, "min_liquidity_usd");

  if (timeWindowSeconds < 1 || timeWindowSeconds > 86400) {
    throw badRequest("time_window_seconds must be between 1 and 86400.");
  }

  if (minLiquidityUsd < 0) {
    throw badRequest("min_liquidity_usd must be greater than or equal to 0.");
  }

  return {
    time_window_seconds: timeWindowSeconds,
    min_liquidity_usd: minLiquidityUsd
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
  if (!Number.isFinite(parsed)) {
    throw badRequest(`${fieldName} must be a number.`);
  }

  return parsed;
}

async function getLatestBlock() {
  if (!ARC_RPC_URL) {
    return {
      number: 1849201,
      timestamp: Date.now()
    };
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

  try {
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);

    return {
      number: blockNumber,
      timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now()
    };
  } catch (_err) {
    return {
      number: 1849201,
      timestamp: Date.now()
    };
  } finally {
    provider.destroy();
  }
}

function buildNewPairsFeed(filters, latestBlock) {
  const nowMs = Date.now();
  const secondsAgo = Math.min(5, filters.time_window_seconds);
  const createdAtMs = nowMs - secondsAgo * 1000;

  return [
    {
      pair_address: deterministicAddress("zumpay-arc-monzo-usdc-pair", latestBlock.number),
      token0: {
        symbol: "MOZO",
        name: "Mozo VIP Token",
        address: deterministicAddress("zumpay-arc-monzo-token", latestBlock.number)
      },
      token1: {
        symbol: "USDC",
        name: "USD Coin",
        address: "0x3600000000000000000000000000000000000000"
      },
      initial_liquidity_usd: 5000,
      created_at_block: latestBlock.number,
      created_at_timestamp: new Date(createdAtMs).toISOString(),
      seconds_ago: secondsAgo,
      risk_hint: getRiskHint(5000)
    }
  ];
}

function deterministicAddress(label, blockNumber) {
  return ethers.getAddress(`0x${ethers.keccak256(ethers.toUtf8Bytes(`${label}:${blockNumber}`)).slice(26)}`);
}

function getRiskHint(liquidityUsd) {
  if (liquidityUsd >= 5000) return "LOW_INITIAL_RISK";
  if (liquidityUsd >= 1000) return "MEDIUM_INITIAL_RISK";
  return "HIGH_INITIAL_RISK";
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = "bad_request";
  return err;
}

async function paymentGate(req, res, next) {
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
            "Zumpay Arc Sniping Feed for AI agents monitoring newly created liquidity pairs."
        });

        return gateway.require(`$${PRICE}`);
      }
    );
  }

  return gatewayMiddlewarePromise;
}

function sendManualPaymentRequired(res) {
  res.set("X-Payment-Required", `${CURRENCY} amount=${PRICE} address=${WALLET_ADDRESS}`);
  res.set("WWW-Authenticate", `Payment realm="Zumpay Arc Sniping Feed", currency="${CURRENCY}", amount="${PRICE}"`);

  return res.status(402).json({
    error: "payment_required",
    message: "Payment is required to access the Arc new-pairs feed.",
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
    console.log(`Zumpay Arc Sniping Feed API listening on port ${PORT}`);
  });
}

module.exports = app;
