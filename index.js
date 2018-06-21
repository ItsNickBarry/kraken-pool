const KrakenClient = require('kraken-api');

const DEFAULT_COOLDOWN = 3000;

var KrakenPool = function (key, secret, options) {
  var keys;

  // ensure that keys is a 2-dimensional array
  if (Array.isArray(key)) {
    options = secret;
    keys = Array.isArray(key[0]) ? key : [key];
  } else {
    keys = [[key, secret]];
  }

  this._krakens = keys.map(function (keypair) {
    return new KrakenClient(keypair[0], keypair[1], options);
  });

  this._rateLimitCounter = 0;
  this._jobQueue = [];

  var rateLimitCooldown;

  if (options) {
    rateLimitCooldown = options.rateLimitCooldown || DEFAULT_COOLDOWN;
    delete options.rateLimitCooldown;
  } else {
    rateLimitCooldown = DEFAULT_COOLDOWN;
  }

  setInterval(function () {
    if (this._rateLimitCounter > 0) {
      this._rateLimitCounter--;
    }
  }.bind(this), rateLimitCooldown);
};

KrakenPool.prototype.api = function (route, options, callback) {
  var kraken = this._krakens.shift();

  if (kraken) {
    this._incrementCallCounter(route);
    kraken.api(route, options, function (error, data) {
      callback(error, data);
      this._krakens.push(kraken);
      this._runPendingJob();
    }.bind(this));
  } else {
    this._jobQueue.push((() => { this.api(route, options, callback) }).bind(this));
  }
};

KrakenPool.prototype.getAvailableClientCount = function () {
  return this._krakens.length;
};

KrakenPool.prototype.getRateLimitCounter = function () {
  return this._rateLimitCounter;
};

KrakenPool.prototype._incrementCallCounter = function (route) {
  switch (route) {
    case 'AddOrder':
    case 'CancelOrder':
      break;
    case 'Ledgers':
    case 'TradesHistory':
    case 'QueryLedgers':
      this._rateLimitCounter += 2;
      break;
    default:
      this._rateLimitCounter += 1;
  }
};

KrakenPool.prototype._runPendingJob = function () {
  var job = this._jobQueue.shift();
  job && job();
};

module.exports = KrakenPool;
