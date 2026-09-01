// Every date assertion in this package runs in one zone and one
// locale-independent clock, whatever the developer's machine says
module.exports = async () => {
  process.env.TZ = 'UTC';
};
