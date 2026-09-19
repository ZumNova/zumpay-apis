require("dotenv").config();

const app = require("./app");
const { env } = require("./config/env");

app.listen(env.port, () => {
  console.log(`Zumpay Arc API listening on port ${env.port}`);
});
