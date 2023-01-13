/* eslint-disable standard/no-callback-literal, node/no-deprecated-api */
const each = require("async/each");
const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");
const dirname = path.dirname;
const request = require("request-promise");
const url = require("url");
const parse = url.parse;
const resolve = url.resolve;

/**
 * @description Validate a Playlist
 * @param {string} playlistContent
 * @returns {boolean}
 */
function isValidPlaylist(playlistContent) {
  return playlistContent.match(/^#EXTM3U/im) !== null;
}

/**
 * @description Validate a URL
 * @param {string} url URL to validate
 * @returns {boolean}
 */
function validateURL(url) {
  var urlRegex = new RegExp(
    "^" +
      // protocol identifier
      "(?:(?:https?)://)" +
      // user:pass authentication
      "(?:\\S+(?::\\S*)?@)?" +
      "(?:" +
      // IP address exclusion
      // private & local networks
      "(?!(?:10|127)(?:\\.\\d{1,3}){3})" +
      "(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})" +
      "(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +
      // IP address dotted notation octets
      // excludes loopback network 0.0.0.0
      // excludes reserved space >= 224.0.0.0
      // excludes network & broacast addresses
      // (first & last IP address of each class)
      "(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" +
      "(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" +
      "(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" +
      "|" +
      // host name
      "(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)" +
      // domain name
      "(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*" +
      // TLD identifier
      "(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))" +
      ")" +
      // port number
      "(?::\\d{2,5})?" +
      // resource path
      "(?:/\\S*)?" +
      "$",
    "i"
  );

  return urlRegex.test(url);
}

/**
 * Strip first slash from a url
 * @param  {String} url URL to strip the slash
 * @return {String} Stripped url
 */
function stripFirstSlash(url) {
  return url.substr(0, 1).replace("/", "") + url.substring(1);
}

/**
 * HLSDownloader Class
 */
class HLSDownloader {
  /**
   * @constructor HLSParser
   * @param  {Object} playlistInfo playlist information to download
   * @return {Object} Error object if any required piece is missing
   */
  constructor({
    playlistURL = "",
    playlistFile = "",
    destination = null,
    method,
    uri,
    url,
    transform,
    resolveWithFullResponse,
    baseUrl,
    form,
    formData,
    preambleCRLF,
    postambleCRLF,
    json,
    jsonReviver,
    jsonReplacer,
    ...options
  } = {}) {
    if (!validateURL(playlistURL)) {
      const error = new Error();
      error.message =
        "playListURL is required " + "or check if your URL is valid or not!!";
      error.name = "ERR_VALIDATION";
      throw error;
    }
    this.playlistURL = playlistURL;
    this.playlistFile = playlistFile;
    this.destination = destination;
    this.options = options;
    this.hostName = parse(playlistURL, true, true).hostname;
    this.items = [];
    this.errors = [];
    this.map = {};
  }

  /**
   * @description initiate download
   * @method {function} startDownload
   * @param {function} callback
   */
  startDownload(callback) {
    return this.getPlaylist(callback);
  }

  /**
   * @description initiate download
   * @method {function} startDownload
   * @param {function} callback
   */
  startGetM3u8List(callback) {
    return this.getM3u8list(callback);
  }

  getM3u8list(callback) {
    function exists(path) {
      return fs.existsSync(path);
    }

    function isFile(file_path) {
      if (!exists(file_path)) {
        return -1;
      }
      var stat = fs.statSync(file_path);
      return stat.isFile() ? stat.size : -1;
    }

    if (this.playlistFile && isFile(this.playlistFile) > 0) {
      fs.readFile(this.playlistFile, (err, body) => {
        body = body.toString("utf8");
        if (err) {
          const error = new Error("VariantReadFileError");
          error.file = this.playlistFile;
          error.err = err;
          return callback(error);
        }

        if (!isValidPlaylist(body)) {
          return callback(
            new Error("This playlist isn't a valid m3u8 playlist")
          );
        }

        this.items.push(this.playlistURL);
        this.parseMasterM3u8Playlist(body, callback);
      });
      return;
    }
    const options = {
      ...this.options,
      method: "GET",
      uri: this.playlistURL
    };
    request(options)
      .then(body => {
        if (!isValidPlaylist(body)) {
          return callback(
            new Error("This playlist isn't a valid m3u8 playlist")
          );
        }

        this.items.push(this.playlistURL);
        this.parseMasterM3u8Playlist(body, callback);
      })
      .catch(err => {
        if (err) {
          const error = new Error("VariantDownloadError");
          error.statusCode = err.statusCode;
          error.uri = options.uri;
          error.err = err;
          return callback(error);
        }
      });
  }

  /**
   * @description Parse master playlist content
   * @method parseMasterPlaylist
   * @param {string} playlistContent
   * @param {function} callback
   */
  parseMasterM3u8Playlist(playlistContent, callback) {
    if (playlistContent.match(/^#EXT-X-TARGETDURATION:\d+/im)) {
      this.parseVariantPlaylist(playlistContent);
      this.addM3u8Items(callback);
    } else {
      try {
        const replacedPlaylistContent = playlistContent.replace(
          /^#[\s\S].*/gim,
          ""
        );
        const variants = replacedPlaylistContent
          .split("\n")
          .filter(item => item !== "");

        let errorCounter = 0;
        const variantCount = variants.length;

        each(
          variants,
          (item, cb) => {
            const variantUrl = resolve(this.playlistURL, item);
            const options = {
              ...this.options,
              method: "GET",
              uri: variantUrl
            };
            request(options)
              .then(body => {
                if (isValidPlaylist(body)) {
                  this.items.push(variantUrl);
                  this.parseVariantPlaylist(body);
                  return cb(null);
                }
              })
              .catch(err => {
                this.errors.push(err.options.uri);

                // check if all variants has error
                if (err && ++errorCounter === variantCount) {
                  return cb(true);
                }

                return cb(null);
              });
          },
          err =>
            err
              ? callback({
                  playlistURL: this.playlistURL,
                  message:
                    "No valid Downloadable variant exists in master playlist"
                })
              : this.addM3u8Items(callback)
        );
      } catch (exception) {
        // Catch any syntax error
        return callback(exception);
      }
    }
  }

  /**
   * @description Download indexed chunks and playlist.
   * @method downloadItems
   * @param {function} callback
   */
  addM3u8Items(callback) {
    each(
      this.items,
      (variantUrl, cb) => {
        this.errors.push(variantUrl);
        return cb(null);
      },
      err => {
        if (err) {
          return callback({
            playlistURL: this.playlistURL,
            message: "Internal Server Error from remote"
          });
        }

        if (this.errors.length > 0) {
          return callback(null, {
            message: "Download done with some errors",
            playlistURL: this.playlistURL,
            errors: this.errors,
            map: this.map
          });
        }

        return callback(null, {
          message: "Downloaded successfully",
          playlistURL: this.playlistURL
        });
      }
    );
  }

  /**
   * @description Download master playlist
   * @method getPlaylist
   * @param {function} callback
   */
  getPlaylist(callback) {
    const options = {
      ...this.options,
      method: "GET",
      uri: this.playlistURL
    };
    request(options)
      .then(body => {
        if (!isValidPlaylist(body)) {
          return callback(
            new Error("This playlist isn't a valid m3u8 playlist")
          );
        }

        this.items.push(this.playlistURL);
        this.parseMasterPlaylist(body, callback);
      })
      .catch(err => {
        if (err) {
          const error = new Error("VariantDownloadError");
          error.statusCode = err.statusCode;
          error.uri = err.options.uri;
          return callback(error);
        }
      });
  }

  /**
   * @description Parse master playlist content
   * @method parseMasterPlaylist
   * @param {string} playlistContent
   * @param {function} callback
   */
  parseMasterPlaylist(playlistContent, callback) {
    if (playlistContent.match(/^#EXT-X-TARGETDURATION:\d+/im)) {
      this.parseVariantPlaylist(playlistContent);
      this.downloadItems(callback);
    } else {
      try {
        const replacedPlaylistContent = playlistContent.replace(
          /^#[\s\S].*/gim,
          ""
        );
        const variants = replacedPlaylistContent
          .split("\n")
          .filter(item => item !== "");

        let errorCounter = 0;
        const variantCount = variants.length;

        each(
          variants,
          (item, cb) => {
            const variantUrl = resolve(this.playlistURL, item);
            const options = {
              ...this.options,
              method: "GET",
              uri: variantUrl
            };
            request(options)
              .then(body => {
                if (isValidPlaylist(body)) {
                  this.items.push(variantUrl);
                  this.parseVariantPlaylist(body);
                  return cb(null);
                }
              })
              .catch(err => {
                this.errors.push(err.options.uri);

                // check if all variants has error
                if (err && ++errorCounter === variantCount) {
                  return cb(true);
                }

                return cb(null);
              });
          },
          err =>
            err
              ? callback({
                  playlistURL: this.playlistURL,
                  message:
                    "No valid Downloadable variant exists in master playlist"
                })
              : this.downloadItems(callback)
        );
      } catch (exception) {
        // Catch any syntax error
        return callback(exception);
      }
    }
  }

  /**
   * @description Parse variant playlist content and index the TS chunk to download.
   * @method parseVariantPlaylist
   * @param {string} variantPath
   * @param {string} playlistContent
   */
  parseVariantPlaylist(playlistContent) {
    const items = playlistContent.split("\n");
    var last = "";
    for (const item of items) {
      const fix = item.replace(/^#[\s\S].*/gim, "");
      if (fix !== "") {
        var url = resolve(this.playlistURL, fix);
        this.items.push(url);
        this.map[url] = last;
      }
      last = item;
    }
  }

  /**
   * @description Download indexed chunks and playlist.
   * @method downloadItems
   * @param {function} callback
   */
  downloadItems(callback) {
    each(
      this.items,
      (variantUrl, cb) => {
        const options = {
          ...this.options,
          method: "GET",
          uri: variantUrl
        };
        request(options)
          .then(downloadedItem => {
            if (
              this.destination !== null &&
              this.destination !== "" &&
              this.destination !== "undefined"
            ) {
              return this.createItems(variantUrl, downloadedItem, cb);
            }
            downloadedItem = null;
            return cb();
          })
          .catch(err => {
            this.errors.push(err.options.uri);
            return cb(null);
          });
      },
      err => {
        if (err) {
          return callback({
            playlistURL: this.playlistURL,
            message: "Internal Server Error from remote"
          });
        }

        if (this.errors.length > 0) {
          return callback(null, {
            message: "Download done with some errors",
            playlistURL: this.playlistURL,
            errors: this.errors
          });
        }

        return callback(null, {
          message: "Downloaded successfully",
          playlistURL: this.playlistURL
        });
      }
    );
  }

  /**
   * @description Download indexed chunks and playlist.
   * @method downloadItems
   * @param {function} callback
   */
  createItems(variantURL, content, cb) {
    const itemPath = parse(variantURL).pathname;
    const destDirectory = this.destination + dirname(itemPath);
    const filePath = this.destination + "/" + stripFirstSlash(itemPath);

    mkdirp(
      destDirectory,
      err => (err ? cb(err) : fs.writeFile(filePath, content, "binary", cb))
    );
  }
}

exports.downloader = HLSDownloader;
exports.default = HLSDownloader;
