const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const request = require("request");

const HLSDownloader = require("./hlsdownloader").downloader;
const Aria2Api = require("aria2");
const PromisePool = require("es6-promise-pool");

const filelog = require("./filelog");

const puppeteer_engine = require("./puppeteer_engine");

const pathJoin = path.join;

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

function mkdirs(tmp_path) {
  if (exists(tmp_path)) {
    var stat = fs.statSync(tmp_path);
    if (stat.isFile()) {
      fs.unlinkSync(tmp_path);
    } else if (stat.isDirectory()) {
      return;
    }
  }

  var parent_path = path.dirname(tmp_path);
  if (parent_path && fs.existsSync(parent_path)) {
    mkdirs(parent_path);
  }

  fs.mkdirSync(tmp_path);
}

var _CONFIG = null;
if (process.argv.length > 2) {
  _CONFIG = require("./" + process.argv[2]);
} else {
  _CONFIG = require("./config");
}

const config = _CONFIG.configs || {};
const _log = filelog.NewLog("DownloadSrv");

const aria2 = new Aria2Api([
  {
    host: config.aria2_host || "localhost",
    port: config.aria2_port || 6800,
    secure: config.aria2_secure || false,
    secret: config.aria2_secret || "",
    path: config.aria2_path || "/jsonrpc"
  }
]);

function checkRequestApiKey(params) {
  var api_key = params.api_key || "";
  return !config.srv_api_key || config.srv_api_key == api_key;
}

function sendCallBack(url, params, idx) {
  idx = idx || 0;

  var options = {
    url: url,
    form: params
  };

  request.post(options, function (error, resp, body) {
    if (error || resp.statusCode != 200) {
      config.debug &&
        console.log(
          `CallBackError[${idx}]`,
          "url:" + url,
          "statusCode:" + resp.statusCode,
          error ? error.name + ": " + error.message : resp.statusCode
        );
      _log.WriteLog(
        `CallBackError[${idx}]`,
        "url:" + url,
        "statusCode:" + resp.statusCode,
        error ? error.name + ": " + error.message : resp.statusCode
      );
      idx < 10 &&
        setTimeout(function () {
          sendCallBack(url, params, idx + 1);
        }, 60 * 1000);
    } else {
      config.debug &&
        console.log(
          `CallBackSuccess[${idx}]`,
          "url:" + url,
          "statusCode:" + resp.statusCode,
          "body: " + body
        );
      _log.WriteLog(
        `CallBackSuccess[${idx}]`,
        "url:" + url,
        "statusCode:" + resp.statusCode,
        "body: " + body
      );
    }
    console.info(
      "url:" + url,
      "statusCode:" + resp.statusCode,
      "body: " + body
    );
  });
}

function returnHtmlSuccess(pathname, params, response, code, data) {
  code = code || 200;
  data = data || "OK";
  if (!response) {
    console.info(
      "HtmlSuccess",
      pathname,
      JSON.stringify(params),
      `content len: ${data.length}`
    );
    return;
  }

  response.writeHead(code, {
    "Content-Type": "text/html;charset=utf-8"
  });
  response.write(data);
  _log.WriteLog(
    "HtmlSuccess",
    pathname,
    JSON.stringify(params),
    `content len: ${data.length}`
  );
  return response.end();
}

function returnHtmlError(pathname, params, response, err) {
  if (!response) {
    console.error(
      "HtmlError",
      pathname,
      JSON.stringify(params),
      err.name || 'error',
      err.message
    );
    return;
  }

  response.writeHead(500, {
    "Content-Type": "text/html;charset=utf-8"
  });
  response.write(`<h2>Error: ${err.message}</h2>`);
  _log.WriteLog(
    "HtmlError",
    pathname,
    JSON.stringify(params),
    err.name || 'error',
    err.message
  );
  return response.end();
}

function returnApiSuccess(pathname, params, response, msg, data) {
  msg = msg || "ok";
  data = data || {};
  if (!response) {
    console.info(
      "ApiSuccess",
      pathname,
      JSON.stringify(params),
      JSON.stringify(data)
    );
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/json"
  });
  response.write(
    JSON.stringify({
      code: 0,
      msg: msg,
      data: data
    })
  );
  _log.WriteLog(
    "ApiSuccess",
    pathname,
    JSON.stringify(params),
    // JSON.stringify(data)
  );
  return response.end();
}

function returnApiError(pathname, params, response, err) {
  if (!response) {
    console.error(
      "ApiError",
      pathname,
      JSON.stringify(params),
      err.name,
      err.message
    );
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/json"
  });
  response.write(
    JSON.stringify({
      code: 500,
      msg: err.message,
      err: {
        name: err.name,
        message: err.message
      }
    })
  );
  _log.WriteLog(
    "ApiError",
    pathname,
    JSON.stringify(params),
    err.name,
    err.message
  );
  return response.end();
}

function aria2DownloadUrls(urls, tmp_path, success) {
  if (urls.length == 0) {
    typeof success == "function" && success(urls);
    return;
  }
  var urls_ = JSON.parse(JSON.stringify(urls));

  _log.WriteLog("aria2DownloadUrls", JSON.stringify(urls));

  var delayValue = function (url) {
    var timer = null;
    return new Promise((resolve, reject) => {
      var arr = url.split("?")[0].split("/");
      var filename = pathJoin(tmp_path, arr[arr.length - 1]);
      var s = isFile(filename);
      if (s > 0) {
        config.debug && console.log("aria2 isFile", url, filename);
        _log.WriteLog("aria2DownloadUrls isFile", url, filename);
        resolve(filename);
        return;
      }

      if (s == 0) {
        fs.unlinkSync(filename);
      }

      aria2
        .call("addUri", [url], {
          dir: tmp_path
        })
        .then(guid => {
          if (!guid) {
            reject(url);
          }
          config.debug && console.log("aria2 addUri", guid, url, tmp_path);
          _log.WriteLog("aria2DownloadUrls addUri", url, guid);

          timer = setInterval(function () {
            aria2
              .call("tellStatus", guid)
              .then(function (obj) {
                if (obj.status == "complete") {
                  config.debug &&
                    console.log("aria2 complete", guid, url, tmp_path);
                  timer && clearInterval(timer);
                  resolve(obj.totalLength || 0);
                }
              })
              .catch(err => {
                var s = isFile(filename);
                if (s > 0) {
                  config.debug &&
                    console.log("aria2 isFile", guid, url, filename);
                  _log.WriteLog(
                    "aria2DownloadUrls isFile",
                    guid,
                    url,
                    filename
                  );
                  timer && clearInterval(timer);
                  resolve(s);
                }
              });
          }, 5000);
        })
        .catch(err => {
          reject(err);
        });
    });
  };

  var promiseProducer = function () {
    while (urls_.length) {
      var url = urls_.pop();
      if (url) {
        return delayValue(url);
      }
    }
    return null;
  };

  var pool = new PromisePool(promiseProducer, 10);

  pool.addEventListener("rejected", function (event) {
    // The event contains:
    // - target:    the PromisePool itself
    // - data:
    //   - promise: the Promise that got rejected
    //   - error:   the Error for the rejection
    console.error("Rejected: " + event.data.error);
    _log.WriteLog(
      "aria2DownloadUrls rejected",
      JSON.stringify(event.data.error)
    );
  });

  pool.start().then(function () {
    console.info("aria2DownloadUrls success", urls.length);
    _log.WriteLog("aria2DownloadUrls success", JSON.stringify(urls));
    typeof success == "function" && success(urls);
  });
}

function downloadM3U8(pathname, params, response) {
  var m3u8_url = params.file_url || "";
  var m3u8_file = params.m3u8_file || "";
  var notify_url = params.notify_url || "";
  var tmp_path = params.tmp_path || "";
  var stream_id = params.stream_id || "";

  try {
    new HLSDownloader({
      playlistURL: m3u8_url,
      playlistFile: m3u8_file,
      destination: tmp_path
    }).startGetM3u8List((err, msg) => {
      if (err) {
        console.error(
          "M3u8DownErr",
          m3u8_url,
          tmp_path,
          err.name + ": " + err.message,
          JSON.stringify(msg)
        );
        _log.WriteLog(
          "M3u8DownErr",
          m3u8_url,
          tmp_path,
          err.name + ": " + err.message,
          JSON.stringify(msg)
        );
      } else {
        console.info("M3u8DownSuc", m3u8_url, tmp_path, JSON.stringify(msg));
        _log.WriteLog("M3u8DownSuc", m3u8_url, tmp_path, JSON.stringify(msg));
      }

      mkdirs(tmp_path);

      msg &&
        msg.errors &&
        setTimeout(function () {
          // 使用 error 传递所有 ts 列表
          aria2DownloadUrls(msg.errors || [], tmp_path, function () {
            sendCallBack(notify_url, {
              fileDir: tmp_path,
              stream_id: stream_id
            });
          });
        }, 0);
    });
  } catch (err) {
    return returnApiError(pathname, params, response, err);
  }

  return returnApiSuccess(pathname, params, response);
}

function downloadMp4(pathname, params, response) {
  var mp4_url = params.file_url || "";
  var notify_url = params.notify_url || "";
  var tmp_path = params.tmp_path || "";
  var stream_id = params.stream_id || "";

  try {
    aria2DownloadUrls([mp4_url], tmp_path, () => {
      sendCallBack(notify_url, {
        fileDir: tmp_path,
        stream_id: stream_id
      });
    });
  } catch (err) {
    return returnApiError(pathname, params, response, err);
  }

  return returnApiSuccess(pathname, params, response, "add success");
}

var app = http.createServer(function (request, response) {
  var req = url.parse(request.url),
    pathname = req.pathname,
    filename = path.join(process.cwd(), "docs", pathname),
    params = url.parse(decodeURI(request.url), true).query;

  if (pathname.substr(0, 5) == "/api/" && !checkRequestApiKey(params)) {
    return returnApiError(pathname, params, response, {
      name: "ErrorApiKey",
      message: "error api key"
    });
  }

  if (pathname == "/api/downloadM3U8") {
    downloadM3U8(pathname, params, response);
    return;
  } else if (pathname == "/api/downloadMp4") {
    downloadMp4(pathname, params, response);
    return;
  }

  var pre = "/puppet/";
  if (pathname.substr(0, pre.length) == pre) {
    puppeteer_engine.process_api(pathname.substr(pre.length), params, (data, msg) => {
      returnApiSuccess(pathname, params, response, msg, data)
    }, err => {
      returnApiError(pathname, params, response, err)
    });
    return;
  }

  pre = "/phtml/";
  if (pathname.substr(0, pre.length) == pre) {
    puppeteer_engine.process_api(pathname.substr(pre.length), params, (data, code) => {
      returnHtmlSuccess(pathname, params, response, code, data)
    }, err => {
      returnHtmlError(pathname, params, response, err)
    });
    return;
  }

  var extname = path.extname(filename);
  var contentType = "text/html";
  switch (extname) {
    case ".js":
      contentType = "text/javascript";
      break;
    case ".css":
      contentType = "text/css";
      break;
    case ".ico":
      contentType = "image/x-icon";
      break;
    case ".svg":
      contentType = "image/svg+xml";
      break;
  }

  fs.exists(filename, function (exists) {
    if (!exists) {
      response.writeHead(404, {
        "Content-Type": "text/plain"
      });
      response.write("404 Not Found\n");
      response.end();
      return;
    }

    if (fs.statSync(filename).isDirectory()) filename += "/index.html";

    fs.readFile(filename, "binary", function (err, file) {
      if (err) {
        response.writeHead(500, {
          "Content-Type": "text/plain"
        });
        response.write(err + "\n");
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": contentType
      });
      response.write(file, "binary");
      response.end();
    });
  });
});

app.listen(config.srv_port);

console.log(
  "WebUI Aria2 Server is running on http://localhost:" + config.srv_port
);
