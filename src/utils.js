var Promise = require('bluebird');
var request = require('request');
var RestClient = require('rest-facade').Client;
var util = require('util');
var url = require('url');
var cache = require('memory-cache');


/**
 * @module utils
 */
var utils = module.exports = {};


/**
 * Given a JSON string, convert it to its base64 representation.
 *
 * @method    jsonToBase64
 * @memberOf  module:utils
 */
utils.jsonToBase64 = function (json) {
  var bytes = new Buffer(JSON.stringify(json));

  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};


/**
 * Simple wrapper that, given a class, a property name and a method name,
 * creates a new method in the class that is a wrapper for the given
 * property method.
 *
 * @method    wrapPropertyMethod
 * @memberOf  module:utils
 */
utils.wrapPropertyMethod = function (Parent, name, propertyMethod) {
  var path = propertyMethod.split('.');
  var property = path.shift();
  var method = path.pop();

  Object.defineProperty(Parent.prototype, name, {
    enumerable: false,
    get: function () {
      return this[property][method].bind(this[property]);
    }
  });
};


/**
 * Perform a request with the given settings and return a promise that resolves
 * when the request is successful and rejects when there's an error.
 *
 * @method    getRequestPromise
 * @memberOf  module:utils
 */
utils.getRequestPromise = function (settings) {
  return new Promise(function (resolve, reject) {
    request({
      url: settings.url,
      method: settings.method,
      body: settings.data,
      json: typeof settings.data === 'object',
      headers: settings.headers
    }, function (err, res, body) {
       if (err) {
        reject(err);
        return;
      }

      resolve(res.body);
    });

  });
};

utils.OAuthRestClient = function (resourceUrl, options) {
  this.resourceUrl = resourceUrl;
  this.options = options;
  this.options.headers = this.options.headers || {};
  RestClient.apply(this, arguments);
};

util.inherits(utils.OAuthRestClient, RestClient);

utils.cache = cache; // Expose cache for tests

function getOAuthToken(audience, endpoint, clientId, clientSecret, callback) {
  var cached = cache.get(clientId);
  if (cached) {
    callback(null, cached);
  } else {
    throw 'OH SHIT';
    request.post({
      url: endpoint,
      json: {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience: audience
      }
    }, function (err, res, body) {
      if (err || res.statusCode !== 200) {
        callback(err);
      } else {
        cache.put(clientId, body.expires_in || 86400 * 1000);
        callback(null, body.access_token);
      }
    })
  }
}

var getOAuthTokenPromise = Promise.promisify(getOAuthToken);

utils.OAuthRestClient.prototype.request = function (options, params, callback) {
  var self = this;
  var parsedUrl = url.parse(options.url);
  var audience = 'https://' + url.hostname + '/api/v2/';
  var endpoint = 'https://' + url.hostname + '/oauth/token';
  // TODO: Refactor this
  return new Promise(function (resolve, reject) {
    getOAuthToken(audience, endpoint, self.options.clientId, self.options.clientSecret, function (err, token) {
      if (err) {
        if (callback) { callback(err); }
        reject(err);
      } else {
        RestClient.prototype.request.call(self, options, params, function (err, body) {
          if (err) {
            if (callback) { callback(err); }
            reject(err);
          } else{
            if (callback) { callback(null, body); }
            resolve(body);
          }
        })
      }
    })
  });
};
