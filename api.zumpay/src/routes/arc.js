const express = require("express");
const { ethers } = require("ethers");

const { requireCirclePayment } = require("../middleware/circleGateway");
const { getSupportedTokens } = require("../config/tokens");
const { getPoolLiquidityByAddress } = require("../services/arcPoolService");
const { getUniswapV4PoolLiquidity } = require("../services/uniswapV4Service");

const router = express.Router();

const poolLiquidityPaths = [
  "/pool-liquidity",
  "/liquidity",
  "/pool_liquidity",
  "/pool/liquidity",
  "/liquidez",
  "/liquidez-pool",
  "/liquidez-del-pool",
  "/liquidez del pool",
  "/líquidez del pool"
];

router.get("/tokens", (_req, res) => {
  const tokens = getSupportedTokens();

  res.json({
    status: "success",
    network: "Arc",
    chain_id: 5042,
    total_tokens: tokens.length,
    description:
      "Public token catalog for AI agents. Catalogo publico de tokens para agentes de IA.",
    tokens
  });
});

router.get(poolLiquidityPaths, requireCirclePayment, handlePoolLiquidity);

async function handlePoolLiquidity(req, res, next) {
  try {
    const {
      pool_address: poolAddress,
      tokenA,
      tokenB,
      fee,
      tickSpacing,
      hooks
    } = req.query;

    if (poolAddress) {
      if (!ethers.isAddress(poolAddress)) {
        return res.status(400).json({
          error: "invalid_pool_address",
          message: "Query parameter pool_address must be a valid EVM address."
        });
      }

      const liquidity = await getPoolLiquidityByAddress(poolAddress);
      return res.json(liquidity);
    }

    if (!tokenA || !tokenB) {
      return res.status(400).json({
        error: "missing_pool_selector",
        message: "Send pool_address, or send tokenA and tokenB for a Uniswap v4 pool."
      });
    }

    const liquidity = await getUniswapV4PoolLiquidity({
      tokenA,
      tokenB,
      fee,
      tickSpacing,
      hooks
    });

    return res.json(liquidity);
  } catch (err) {
    return next(err);
  }
}

module.exports = router;
