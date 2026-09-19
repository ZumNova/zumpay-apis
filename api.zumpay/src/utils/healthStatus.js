const STALE_POOL_SECONDS = 60 * 60 * 24;

function getHealthStatus({ reserve0, reserve1, blockTimestampLast }) {
  if (reserve0 === 0n || reserve1 === 0n) {
    return "low_liquidity";
  }

  if (!blockTimestampLast) {
    return "unknown";
  }

  const ageInSeconds = Math.floor(Date.now() / 1000) - blockTimestampLast;

  if (ageInSeconds > STALE_POOL_SECONDS) {
    return "stale";
  }

  return "healthy";
}

module.exports = { getHealthStatus };
