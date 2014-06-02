module.exports = function(nano, nginx, config) {
  return require('steelmesh-appsync')(nano.use(config.dbname), {
    targetPath: config.appsPath
  });
};
