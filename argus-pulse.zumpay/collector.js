const { ethers } = require("ethers");

const ARC_RPC_URL = process.env.ARC_RPC_URL || "https://rpc.arc.network";
const ARGUS_SUBGRAPH_URL =
  process.env.ARGUS_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_arc/subgraphs/argus-launchpad/v1/gn";
const ARGUS_FACTORY_ADDRESS = process.env.ARGUS_FACTORY_ADDRESS || "";
const POLL_INTERVAL_MS = Number(process.env.COLLECTOR_POLL_INTERVAL_MS || 15000);
const MAX_ENTRIES = 100;
const WHALE_USD_THRESHOLD = Number(process.env.WHALE_USD_THRESHOLD || 1000);

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const ARGUS_FACTORY_ABI = [
  "event TokenCreated(address indexed token,address indexed creator,uint256 supply)",
  "event TokenLaunched(address indexed token,address indexed creator,uint256 supply)",
  "event PairCreated(address indexed token0,address indexed token1,address pair,uint256)",
  "event PoolCreated(address indexed token0,address indexed token1,uint24 fee,int24 tickSpacing,address pool)"
];

const store = {
  freshLaunches: [],
  momentum: [],
  whaleRadar: [],
  lastUpdatedAt: null,
  source: "bootstrap",
  errors: []
};

let started = false;
let intervalId = null;
let provider = null;
let factory = null;
let refreshPromise = null;

async function startCollector() {
  if (started) return getSnapshot();
  started = true;

  await refreshFromSubgraph("startup");
  startRpcListener();

  intervalId = setInterval(() => {
    refreshFromSubgraph("interval").catch((err) => recordError(err));
  }, POLL_INTERVAL_MS);

  return getSnapshot();
}

async function stopCollector() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  started = false;

  if (factory) factory.removeAllListeners();
  factory = null;

  if (provider?.destroy) provider.destroy();
  provider = null;
}

async function ensureSnapshotFresh() {
  const ageMs = store.lastUpdatedAt ? Date.now() - Date.parse(store.lastUpdatedAt) : Infinity;

  if (ageMs < POLL_INTERVAL_MS && store.freshLaunches.length > 0) {
    return getSnapshot();
  }

  if (!refreshPromise) {
    refreshPromise = refreshFromSubgraph("on-demand").finally(() => {
      refreshPromise = null;
    });
  }

  await refreshPromise;
  return getSnapshot();
}

function getSnapshot() {
  return {
    freshLaunches: store.freshLaunches.slice(0, MAX_ENTRIES),
    momentum: store.momentum.slice(0, MAX_ENTRIES),
    whaleRadar: store.whaleRadar.slice(0, MAX_ENTRIES),
    meta: {
      source: store.source,
      lastUpdatedAt: store.lastUpdatedAt,
      maxEntries: MAX_ENTRIES,
      whaleUsdThreshold: WHALE_USD_THRESHOLD,
      errors: store.errors.slice(-5)
    }
  };
}

async function refreshFromSubgraph(source) {
  try {
    const [launches, swaps] = await Promise.all([queryLaunches(), querySwaps()]);
    const normalizedLaunches = launches.map(normalizeLaunch).filter(Boolean);
    const normalizedSwaps = swaps.map(normalizeSwap).filter(Boolean);

    mergeFreshLaunches(normalizedLaunches);
    rebuildMomentum(normalizedLaunches, normalizedSwaps);
    mergeWhales(normalizedSwaps.filter((swap) => swap.usdValue >= WHALE_USD_THRESHOLD));

    store.source = source;
    store.lastUpdatedAt = new Date().toISOString();
    return getSnapshot();
  } catch (err) {
    recordError(err);

    if (store.freshLaunches.length === 0) {
      seedFallbackData();
    }

    return getSnapshot();
  }
}

function startRpcListener() {
  if (!ARGUS_FACTORY_ADDRESS || !ethers.isAddress(ARGUS_FACTORY_ADDRESS)) {
    return;
  }

  try {
    provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    factory = new ethers.Contract(ethers.getAddress(ARGUS_FACTORY_ADDRESS), ARGUS_FACTORY_ABI, provider);

    factory.on("TokenCreated", (token, creator, supply, event) => {
      upsertFreshLaunch({
        tokenSymbol: "UNKNOWN",
        tokenName: "Unknown Argus Token",
        contractAddress: ethers.getAddress(token),
        supply: supply.toString(),
        creator: ethers.getAddress(creator),
        createdAt: new Date().toISOString(),
        createdAtBlock: Number(event.log.blockNumber || 0),
        source: "rpc:TokenCreated"
      });
    });

    factory.on("TokenLaunched", (token, creator, supply, event) => {
      upsertFreshLaunch({
        tokenSymbol: "UNKNOWN",
        tokenName: "Unknown Argus Token",
        contractAddress: ethers.getAddress(token),
        supply: supply.toString(),
        creator: ethers.getAddress(creator),
        createdAt: new Date().toISOString(),
        createdAtBlock: Number(event.log.blockNumber || 0),
        source: "rpc:TokenLaunched"
      });
    });
  } catch (err) {
    recordError(err);
  }
}

async function queryLaunches() {
  const queries = [
    `query ArgusFreshTokens {
      tokens(first: 100, orderBy: createdTimestamp, orderDirection: desc) {
        id
        address
        symbol
        name
        totalSupply
        supply
        createdTimestamp
        createdAt
        marketCapUsd
        priceUsd
        buyTaxPercent
        sellTaxPercent
      }
    }`,
    `query ArgusFreshLaunches {
      launches(first: 100, orderBy: createdTimestamp, orderDirection: desc) {
        id
        token
        tokenAddress
        tokenSymbol
        tokenName
        totalSupply
        createdTimestamp
        marketCapUsd
        priceUsd
        buyTaxPercent
        sellTaxPercent
      }
    }`
  ];

  const payload = await firstSuccessfulGraphQuery(queries);
  return payload.tokens || payload.launches || [];
}

async function querySwaps() {
  const queries = [
    `query ArgusRecentSwaps {
      swaps(first: 100, orderBy: timestamp, orderDirection: desc) {
        id
        token
        tokenAddress
        tokenSymbol
        amountUsd
        volumeUsd
        usdValue
        transactionCount
        txCount
        timestamp
        transactionHash
        sender
        buyer
        seller
      }
    }`,
    `query ArgusRecentTransactions {
      transactions(first: 100, orderBy: timestamp, orderDirection: desc) {
        id
        token
        tokenAddress
        tokenSymbol
        amountUsd
        volumeUsd
        usdValue
        timestamp
        hash
        from
      }
    }`
  ];

  const payload = await firstSuccessfulGraphQuery(queries);
  return payload.swaps || payload.transactions || [];
}

async function firstSuccessfulGraphQuery(queries) {
  let lastError;

  for (const query of queries) {
    try {
      const result = await graphQuery(query);
      if (result && Object.keys(result).length > 0) return result;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Argus subgraph returned no usable data.");
}

async function graphQuery(query) {
  const response = await fetch(ARGUS_SUBGRAPH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "zumpay-argus-pulse-collector/0.1.0"
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Argus subgraph HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((err) => err.message).join("; "));
  }

  return payload.data || {};
}

function normalizeLaunch(raw) {
  const address = raw.address || raw.tokenAddress || raw.token || raw.id;
  if (!address || !ethers.isAddress(address)) return null;

  const createdAt = normalizeTimestamp(raw.createdTimestamp || raw.createdAt);
  const supply = raw.totalSupply || raw.supply || "0";
  const marketCapUsd = toNumber(raw.marketCapUsd || raw.initialMarketCapUsd || 0);

  return {
    tokenSymbol: normalizeSymbol(raw.symbol || raw.tokenSymbol || "UNKNOWN"),
    tokenName: String(raw.name || raw.tokenName || "Unknown Argus Token"),
    contractAddress: ethers.getAddress(address),
    pairedWith: "USDC",
    supply: String(supply),
    initialMarketCapUsd: marketCapUsd,
    priceUsd: toNumber(raw.priceUsd || 0),
    createdAt,
    buyTaxPercent: toNumber(raw.buyTaxPercent || 0),
    sellTaxPercent: toNumber(raw.sellTaxPercent || 0),
    source: "subgraph"
  };
}

function normalizeSwap(raw) {
  const tokenAddress = raw.tokenAddress || raw.token || raw.id;
  const timestamp = normalizeTimestamp(raw.timestamp);

  return {
    id: String(raw.id || raw.transactionHash || raw.hash || deterministicId(JSON.stringify(raw))),
    tokenSymbol: normalizeSymbol(raw.tokenSymbol || raw.symbol || "UNKNOWN"),
    tokenAddress: tokenAddress && ethers.isAddress(tokenAddress) ? ethers.getAddress(tokenAddress) : null,
    usdValue: toNumber(raw.usdValue || raw.amountUsd || raw.volumeUsd || 0),
    transactionCount: toNumber(raw.transactionCount || raw.txCount || 1),
    transactionHash: String(raw.transactionHash || raw.hash || raw.id || ""),
    trader: raw.sender || raw.buyer || raw.seller || raw.from || null,
    timestamp
  };
}

function mergeFreshLaunches(entries) {
  entries.forEach(upsertFreshLaunch);
  store.freshLaunches = store.freshLaunches
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_ENTRIES);
}

function upsertFreshLaunch(entry) {
  const index = store.freshLaunches.findIndex(
    (item) => item.contractAddress.toLowerCase() === entry.contractAddress.toLowerCase()
  );

  if (index === -1) {
    store.freshLaunches.unshift(entry);
    store.freshLaunches = store.freshLaunches.slice(0, MAX_ENTRIES);
    return;
  }

  store.freshLaunches[index] = {
    ...store.freshLaunches[index],
    ...entry
  };
}

function rebuildMomentum(launches, swaps) {
  const byToken = new Map();

  launches.forEach((launch) => {
    byToken.set(launch.contractAddress.toLowerCase(), {
      tokenSymbol: launch.tokenSymbol,
      tokenName: launch.tokenName,
      contractAddress: launch.contractAddress,
      volume24hUsd: 0,
      transactionCount24h: 0,
      whaleTransactionCount24h: 0,
      score: 0,
      updatedAt: new Date().toISOString()
    });
  });

  swaps.forEach((swap) => {
    if (!swap.tokenAddress) return;

    const key = swap.tokenAddress.toLowerCase();
    const current =
      byToken.get(key) ||
      {
        tokenSymbol: swap.tokenSymbol,
        tokenName: "Unknown Argus Token",
        contractAddress: swap.tokenAddress,
        volume24hUsd: 0,
        transactionCount24h: 0,
        whaleTransactionCount24h: 0,
        score: 0,
        updatedAt: new Date().toISOString()
      };

    current.volume24hUsd += swap.usdValue;
    current.transactionCount24h += swap.transactionCount || 1;
    if (swap.usdValue >= WHALE_USD_THRESHOLD) current.whaleTransactionCount24h += 1;
    current.score = Math.round(current.volume24hUsd / 100 + current.transactionCount24h * 2 + current.whaleTransactionCount24h * 15);

    byToken.set(key, current);
  });

  store.momentum = Array.from(byToken.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

function mergeWhales(swaps) {
  const existing = new Map(store.whaleRadar.map((item) => [item.id, item]));

  swaps.forEach((swap) => {
    existing.set(swap.id, {
      id: swap.id,
      tokenSymbol: swap.tokenSymbol,
      tokenAddress: swap.tokenAddress,
      usdValue: swap.usdValue,
      transactionHash: swap.transactionHash,
      trader: swap.trader,
      timestamp: swap.timestamp,
      flag: "WHALE_TRANSACTION"
    });
  });

  store.whaleRadar = Array.from(existing.values())
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, MAX_ENTRIES);
}

function seedFallbackData() {
  const now = Date.now();
  const entries = [
    {
      tokenSymbol: "$PROXIMA",
      tokenName: "Proxima",
      contractAddress: deterministicAddress("argus-pulse:fallback:proxima"),
      pairedWith: "USDC",
      supply: "1000000000000000000000000000",
      initialMarketCapUsd: 2680,
      priceUsd: 0.000002681,
      createdAt: new Date(now - 420000).toISOString(),
      buyTaxPercent: 10,
      sellTaxPercent: 10,
      source: "fallback"
    },
    {
      tokenSymbol: "$ORION",
      tokenName: "Orion AI",
      contractAddress: deterministicAddress("argus-pulse:fallback:orion"),
      pairedWith: "USDC",
      supply: "100000000000000000000000000",
      initialMarketCapUsd: 7420,
      priceUsd: 0.00000742,
      createdAt: new Date(now - 1200000).toISOString(),
      buyTaxPercent: 5,
      sellTaxPercent: 5,
      source: "fallback"
    }
  ];

  mergeFreshLaunches(entries);
  rebuildMomentum(entries, [
    {
      id: "fallback-whale-1",
      tokenSymbol: "$ORION",
      tokenAddress: entries[1].contractAddress,
      usdValue: 1450,
      transactionCount: 1,
      transactionHash: "0x",
      trader: null,
      timestamp: new Date(now - 90000).toISOString()
    }
  ]);
  mergeWhales([
    {
      id: "fallback-whale-1",
      tokenSymbol: "$ORION",
      tokenAddress: entries[1].contractAddress,
      usdValue: 1450,
      transactionCount: 1,
      transactionHash: "0x",
      trader: null,
      timestamp: new Date(now - 90000).toISOString()
    }
  ]);

  store.source = "fallback";
  store.lastUpdatedAt = new Date().toISOString();
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric > 9999999999 ? numeric : numeric * 1000).toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeSymbol(symbol) {
  const text = String(symbol || "UNKNOWN").trim().toUpperCase();
  return text.startsWith("$") ? text : `$${text}`;
}

function deterministicAddress(label) {
  return ethers.getAddress(`0x${ethers.keccak256(ethers.toUtf8Bytes(label)).slice(26)}`);
}

function deterministicId(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordError(err) {
  store.errors.push({
    message: err.message || "Unknown collector error",
    timestamp: new Date().toISOString()
  });
  store.errors = store.errors.slice(-10);
}

seedFallbackData();

if (require.main === module) {
  startCollector()
    .then(() => {
      console.log(
        JSON.stringify({
          event: "argus_pulse_collector_started",
          arcRpcUrl: ARC_RPC_URL,
          subgraphUrl: ARGUS_SUBGRAPH_URL,
          hasFactoryAddress: Boolean(ARGUS_FACTORY_ADDRESS),
          pollIntervalMs: POLL_INTERVAL_MS
        })
      );
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}

module.exports = {
  startCollector,
  stopCollector,
  ensureSnapshotFresh,
  getSnapshot,
  refreshFromSubgraph
};
