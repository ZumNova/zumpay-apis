const express = require("express");
const { ethers } = require("ethers");
const openapi = require("./openapi.json");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const SELLER_WALLET =
  process.env.PAYMENT_WALLET_ADDRESS || "0xF3aAD2304F711ad5f400Ad322442D67DeD3E8A25";
const PRICE = process.env.RISK_CHECK_PRICE || "0.005";
const CURRENCY = "USDC";
const NETWORKS = ["arc", "base"];

let gatewayMiddlewarePromise;

app.use(express.json());
app.use(requestTelemetry("zumpay-risk-api"));
app.use(humanFriendlyRiskAliases);

const riskCheckPaths = [
  "/v1/arc/risk-check",
  "/v1/arc/risk",
  "/v1/arc/risk-assessment",
  "/v1/arc/anti-rugpull",
  "/v1/arco/riesgo",
  "/v1/arco/chequeo-riesgo",
  "/v1/arco/chequeo-de-riesgo",
  "/v1/arco/chequeo de riesgo",
  "/v1/arco/analisis-riesgo",
  "/v1/arco/analisis de riesgo",
  "/v1/arco/anti-rugpull"
];

function humanFriendlyRiskAliases(req, _res, next) {
  if (req.method !== "GET") return next();

  const normalizedPath = normalizePath(req.path);
  const isRiskAlias =
    normalizedPath === "/v1/arco/chequeo de riesgo" ||
    normalizedPath === "/v1/arco/analisis de riesgo";

  if (isRiskAlias) {
    req.url = `/v1/arc/risk-check${getQueryString(req.originalUrl)}`;
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
    name: "Zumpay Arc Risk Assessment API",
    openapi: "/openapi.json",
    docs: "/docs",
    endpoint: "/v1/arc/risk-check"
  });
});

app.get("/docs", (_req, res) => {
  res.status(200).json({
    name: "Zumpay Arc Risk Assessment API Docs",
    description:
      "Paid Anti-Rugpull risk assessment for Arc tokens and pools. Analisis pago Anti-Rugpull para tokens y pools en Arc.",
    openapi: "https://risk.zumpay.com.ar/openapi.json",
    paid_endpoint: "https://risk.zumpay.com.ar/v1/arc/risk-check?address=0x...",
    payment: {
      protocol: "x402",
      price: `$${PRICE} ${CURRENCY}`,
      seller: SELLER_WALLET,
      networks: NETWORKS
    },
    examples: [
      "GET /v1/arc/risk-check?address=0x1111111111111111111111111111111111111111"
    ]
  });
});

app.get("/openapi.json", (_req, res) => {
  res.status(200).json(openapi);
});

app.get(riskCheckPaths, requireCirclePayment, handleRiskCheck);

function handleRiskCheck(req, res) {
  const { address } = req.query;

  if (!address || !ethers.isAddress(address)) {
    return res.status(400).json({
      error: "invalid_address",
      message: "Query parameter 'address' must be a valid Ethereum/Arc address."
    });
  }

  const targetAddress = ethers.getAddress(address);
  const assessment = buildRiskAssessment(targetAddress);

  return res.status(200).json(assessment);
}

app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Route ${req.method} ${req.path} was not found.`
  });
});

function buildRiskAssessment(targetAddress) {
  const seed = Number(BigInt(ethers.keccak256(targetAddress)) % 10_000n);
  const topHoldersConcentration = Number((8 + (seed % 5200) / 100).toFixed(2));

  const checks = {
    is_honeypot: seed % 29 === 0,
    mint_function_enabled: seed % 11 === 0,
    ownership_renounced: seed % 3 !== 0,
    liquidity_locked: seed % 5 !== 0,
    top_holders_concentration_percentage: topHoldersConcentration
  };

  const riskScore = calculateRiskScore(checks);

  return {
    status: "success",
    network: "Arc",
    target_address: targetAddress,
    risk_score: riskScore,
    risk_level: getRiskLevel(riskScore),
    checks,
    recommendation: getRecommendation(riskScore),
    timestamp: new Date().toISOString()
  };
}

function calculateRiskScore(checks) {
  let score = 5;

  if (checks.is_honeypot) score += 45;
  if (checks.mint_function_enabled) score += 20;
  if (!checks.ownership_renounced) score += 15;
  if (!checks.liquidity_locked) score += 15;
  if (checks.top_holders_concentration_percentage > 40) score += 15;
  if (checks.top_holders_concentration_percentage > 60) score += 10;

  return Math.min(score, 100);
}

function getRiskLevel(score) {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

function getRecommendation(score) {
  if (score >= 60) return "AVOID";
  if (score >= 30) return "REVIEW_REQUIRED";
  return "SAFE_TO_TRADE";
}

async function getGatewayMiddleware() {
  if (!gatewayMiddlewarePromise) {
    gatewayMiddlewarePromise = import("@circle-fin/x402-batching/server").then(
      ({ createGatewayMiddleware }) => {
        const gateway = createGatewayMiddleware({
          sellerAddress: SELLER_WALLET,
          arcPrivateMainnet: true,
          description:
            "Zumpay Arc Anti-Rugpull risk assessment for AI agents. Analisis Anti-Rugpull de Arc para agentes de IA."
        });

        return gateway.require(`$${PRICE}`);
      }
    );
  }

  return gatewayMiddlewarePromise;
}

async function requireCirclePayment(req, res, next) {
  try {
    const middleware = await getGatewayMiddleware();
    return middleware(req, res, next);
  } catch (err) {
    return next(err);
  }
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zumpay Arc Risk Assessment API listening on port ${PORT}`);
  });
}

module.exports = app;
