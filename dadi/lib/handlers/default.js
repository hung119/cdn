const Cache = require('./../cache')
const config = require('./../../../config')
const help = require('./../help')
const mime = require('mime')
const path = require('path')
const StorageFactory = require('./../storage/factory')
const url = require('url')

/**
 * Creates a new DefaultHandler instance.
 *
 * @param {String} format The extension of the file being handled
 * @param {Object} req    The request instance
 */
const DefaultHandler = function (format, req, {
  options = {}
} = {}) {
  this.legacyURLOverrides = this.getLegacyURLOverrides(req.url)
  this.options = options
  this.url = url.parse(
    this.legacyURLOverrides.url || req.url,
    true
  )

  this.cache = Cache()
  this.cacheKey = [req.__domain, this.url.href]

  this.req = req

  this.storageFactory = Object.create(StorageFactory)
  this.storageHandler = null
}

/**
 * Retrieves a file for a given URL path.
 *
 * @return {Promise} A stream with the file
 */
DefaultHandler.prototype.get = function () {
  return this.cache.getStream(this.cacheKey, {
    ttl: config.get('caching.ttl', this.req.__domain)
  }).then(stream => {
    if (stream) {
      this.isCached = true

      return stream
    }

    this.storageHandler = this.storageFactory.create(
      'asset',
      this.url.pathname.slice(1),
      {domain: this.req.__domain}
    )

    return this.storageHandler.get().then(stream => {
      return this.cache.cacheFile(stream, this.cacheKey, {
        ttl: config.get('caching.ttl', this.req.__domain)
      })
    })
  }).then(stream => {
    return help.streamToBuffer(stream)
  })
}

/**
 * Returns the content type for the files handled.
 *
 * @return {String} The content type
 */
DefaultHandler.prototype.getContentType = function () {
  let newUrl = this.url.pathname

  if (this.storageHandler && this.storageHandler.url !== newUrl) {
    newUrl = this.storageHandler.url
  }

  if (path.extname(newUrl) === '') {
    return 'text/html'
  }

  return mime.lookup(newUrl)
}

/**
 * Returns the filename for the given request.
 *
 * @return {String} The filename
 */
DefaultHandler.prototype.getFilename = function () {
  return this.url.pathname.split('/').slice(-1)[0]
}

/**
 * Returns the last modified date for the asset.
 *
 * @return {Number} The last modified timestamp
 */
DefaultHandler.prototype.getLastModified = function () {
  if (!this.storageHandler || !this.storageHandler.getLastModified) return null

  return this.storageHandler.getLastModified()
}

/**
 * Looks for parameters in the URL using legacy syntax
 * (e.g. /fonts/0/file.css)
 *
 * @param  {String} url The URL
 * @return {Object}     A list of parameters and their value
 */
DefaultHandler.prototype.getLegacyURLOverrides = function (url) {
  let overrides = {}

  const legacyURLMatch = url.match(/\/fonts(\/(\d))?/)

  if (legacyURLMatch) {
    overrides.url = url.slice(legacyURLMatch[0].length)
  }

  return overrides
}

/**
 * Sets the base URL (excluding any recipe or route nodes)
 */
DefaultHandler.prototype.setBaseUrl = function (baseUrl) {
  this.url = url.parse(baseUrl, true)
}

module.exports = function (format, request, handlerData) {
  return new DefaultHandler(format, request, handlerData)
}

module.exports.DefaultHandler = DefaultHandler
