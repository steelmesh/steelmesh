module.exports = function(nano, config) {
  return require('steelmesh-appsync')(nano.use(config.dbname), {
    targetPath: config.appsPath
  });
};
