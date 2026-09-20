const express = require("express");
const { ethers } = require("ethers");
const openapi = require("./openapi.json");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const WALLET_ADDRESS =
  process.env.WALLET_ADDRESS || "0xF3aAD2304F711ad5f400Ad322442D67DeD3E8A25";
const PRICE = "0.002";
const PRICE_FIXED = "0.002000";
const PRICE_USDC_ATOMIC = "2000";
const CURRENCY = "USDC";
const NETWORKS = ["arc", "base"];
const SERVICE_URL = process.env.SERVICE_URL || "https://rh-v4-meme-radar.zumpay.com.ar";
const RH_RPC_URL = process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_CHAIN_ID = 4663;
const ROBINHOOD_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const ROBINHOOD_STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b";
const ARC_USDC_ADDRESS =
  process.env.ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
const BASE_USDC_ADDRESS =
  process.env.BASE_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const LIVE_CACHE_TTL_MS = Number(process.env.LIVE_CACHE_TTL_MS || 20000);

const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)"
];

const DEFAULT_MEME_POOLS = [
  {
    symbol: "PONS",
    name: "PONS",
    pool_id: "0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a",
    paired_with: "USDG",
    fee_label: "0.3%",
    lp_fee: 3000,
    tick: -281599,
    liquidity_raw: "13035950004196175409",
    active: true,
    bot_hint: "ONCHAIN_ACTIVE_WATCHLIST_VERIFY_VOLUME"
  },
  {
    symbol: "AI",
    name: "AI",
    pool_id: "0x7aebd80541bfaaf23dbb6e99ce13d4d31c1a84c91414f971eadbff7db5f85995",
    paired_with: "USDG",
    fee_label: "0.23%",
    lp_fee: 2300,
    tick: -289875,
    liquidity_raw: "3777475863008147796",
    active: true,
    bot_hint: "ONCHAIN_ACTIVE_WATCHLIST_VERIFY_VOLUME"
  },
  {
    symbol: "AI",
    name: "AI/PONS",
    pool_id: "0x230bc4a0fb5fb7ab27f6e72350dfa3f2489b0cdbaf34f0189d68672086ccb919",
    paired_with: "PONS",
    fee_label: "0.3%",
    lp_fee: 3000,
    tick: -8282,
    liquidity_raw: "5913252985185068590250858",
    active: true,
    bot_hint: "MEME_CROSS_PAIR_HIGH_RISK"
  },
  {
    symbol: "CASHCAT",
    name: "CASHCAT",
    pool_id: "0xa92a3df27a00a276183ff7265fd8affa11df1fe8bb23ddfaf13f6c879a3f818b",
    paired_with: "USDG",
    fee_label: "0.269%",
    lp_fee: 2690,
    tick: -293368,
    liquidity_raw: "5711047957717331637",
    active: true,
    bot_hint: "ONCHAIN_ACTIVE_WATCHLIST_VERIFY_VOLUME"
  },
  {
    symbol: "AD",
    name: "AD",
    pool_id: "0x2a4e49b6f4026be2d9c4cc273f389d986256e27b18950a8967d1daa095b27978",
    paired_with: "ETH",
    fee_label: "0.25%",
    lp_fee: 2500,
    tick: 157053,
    liquidity_raw: "24433583445741232493710",
    active: true,
    bot_hint: "ETH_PAIR_HIGH_RISK"
  },
  {
    symbol: "URANUS",
    name: "URANUS",
    pool_id: "0xaa432689c6e29cad1cb00098294baaf961ad57dab0308dbfd76aee9617788b11",
    paired_with: "USDG",
    fee_label: "3.9%",
    lp_fee: 39000,
    tick: 333210,
    liquidity_raw: "584401429002778542",
    active: true,
    bot_hint: "VERY_HIGH_FEE_EXTREME_RISK"
  },
  {
    symbol: "ASKR",
    name: "ASKR",
    pool_id: "0x89d567ae1f70adc86227c3adbeb84128590b1c1555d907c2313bac11e580f070",
    paired_with: "USDG",
    fee_label: "3%",
    lp_fee: 30000,
    tick: 329750,
    liquidity_raw: "1491497833270592639",
    active: true,
    bot_hint: "VERY_HIGH_FEE_EXTREME_RISK"
  },
  {
    symbol: "ROBIN",
    name: "ROBIN",
    pool_id: "0x5da41cb88148391ca9e1d3e2b3f64d7d122fc1c109c9f884b196bd366735092d",
    paired_with: "ETH",
    fee_label: "0.9%",
    lp_fee: 9000,
    tick: 129072,
    liquidity_raw: "11515015493065760157214",
    active: true,
    bot_hint: "ETH_PAIR_HIGH_RISK"
  }
];

let gatewayMiddlewarePromise;
let provider;
let livePoolCache;

app.use(express.json());
app.use(requestTelemetry("zumpay-rh-v4-meme-radar-api"));
app.use(humanFriendlyAliases);

const memePoolPaths = [
  "/v1/robinhood/v4/meme-pools",
  "/v1/rh/v4/meme-pools",
  "/v1/robinhood/v4/memes"
];
const memeMomentumPaths = [
  "/v1/robinhood/v4/meme-momentum",
  "/v1/rh/v4/meme-momentum",
  "/v1/robinhood/v4/meme-trending"
];
const newMemePoolPaths = [
  "/v1/robinhood/v4/new-meme-pools",
  "/v1/rh/v4/new-meme-pools",
  "/v1/robinhood/v4/fresh-memes"
];

function humanFriendlyAliases(req, _res, next) {
  if (req.method !== "GET") return next();
  const normalizedPath = normalizePath(req.path);

  if (
    normalizedPath === "/v1/robinhood/v4/meme pools" ||
    normalizedPath === "/v1/rh/v4/memes"
  ) {
    req.url = `/v1/robinhood/v4/meme-pools${getQueryString(req.originalUrl)}`;
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
    name: "RH V4 Meme Radar",
    openapi: "/openapi.json",
    docs: "/docs",
    endpoints: [
      "/v1/robinhood/v4/meme-pools",
      "/v1/robinhood/v4/meme-momentum",
      "/v1/robinhood/v4/new-meme-pools",
      "/v1/robinhood/v4/meme-pool-check"
    ]
  });
});

app.get("/docs", (_req, res) => {
  res.status(200).json({
    name: "RH V4 Meme Radar Docs",
    description:
      "Paid high-risk Robinhood V4 meme-pool radar for fast-entry bots and AI agents.",
    openapi: `${SERVICE_URL}/openapi.json`,
    paid_endpoints: {
      meme_pools: `${SERVICE_URL}/v1/robinhood/v4/meme-pools?limit=10&min_liquidity_usd=1000`,
      meme_momentum: `${SERVICE_URL}/v1/robinhood/v4/meme-momentum?limit=10`,
      new_meme_pools: `${SERVICE_URL}/v1/robinhood/v4/new-meme-pools?max_age_minutes=60`,
      meme_pool_check: `${SERVICE_URL}/v1/robinhood/v4/meme-pool-check?pool_id=0x...`
    },
    payment: {
      protocols: ["x402", "mpp"],
      price: `$${PRICE} ${CURRENCY}`,
      seller: WALLET_ADDRESS,
      networks: NETWORKS
    },
    risk_note:
      "Meme pools are intentionally high risk. Signals are optimized for speed and activity, not investment safety."
  });
});

app.get("/openapi.json", (_req, res) => {
  res.status(200).json(openapi);
});

app.get(memePoolPaths, paymentGate, handleMemePools);
app.get(memeMomentumPaths, paymentGate, handleMemeMomentum);
app.get(newMemePoolPaths, paymentGate, handleNewMemePools);
app.get("/v1/robinhood/v4/meme-pool-check", paymentGate, handleMemePoolCheck);

async function handleMemePools(req, res, next) {
  try {
    const filters = parseMemeQuery(req.query);
    const snapshot = await getLiveMemeSnapshot();
    const pools = snapshot.pools
      .filter((pool) => pool.liquidity_usd >= filters.minLiquidityUsd)
      .filter((pool) => pool.volume_5m_usd >= filters.minVolume5mUsd)
      .sort((a, b) => b.edge_score - a.edge_score)
      .slice(0, filters.limit);

    return res.status(200).json(buildMemeResponse("meme_pools", pools, filters, snapshot));
  } catch (err) {
    return next(err);
  }
}

async function handleMemeMomentum(req, res, next) {
  try {
    const limit = parseInteger(req.query.limit, 10, "limit");
    if (limit < 1 || limit > 50) throw badRequest("limit must be between 1 and 50.");

    const snapshot = await getLiveMemeSnapshot();
    const pools = snapshot.pools
      .sort((a, b) => b.reward_score - a.reward_score)
      .slice(0, limit);

    return res.status(200).json(buildMemeResponse("meme_momentum", pools, { limit }, snapshot));
  } catch (err) {
    return next(err);
  }
}

async function handleNewMemePools(req, res, next) {
  try {
    const maxAgeMinutes = parseInteger(req.query.max_age_minutes, 60, "max_age_minutes");
    if (maxAgeMinutes < 1 || maxAgeMinutes > 1440) {
      throw badRequest("max_age_minutes must be between 1 and 1440.");
    }

    const snapshot = await getLiveMemeSnapshot();
    const pools = snapshot.pools
      .filter((pool) => pool.age_minutes != null && pool.age_minutes <= maxAgeMinutes)
      .sort((a, b) => a.age_minutes - b.age_minutes);

    return res.status(200).json(
      buildMemeResponse("new_meme_pools", pools, { maxAgeMinutes }, snapshot)
    );
  } catch (err) {
    return next(err);
  }
}

async function handleMemePoolCheck(req, res, next) {
  try {
    const poolId = String(req.query.pool_id || "").trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(poolId)) {
      throw badRequest("pool_id must be a bytes32 hex string.");
    }

    const stateView = new ethers.Contract(ROBINHOOD_STATE_VIEW, STATE_VIEW_ABI, getProvider());
    const [slot0, liquidity] = await Promise.all([
      stateView.getSlot0(poolId),
      stateView.getLiquidity(poolId)
    ]);
    const sqrtPriceX96 = slot0[0];

    return res.status(200).json({
      status: "success",
      network: "Robinhood",
      chain_id: ROBINHOOD_CHAIN_ID,
      pool_id: poolId,
      pool_manager: ROBINHOOD_POOL_MANAGER,
      state_view: ROBINHOOD_STATE_VIEW,
      active: sqrtPriceX96 > BigInt(0) && liquidity > BigInt(0),
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity_raw: liquidity.toString(),
      tick: Number(slot0[1]),
      lp_fee: Number(slot0[3]),
      ...scorePoolForBots({
        active: sqrtPriceX96 > BigInt(0) && liquidity > BigInt(0),
        liquidity_raw: liquidity.toString(),
        lp_fee: Number(slot0[3]),
        paired_with: "UNKNOWN",
        volume_5m_usd: 0,
        tx_count_5m: 0,
        age_minutes: null,
        live_error: null
      }),
      risk_note: "Meme-pool verification checks on-chain activity/liquidity, not token safety.",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return next(err);
  }
}

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RH_RPC_URL, ROBINHOOD_CHAIN_ID);
  }
  return provider;
}

async function getLiveMemeSnapshot() {
  if (livePoolCache && Date.now() - livePoolCache.refreshedAtMs < LIVE_CACHE_TTL_MS) {
    return livePoolCache;
  }

  const provider = getProvider();
  const stateView = new ethers.Contract(ROBINHOOD_STATE_VIEW, STATE_VIEW_ABI, provider);
  const basePools = getCuratedMemePools();
  const [blockNumber, enrichedPools] = await Promise.all([
    provider.getBlockNumber(),
    Promise.all(basePools.map((pool) => enrichPoolWithLiveState(pool, stateView)))
  ]);
  const pools = enrichedPools.map(scorePoolForBots);

  livePoolCache = {
    pools,
    blockNumber,
    refreshedAtMs: Date.now(),
    refreshedAt: new Date().toISOString()
  };

  return livePoolCache;
}

async function enrichPoolWithLiveState(pool, stateView) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(pool.pool_id)) {
    return {
      ...pool,
      active: false,
      live_error: "invalid_pool_id"
    };
  }

  try {
    const [slot0, liquidity] = await Promise.all([
      stateView.getSlot0(pool.pool_id),
      stateView.getLiquidity(pool.pool_id)
    ]);
    const sqrtPriceX96 = slot0[0];
    const liquidityRaw = liquidity.toString();
    const lpFee = Number(slot0[3]);

    return {
      ...pool,
      active: sqrtPriceX96 > BigInt(0) && liquidity > BigInt(0),
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity_raw: liquidityRaw,
      tick: Number(slot0[1]),
      protocol_fee: Number(slot0[2]),
      lp_fee: lpFee,
      fee_label: pool.fee_label || `${lpFee / 10000}%`,
      live_error: null
    };
  } catch (error) {
    return {
      ...pool,
      active: false,
      live_error: error.shortMessage || error.message || "live_state_read_failed"
    };
  }
}

function getCuratedMemePools() {
  return parseConfiguredPools().map((pool) => {
    const liquidityUsd = toNumber(pool.liquidity_usd);
    const volume5mUsd = toNumber(pool.volume_5m_usd);
    const txCount5m = parseInteger(pool.tx_count_5m, 0, "tx_count_5m");
    const ageMinutes =
      pool.age_minutes === undefined || pool.age_minutes === null
        ? null
        : parseInteger(pool.age_minutes, 0, "age_minutes");
    const agePenalty = ageMinutes == null ? 0 : ageMinutes * 2;
    const velocityScore = Math.max(0, Math.round(volume5mUsd + txCount5m * 50 - agePenalty));

    return {
      symbol: String(pool.symbol || "MEME").toUpperCase(),
      name: String(pool.name || pool.symbol || "Meme Token"),
      pool_id: String(pool.pool_id || ""),
      paired_with: String(pool.paired_with || "USDG").toUpperCase(),
      liquidity_usd: liquidityUsd,
      volume_5m_usd: volume5mUsd,
      volume_1h_usd: toNumber(pool.volume_1h_usd || volume5mUsd * 6),
      tx_count_5m: txCount5m,
      age_minutes: ageMinutes,
      active: Boolean(pool.active),
      fee_label: pool.fee_label || null,
      lp_fee: pool.lp_fee ?? null,
      tick: pool.tick ?? null,
      liquidity_raw: pool.liquidity_raw || null,
      velocity_score: velocityScore,
      bot_hint: pool.bot_hint || getBotHint(liquidityUsd, volume5mUsd, ageMinutes)
    };
  });
}

function parseConfiguredPools() {
  if (!process.env.MEME_POOLS_JSON) return DEFAULT_MEME_POOLS;

  try {
    const parsed = JSON.parse(process.env.MEME_POOLS_JSON);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function getBotHint(liquidityUsd, volume5mUsd, ageMinutes) {
  if (ageMinutes < 15 && volume5mUsd > 1000) return "FRESH_FAST_ENTRY_EXTREME_RISK";
  if (volume5mUsd > liquidityUsd * 0.25) return "HIGH_VELOCITY_HIGH_RISK";
  if (liquidityUsd < 5000) return "LOW_LIQUIDITY_EXTREME_RISK";
  return "FAST_ENTRY_HIGH_RISK";
}

function buildMemeResponse(feed, pools, filters, snapshot) {
  return {
    status: "success",
    network: "Robinhood",
    product: "RH V4 Meme Radar",
    feed,
    query_filters: filters,
    total_detected: pools.length,
    pools,
    meta: {
      chain_id: ROBINHOOD_CHAIN_ID,
      pool_manager: ROBINHOOD_POOL_MANAGER,
      state_view: ROBINHOOD_STATE_VIEW,
      data_source: process.env.MEME_POOLS_JSON ? "configured_watchlist" : "default_watchlist",
      live_cache_ttl_ms: LIVE_CACHE_TTL_MS,
      live_refreshed_at: snapshot.refreshedAt,
      live_block_number: snapshot.blockNumber,
      scoring_model: "risk_reward_v1",
      scoring_note:
        "Scores use on-chain active state, raw liquidity, pair type, fee tier and known data gaps. Volume fields stay zero until an indexer is connected.",
      risk_notice: "High-risk meme-pool feed. Activity does not imply safety."
    },
    timestamp: new Date().toISOString()
  };
}

function scorePoolForBots(pool) {
  const reasonCodes = [];
  const active = Boolean(pool.active) && !pool.live_error;
  const lpFee = Number(pool.lp_fee || 0);
  const pairedWith = String(pool.paired_with || "UNKNOWN").toUpperCase();
  const liquidityDigits = countDecimalDigits(pool.liquidity_raw);
  const hasVolumeSignal = Number(pool.volume_5m_usd || 0) > 0 || Number(pool.tx_count_5m || 0) > 0;

  let riskScore = 35;
  let rewardScore = 0;

  if (active) {
    rewardScore += 30;
    reasonCodes.push("ACTIVE_ONCHAIN");
  } else {
    riskScore += 45;
    reasonCodes.push(pool.live_error ? "LIVE_READ_ERROR" : "INACTIVE_ONCHAIN");
  }

  if (liquidityDigits >= 25) {
    rewardScore += 35;
    reasonCodes.push("VERY_HIGH_RAW_LIQUIDITY");
  } else if (liquidityDigits >= 22) {
    rewardScore += 28;
    reasonCodes.push("HIGH_RAW_LIQUIDITY");
  } else if (liquidityDigits >= 19) {
    rewardScore += 20;
    reasonCodes.push("MEDIUM_RAW_LIQUIDITY");
  } else if (liquidityDigits > 0) {
    rewardScore += 10;
    riskScore += 10;
    reasonCodes.push("LOW_RAW_LIQUIDITY");
  } else {
    riskScore += 20;
    reasonCodes.push("UNKNOWN_RAW_LIQUIDITY");
  }

  if (lpFee >= 30000) {
    riskScore += 30;
    rewardScore -= 10;
    reasonCodes.push("VERY_HIGH_FEE");
  } else if (lpFee >= 10000) {
    riskScore += 20;
    reasonCodes.push("HIGH_FEE");
  } else if (lpFee >= 5000) {
    riskScore += 12;
    rewardScore += 3;
    reasonCodes.push("MID_HIGH_FEE");
  } else if (lpFee > 0) {
    riskScore += 6;
    rewardScore += 10;
    reasonCodes.push("BOT_FRIENDLY_FEE");
  } else {
    riskScore += 10;
    reasonCodes.push("UNKNOWN_FEE");
  }

  if (pairedWith === "USDG") {
    rewardScore += 12;
    reasonCodes.push("STABLE_PAIR");
  } else if (pairedWith === "ETH" || pairedWith === "WETH") {
    rewardScore += 8;
    riskScore += 5;
    reasonCodes.push("ETH_PAIR");
  } else if (pairedWith === "UNKNOWN") {
    riskScore += 12;
    reasonCodes.push("UNKNOWN_PAIR");
  } else {
    rewardScore += 4;
    riskScore += 12;
    reasonCodes.push("MEME_CROSS_PAIR");
  }

  if (Number(pool.liquidity_usd || 0) === 0) {
    riskScore += 10;
    reasonCodes.push("UNKNOWN_USD_LIQUIDITY");
  }

  if (!hasVolumeSignal) {
    riskScore += 10;
    reasonCodes.push("MISSING_VOLUME_INDEX");
  } else {
    rewardScore += Math.min(15, Number(pool.volume_5m_usd || 0) / 250 + Number(pool.tx_count_5m || 0));
    reasonCodes.push("HAS_SHORT_WINDOW_ACTIVITY");
  }

  if (pool.age_minutes == null) {
    riskScore += 5;
    reasonCodes.push("AGE_UNKNOWN");
  } else if (pool.age_minutes <= 30) {
    riskScore += 15;
    rewardScore += 12;
    reasonCodes.push("FRESH_POOL");
  }

  const normalizedRisk = clamp(Math.round(riskScore), 0, 100);
  const normalizedReward = clamp(Math.round(rewardScore), 0, 100);
  const edgeScore = normalizedReward - normalizedRisk;

  return {
    ...pool,
    risk_score: normalizedRisk,
    reward_score: normalizedReward,
    edge_score: edgeScore,
    risk_level: getRiskLevel(normalizedRisk),
    bot_decision: getBotDecision(active, normalizedRisk, edgeScore),
    reason_codes: reasonCodes
  };
}

function countDecimalDigits(value) {
  const digits = String(value || "").replace(/^0+/, "");
  return /^\d+$/.test(digits) ? digits.length : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRiskLevel(riskScore) {
  if (riskScore >= 85) return "EXTREME";
  if (riskScore >= 65) return "HIGH";
  if (riskScore >= 40) return "MEDIUM";
  return "LOW";
}

function getBotDecision(active, riskScore, edgeScore) {
  if (!active || riskScore >= 90) return "AVOID";
  if (edgeScore >= 20 && riskScore < 70) return "CONSIDER_FAST_ENTRY";
  if (edgeScore >= 0) return "HIGH_RISK_SCALP_ONLY";
  return "WATCH_ONLY";
}

function parseMemeQuery(query) {
  const limit = parseInteger(query.limit, 10, "limit");
  if (limit < 1 || limit > 50) throw badRequest("limit must be between 1 and 50.");

  return {
    limit,
    minLiquidityUsd: parseNumber(query.min_liquidity_usd, 0, "min_liquidity_usd"),
    minVolume5mUsd: parseNumber(query.min_volume_5m_usd, 0, "min_volume_5m_usd")
  };
}

function parseInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw badRequest(`${fieldName} must be an integer.`);
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

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

  if (req.headers.authorization && !req.headers["x-payment"]) return next();

  try {
    const middleware = await getGatewayMiddleware();
    return middleware(req, res, next);
  } catch (_err) {
    if (!req.headers["x-payment"]) return sendManualPaymentRequired(res);
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
            "RH V4 Meme Radar for high-risk fast-entry bots scanning Robinhood meme pools."
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
    `Payment realm="RH V4 Meme Radar", currency="${CURRENCY}", amount="${PRICE}"`
  );

  return res.status(402).json({
    error: "payment_required",
    message: "Payment is required to access RH V4 Meme Radar.",
    accepts: [
      {
        scheme: "exact",
        network: "arc",
        maxAmountRequired: PRICE_USDC_ATOMIC,
        asset: ARC_USDC_ADDRESS,
        payTo: WALLET_ADDRESS,
        resource: `${SERVICE_URL}/v1/robinhood/v4/meme-pools`,
        description: `RH V4 Meme Radar API call priced at ${PRICE_FIXED} ${CURRENCY}.`,
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
        resource: `${SERVICE_URL}/v1/robinhood/v4/meme-pools`,
        description: `RH V4 Meme Radar API call priced at ${PRICE_FIXED} ${CURRENCY}.`,
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
    console.log(`RH V4 Meme Radar API listening on port ${PORT}`);
  });
}

module.exports = app;
