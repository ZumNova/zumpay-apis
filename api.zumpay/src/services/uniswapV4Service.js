const { ethers } = require("ethers");

const { env } = require("../config/env");
const { ZERO_ADDRESS, getTokenRegistry } = require("../config/tokens");

const RESERVES_LENS_ABI = [
  "function getPoolTVL(address manager,(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns ((uint256 coreAmount0,uint256 coreAmount1,uint256 hookReserves0,uint256 hookReserves1,uint256 hookEffective0,uint256 hookEffective1,uint160 sqrtPriceX96,int24 tick,uint128 activeLiquidity,uint256 blockNumber,address statsProvider,uint16 hookPermissions,bool hasCustomAccounting,uint8 statsStatus) result)"
];

function getProvider() {
  if (!env.arcRpcUrl) {
    const err = new Error("ARC_RPC_URL is not configured.");
    err.statusCode = 500;
    err.code = "missing_arc_rpc_url";
    throw err;
  }

  return new ethers.JsonRpcProvider(env.arcRpcUrl);
}

function resolveCurrency(value) {
  if (!value) return null;

  const registry = getTokenRegistry();
  const normalized = String(value).trim();
  const symbolAddress = registry[normalized.toUpperCase()];

  if (symbolAddress) return symbolAddress;
  if (ethers.isAddress(normalized)) return ethers.getAddress(normalized);

  return null;
}

function sortCurrencies(tokenA, tokenB) {
  const currencyA = resolveCurrency(tokenA);
  const currencyB = resolveCurrency(tokenB);

  if (!currencyA || !currencyB) {
    const err = new Error("tokenA and tokenB must be valid EVM addresses or supported symbols.");
    err.statusCode = 400;
    err.code = "invalid_token_pair";
    throw err;
  }

  if (currencyA.toLowerCase() === currencyB.toLowerCase()) {
    const err = new Error("tokenA and tokenB must be different currencies.");
    err.statusCode = 400;
    err.code = "invalid_token_pair";
    throw err;
  }

  const [currency0, currency1] =
    BigInt(currencyA) < BigInt(currencyB) ? [currencyA, currencyB] : [currencyB, currencyA];

  return { currency0, currency1 };
}

function buildPoolKey({ tokenA, tokenB, fee, tickSpacing, hooks }) {
  const { currency0, currency1 } = sortCurrencies(tokenA, tokenB);

  return {
    currency0,
    currency1,
    fee: Number(fee || env.defaultUniswapFee),
    tickSpacing: Number(tickSpacing || env.defaultUniswapTickSpacing),
    hooks: hooks ? ethers.getAddress(hooks) : env.defaultUniswapHooks
  };
}

function getPoolId(poolKey) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  );

  return ethers.keccak256(encoded);
}

function getHealthStatus({ coreAmount0, coreAmount1, activeLiquidity }) {
  if (activeLiquidity === 0n || coreAmount0 === 0n || coreAmount1 === 0n) {
    return "low_liquidity";
  }

  return "healthy";
}

async function getUniswapV4PoolLiquidity(params) {
  const poolKey = buildPoolKey(params);
  const provider = getProvider();
  const reservesLens = new ethers.Contract(env.uniswapV4ReservesLens, RESERVES_LENS_ABI, provider);

  let result;

  try {
    result = await reservesLens[
      "getPoolTVL(address,(address,address,uint24,int24,address))"
    ](env.uniswapV4PoolManager, [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks
    ]);
  } catch (err) {
    const notFound = new Error("No active Uniswap v4 pool was found for that PoolKey.");
    notFound.statusCode = 404;
    notFound.code = "pool_not_found";
    notFound.cause = err;
    throw notFound;
  }

  return {
    protocol: "uniswap_v4",
    pool_address: null,
    pool_id: getPoolId(poolKey),
    pool_key: poolKey,
    reserves: {
      token0: {
        address: poolKey.currency0,
        reserve: result.coreAmount0.toString()
      },
      token1: {
        address: poolKey.currency1,
        reserve: result.coreAmount1.toString()
      },
      sqrt_price_x96: result.sqrtPriceX96.toString(),
      tick: Number(result.tick),
      active_liquidity: result.activeLiquidity.toString(),
      block_number: Number(result.blockNumber),
      has_custom_accounting: result.hasCustomAccounting,
      hook_reserves0: result.hookReserves0.toString(),
      hook_reserves1: result.hookReserves1.toString()
    },
    timestamp: new Date().toISOString(),
    health_status: getHealthStatus(result)
  };
}

module.exports = { getUniswapV4PoolLiquidity, resolveCurrency };
