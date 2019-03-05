var http = require("http"),
  url = require("url"),
  path = require("path"),
  fs = require("fs"),
  request = require("request");
const HLSDownloader = require("hlsdownloader").downloader;
const Aria2 = require("aria2");
const aria2 = new Aria2([
  {
    host: "localhost",
    port: 6800,
    secure: false,
    secret: "",
    path: "/jsonrpc"
  }
]);
port = process.argv[2] || 8888;

async function downloadM3U8(param, response) {
  var m3u8_url = param.file_url ? param.file_url : "";
  var notify_url = param.notify_url ? param.notify_url : "";
  var tmp_path = param.tmp_path ? param.tmp_path : "";
  var stream_id = param.stream_id ? param.stream_id : "";

  try {
    const params = {
      playlistURL: m3u8_url, // change it
      destination: tmp_path // change it (optional field)
    };
    const downloader = new HLSDownloader(params);
    downloader.startDownload((err, msg) => {
      console.log(msg, "m3u8");
      if (msg.errors == undefined) {
        setCallBack(notify_url, {
          fileDir: tmp_path,
          stream_id: stream_id
        });
      } else {
        msg.errors.forEach(i => {
          downloadApi(i, tmp_path, notify_url, stream_id);
        });
      }
    });
  } catch (err) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write(JSON.stringify({ code: 500, err: err }));
    response.end();
  }

  response.writeHead(200, { "Content-Type": "application/json" });
  response.write(JSON.stringify({ code: 200, msg: "success" }));
  response.end();
}

async function downloadApi(urls, tmp_path, notify_url, stream_id) {
  guid = await aria2.call("addUri", urls, { dir: tmp_path });
  var args = {
    timer: null,
    notify_url: notify_url,
    guid: guid,
    stream_id: stream_id,
    tmp_path: tmp_path
  };
  if (guid) {
    args.timer = setInterval(
      (function(args) {
        return async function() {
          var obj = await aria2.call("tellStatus", args.guid);
          //任务完成
          if (obj.status == "complete") {
            clearInterval(args.timer);
            setCallBack(notify_url, {
              fileDir: args.tmp_path,
              stream_id: stream_id
            });
          }
        };
      })(args),
      5000
    );
  }

  return guid;
}

async function downloadMp4(param, response) {
  var mp4_url = param.file_url ? param.file_url : "";
  var notify_url = param.notify_url ? param.notify_url : "";
  var tmp_path = param.tmp_path ? param.tmp_path : "";
  var stream_id = param.stream_id ? param.stream_id : "";
  var guid = "";
  try {
    guid = downloadApi([mp4_url], tmp_path, notify_url, stream_id);
  } catch (err) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write(JSON.stringify({ code: 500, err: err }));
    response.end();
  }
  // 添加 定时器  定期检查 任务id 是否下载完成
  // 任务完成 通知 notify_url 附带必要参数
  response.writeHead(200, { "Content-Type": "application/json" });
  response.write(JSON.stringify({ code: 200, tast_id: guid }));
  response.end();
}

async function setCallBack(url, params) {
  var options = {
    url: url, //req.query
    form: params //req.body
  };

  request.post(options, function(error, response, body) {
    console.info("statusCode:" + response.statusCode);
    console.info("body: " + body);
  });
}

http
  .createServer(async function(request, response) {
    var req = url.parse(request.url),
      pathname = req.pathname,
      filename = path.join(process.cwd(), "docs", pathname),
      param = url.parse(decodeURI(request.url), true).query;

    if (pathname == "/api/downloadM3U8") {
      downloadM3U8(param, response);
      return;
    } else if (pathname == "/api/downloadMp4") {
      downloadMp4(param, response);
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
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.write("404 Not Found\n");
        response.end();
        return;
      }

      if (fs.statSync(filename).isDirectory()) filename += "/index.html";

      fs.readFile(filename, "binary", function(err, file) {
        if (err) {
          response.writeHead(500, { "Content-Type": "text/plain" });
          response.write(err + "\n");
          response.end();
          return;
        }
        response.writeHead(200, { "Content-Type": contentType });
        response.write(file, "binary");
        response.end();
      });
    });
  })
  .listen(parseInt(port, 10));

console.log("WebUI Aria2 Server is running on http://localhost:" + port);
