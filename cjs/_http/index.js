'use strict'

Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.default = HttpClient

var _http = _interopRequireDefault(require('http2'))

var _package = _interopRequireDefault(require('../../package.json'))

var _util = require('../_util')

var _fetchAdapter = _interopRequireDefault(require('./fetchAdapter'))

var _http2Adapter = _interopRequireDefault(require('./http2Adapter'))

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj }
}

/**
 * The driver's internal HTTP client.
 *
 * @constructor
 * @param {Object} options Same as the {@link Client} options.
 * @private
 */
function HttpClient(options) {
  var isHttps = options.scheme === 'https' // If the port is a falsy value - replace it with default one.

  if (!options.port) {
    options.port = isHttps ? 443 : 80
  } // HTTP2 adapter is applicable only if it's NodeJS env and
  // no fetch API override provided (to preserve backward-compatibility).

  var useHttp2Adapter =
    !options.fetch && (0, _util.isNodeEnv)() && _http.default

  this._adapter = useHttp2Adapter
    ? new _http2Adapter.default()
    : new _fetchAdapter.default({
        isHttps: isHttps,
        fetch: options.fetch,
        keepAlive: options.keepAlive,
      })
  this._baseUrl = options.scheme + '://' + options.domain + ':' + options.port
  this._secret = options.secret
  this._headers = Object.assign({}, options.headers, getDefaultHeaders())
  this._queryTimeout = options.queryTimeout
  this._lastSeen = null
  this._timeout = Math.floor(options.timeout * 1000)
}
/**
 * Returns last seen transaction time.
 *
 * @returns {number} The last seen transaction time.
 */

HttpClient.prototype.getLastTxnTime = function() {
  return this._lastSeen
}
/**
 * Sets the last seen transaction if the given timestamp is greater than then
 * know last seen timestamp.
 *
 * @param {number} time transaction timestamp.
 */

HttpClient.prototype.syncLastTxnTime = function(time) {
  if (this._lastSeen == null || this._lastSeen < time) {
    this._lastSeen = time
  }
}
/**
 * Executes an HTTP request.
 *
 * @param {?object} options Request parameters.
 * @param {?string} options.method Request method.
 * @param {?string} options.path Request path.
 * @param {?string} options.body Request body.
 * @param {?object} options.query Request query.
 * @params {?object} options.streamConsumer Stream consumer, if presented
 * the request will be "streamed" into streamConsumer.onData function.
 * @params {function} options.streamConsumer.onData Function called with a chunk of data.
 * @params {function} options.streamConsumer.onError Function called
 * when an error occurred.
 * when the stream is ended.
 * @param {?object} options.signal Abort signal object.
 * @param {?object} options.fetch Fetch API compatible function.
 * @param {?object} options.secret FaunaDB secret.
 * @param {?object} options.queryTimeout FaunaDB query timeout.
 * @returns {Promise} The response promise.
 */

HttpClient.prototype.execute = function(options) {
  options = options || {}
  var invalidStreamConsumer =
    options.streamConsumer &&
    (typeof options.streamConsumer.onData !== 'function' ||
      typeof options.streamConsumer.onError !== 'function')

  if (invalidStreamConsumer) {
    return Promise.reject(new TypeError('Invalid "streamConsumer" provided'))
  }

  var secret = options.secret || this._secret
  var queryTimeout = options.queryTimeout || this._queryTimeout
  var headers = this._headers
  headers['Authorization'] = secret && secretHeader(secret)
  headers['X-Last-Seen-Txn'] = this._lastSeen
  headers['X-Query-Timeout'] = queryTimeout
  return this._adapter.execute({
    origin: this._baseUrl,
    path: options.path || '/',
    query: options.query,
    method: options.method || 'GET',
    headers: (0, _util.removeNullAndUndefinedValues)(headers),
    body: options.body,
    signal: options.signal,
    timeout: this._timeout,
    streamConsumer: options.streamConsumer,
  })
}

function secretHeader(secret) {
  return 'Bearer ' + secret
}
/** @ignore */

function getDefaultHeaders() {
  var driverEnv = {
    driver: ['javascript', _package.default.version].join('-'),
  }
  var isServiceWorker

  try {
    // eslint-disable-next-line no-undef
    isServiceWorker = global instanceof ServiceWorkerGlobalScope
  } catch (error) {
    isServiceWorker = false
  }

  try {
    if ((0, _util.isNodeEnv)()) {
      driverEnv.runtime = ['nodejs', process.version].join('-')
      driverEnv.env = (0, _util.getNodeRuntimeEnv)()

      var os = require('os')

      driverEnv.os = [os.platform(), os.release()].join('-')
    } else if (isServiceWorker) {
      driverEnv.runtime = 'Service Worker'
    } else {
      driverEnv.runtime = (0, _util.getBrowserDetails)()
      driverEnv.env = 'browser'
      driverEnv.os = (0, _util.getBrowserOsDetails)()
    }
  } catch (_) {}

  var headers = {
    'X-FaunaDB-API-Version': _package.default.apiVersion,
  } // TODO: api cors must be enabled to accept header X-Driver-Env

  if ((0, _util.isNodeEnv)()) {
    headers['X-Driver-Env'] = Object.keys(driverEnv)
      .map(key => [key, driverEnv[key].toLowerCase()].join('='))
      .join('; ')
  }

  return headers
}
