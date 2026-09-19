const { paymentMetadata } = require("../config/payment");

function requirePayment(req, res, next) {
  const paymentHeader = req.get("x-payment");
  const authorizationHeader = req.get("authorization");

  if (!paymentHeader && !authorizationHeader) {
    return res.status(402).json(paymentMetadata);
  }

  return next();
}

module.exports = { requirePayment };
