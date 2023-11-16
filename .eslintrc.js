const ecmConfig = require("@eliasm307/config/eslint")({
  withReact: false,
  withPrettier: true,
});

module.exports = {
  ...ecmConfig,
};
