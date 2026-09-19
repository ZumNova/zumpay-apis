require("dotenv").config();

const env = {
  port: Number(process.env.PORT || 3000),
  apiBaseUrl: process.env.API_BASE_URL || "https://api.zumpay.com.ar",
  arcRpcUrl: process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io",
  paymentWalletAddress:
    process.env.PAYMENT_WALLET_ADDRESS || "0xF3aAD2304F711ad5f400Ad322442D67DeD3E8A25",
  paymentPriceUsd: process.env.PAYMENT_PRICE_USD || "0.010000",
  contactEmail: process.env.CONTACT_EMAIL || "contacto@zumnova.com.ar",
  docsUrl: process.env.DOCS_URL || "https://api.zumpay.com.ar/docs",
  usdcContractAddress:
    process.env.USDC_CONTRACT_ADDRESS || "0x3600000000000000000000000000000000000000",
  uniswapV4PoolManager:
    process.env.UNISWAP_V4_POOL_MANAGER || "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  uniswapV4ReservesLens:
    process.env.UNISWAP_V4_RESERVES_LENS || "0x0000001b173C3bbF3984D417d8614E3eed34865B",
  defaultUniswapFee: Number(process.env.DEFAULT_UNISWAP_FEE || 3000),
  defaultUniswapTickSpacing: Number(process.env.DEFAULT_UNISWAP_TICK_SPACING || 60),
  defaultUniswapHooks:
    process.env.DEFAULT_UNISWAP_HOOKS || "0x0000000000000000000000000000000000000000"
};

module.exports = { env };
