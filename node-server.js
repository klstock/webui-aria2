const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const request = require("request");

const HLSDownloader = require("hlsdownloader").downloader;
const Aria2Api = require("aria2");

const filelog = require("./filelog");

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

function sendCallBack(url, params) {
  var options = {
    url: url,
    form: params
  };

  request.post(options, function(error, response, body) {
    if (error) {
      _log.WriteLog(
        "CallBackError",
        "url:" + url,
        "statusCode:" + response.statusCode,
        error.name + ": " + error.message
      );
    } else {
      _log.WriteLog(
        "CallBackSuccess",
        "url:" + url,
        "statusCode:" + response.statusCode,
        "body: " + body
      );
    }
    console.info("url:" + url);
    console.info("statusCode:" + response.statusCode);
    console.info("body: " + body);
  });
}

function returnApiSuccess(pathname, response, msg, data) {
  msg = msg || "success";
  data = data || {};

  response.writeHead(200, {
    "Content-Type": "application/json"
  });
  response.write(
    JSON.stringify({
      code: 0,
      msg: "success",
      data: data
    })
  );
  _log.WriteLog("ApiSuccess", pathname, JSON.stringify(data));
  return response.end();
}

function returnApiError(pathname, response, err) {
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
  _log.WriteLog("ApiError", pathname, err.name, err.message);
  return response.end();
}

function aria2DownloadUrls(urls, tmp_path, success, failure) {
  if (urls.length == 0) {
    typeof success == "function" && success(urls);
    return;
  }
  _log.WriteLog("aria2DownloadUrls", JSON.stringify(urls));

  Promise.all(
    urls.map(url => {
      return new Promise((resolve, reject) => {
        guid = aria2
          .call("addUri", [url], {
            dir: tmp_path
          })
          .then(guid => {
            if (!guid) {
              reject(url);
            }
            _log.WriteLog("aria2DownloadUrls addUri", url, guid);

            timer = setInterval(async function() {
              var obj = await aria2.call("tellStatus", guid);
              if (obj.status == "complete") {
                _log.WriteLog("aria2DownloadUrls complete", url, guid);
                timer && clearInterval(timer);
                resolve(url);
              }
            }, 5000);
          })
          .catch(err => {
            reject(url);
          });
      });
    })
  )
    .then(urls => {
      _log.WriteLog("downloadMp4 success", JSON.stringify(urls));
      typeof success == "function" && success(urls);
    })
    .catch(urls => {
      _log.WriteLog("downloadMp4 failure", JSON.stringify(urls));
      typeof failure == "function" && failure(urls);
    });
}

async function downloadM3U8(pathname, params, response) {
  var m3u8_url = params.file_url || "";
  var notify_url = params.notify_url || "";
  var tmp_path = params.tmp_path || "";
  var stream_id = params.stream_id || "";

  try {
    const downloader = new HLSDownloader({
      playlistURL: m3u8_url,
      destination: tmp_path
    });
    downloader.startDownload((err, msg) => {
      if (err) {
        _log.WriteLog(
          "M3u8DownErr",
          m3u8_url,
          tmp_path,
          error.name + ": " + error.message,
          JSON.stringify(msg)
        );
      } else {
        _log.WriteLog("M3u8DownSuc", m3u8_url, tmp_path, JSON.stringify(msg));
      }

      if (msg.errors && msg.errors.length > 0) {
        aria2DownloadUrls(msg.errors, tmp_path, () => {
          sendCallBack(notify_url, {
            fileDir: tmp_path,
            stream_id: stream_id
          });
        });
      } else {
        sendCallBack(notify_url, {
          fileDir: tmp_path,
          stream_id: stream_id
        });
      }
    });
  } catch (err) {
    return returnApiError(pathname, response, err);
  }

  return returnApiSuccess(pathname, response);
}

async function downloadMp4(pathname, params, response) {
  var mp4_url = params.file_url || "";
  var notify_url = params.notify_url || "";
  var tmp_path = params.tmp_path || "";
  var stream_id = params.stream_id || "";
  var guid = "";
  var timer = null;

  try {
    guid = await aria2.call("addUri", [mp4_url], {
      dir: tmp_path
    });
    if (!guid) {
      return returnApiError(pathname, response, {
        name: "EmptyGuid",
        message: "empty guid with aria2"
      });
    }
    _log.WriteLog("downloadMp4 addUri", mp4_url, guid);

    timer = setInterval(async function() {
      var obj = await aria2.call("tellStatus", guid);
      if (obj.status == "complete") {
        _log.WriteLog("downloadMp4 complete", mp4_url, guid);
        timer && clearInterval(timer);
        sendCallBack(notify_url, {
          fileDir: tmp_path,
          stream_id: stream_id
        });
      }
    }, 5000);
  } catch (err) {
    return returnApiError(pathname, response, err);
  }

  return returnApiSuccess(pathname, response, "add success", {
    guid: guid
  });
}

http
  .createServer(async function(request, response) {
    var req = url.parse(request.url),
      pathname = req.pathname,
      filename = path.join(process.cwd(), "docs", pathname),
      params = url.parse(decodeURI(request.url), true).query;

    if (pathname.substr(0, 5) == "/api/" && !checkRequestApiKey(params)) {
      return returnApiError(pathname, response, {
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

    fs.exists(filename, function(exists) {
      if (!exists) {
        response.writeHead(404, {
          "Content-Type": "text/plain"
        });
        response.write("404 Not Found\n");
        response.end();
        return;
      }

      if (fs.statSync(filename).isDirectory()) filename += "/index.html";

      fs.readFile(filename, "binary", function(err, file) {
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
  })
  .listen(config.srv_port);

console.log(
  "WebUI Aria2 Server is running on http://localhost:" + config.srv_port
);
