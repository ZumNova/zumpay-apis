const { ethers } = require("ethers");

const { env } = require("../config/env");
const { getHealthStatus } = require("../utils/healthStatus");

const POOL_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
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

async function getPoolLiquidityByAddress(poolAddress) {
  const provider = getProvider();
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

  const [reserves, token0, token1] = await Promise.all([
    pool.getReserves(),
    pool.token0(),
    pool.token1()
  ]);

  const blockTimestampLast = Number(reserves.blockTimestampLast);

  return {
    pool_address: ethers.getAddress(poolAddress),
    reserves: {
      token0: {
        address: token0,
        reserve: reserves.reserve0.toString()
      },
      token1: {
        address: token1,
        reserve: reserves.reserve1.toString()
      },
      block_timestamp_last: blockTimestampLast
    },
    timestamp: new Date().toISOString(),
    health_status: getHealthStatus({
      reserve0: reserves.reserve0,
      reserve1: reserves.reserve1,
      blockTimestampLast
    })
  };
}

module.exports = { getPoolLiquidityByAddress };
