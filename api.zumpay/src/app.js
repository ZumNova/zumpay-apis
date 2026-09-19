const express = require("express");
const cors = require("cors");

const { openApiSpec } = require("./config/openapi");
const { env } = require("./config/env");
const arcRoutes = require("./routes/arc");

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestTelemetry("zumpay-arc-api"));

app.get("/", (_req, res) => {
  res.json({
    name: "Zumpay Arc API",
    status: "ok",
    openapi: "/openapi.json",
    docs: "/docs"
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    name: "Zumpay Arc API Docs",
    description:
      "Paid Arc liquidity API for AI agents. API paga de liquidez en Arc para agentes de IA.",
    openapi: `${openApiSpec.servers[0].url}/openapi.json`,
    discovery: `${openApiSpec.servers[0].url}/v1/arc/tokens`,
    paid_endpoint: `${openApiSpec.servers[0].url}/v1/arc/pool-liquidity?tokenA=USDC&tokenB=WETH`,
    payment: {
      protocol: "x402",
      price: "$0.01 USDC",
      seller: env.paymentWalletAddress
    },
    examples: [
      "GET /v1/arc/tokens",
      "GET /v1/arc/pool-liquidity?tokenA=USDC&tokenB=WETH",
      "GET /v1/arc/pool-liquidity?tokenA=USDC&tokenB=WBTC&fee=3000&tickSpacing=60"
    ]
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

app.use(humanFriendlyArcAliases);
app.use("/v1/arc", arcRoutes);
app.use("/v1/arco", arcRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Route ${req.method} ${req.path} was not found.`
  });
});

function humanFriendlyArcAliases(req, _res, next) {
  if (req.method !== "GET") return next();

  const normalizedPath = normalizePath(req.path);
  const isPoolLiquidityAlias =
    normalizedPath === "/v1/arco/liquidez del pool" ||
    normalizedPath === "/v1/arco/liquidez-del-pool" ||
    normalizedPath === "/v1/arco/liquidez-pool" ||
    normalizedPath === "/v1/arco/liquidez" ||
    normalizedPath === "/v1/arc/liquidez del pool" ||
    normalizedPath === "/v1/arc/liquidez-del-pool" ||
    normalizedPath === "/v1/arc/liquidity" ||
    normalizedPath === "/v1/arc/pool liquidity";

  if (isPoolLiquidityAlias) {
    req.url = `/v1/arc/pool-liquidity${getQueryString(req.originalUrl)}`;
  }

  return next();
}

function requestTelemetry(serviceName) {
  return (req, res, next) => {
    const startedAt = Date.now();
    const hasXPayment = Boolean(req.headers["x-payment"]);
    const hasAuthorization = Boolean(req.headers.authorization);

    console.log(
      JSON.stringify({
        event: "agent_api_request_start",
        service: serviceName,
        method: req.method,
        path: req.path,
        has_x_payment: hasXPayment,
        has_authorization: hasAuthorization,
        user_agent: req.headers["user-agent"] || "unknown",
        timestamp: new Date().toISOString()
      })
    );

    res.on("finish", () => {
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

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    error: err.code || "internal_error",
    message: err.message || "Unexpected API error."
  });
});

module.exports = app;
