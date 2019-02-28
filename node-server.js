var http = require("http"),
  url = require("url"),
  path = require("path"),
  fs = require("fs");

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
  var filename = param.file_name ? param.file_name : "";
  var m3u8Pathname = tmp_path + "/" + filename;
  var guid = "";
  try {
  } catch (err) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write(JSON.stringify({ code: 500, err: err }));
    response.end();
  }
}

async function downloadMp4(param, response) {
  var mp4_url = param.file_url ? param.file_url : "";
  var notify_url = param.notify_url ? param.notify_url : "";
  var tmp_path = param.tmp_path ? param.tmp_path : "";
  var filename = param.file_name ? param.file_name : "";
  var pathname = tmp_path + "/" + filename;

  var guid = "";
  try {
    guid = await aria2.call("addUri", [mp4_url], { dir: tmp_path });
    var args = {
      timer: null,
      notify_url: notify_url,
      guid: guid
    };
    if (guid) {
      args.timer = setInterval(
        (function(args) {
          return async function() {
            var obj = await aria2.call("tellStatus", args.guid);
            //任务完成
            if (obj.status == "complete") {
              clearInterval(args.timer);
            }
          };
        })(args),
        5000
      );
    }
  } catch (err) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write(JSON.stringify({ code: 500, err: err }));
    response.end();
  }
  // 添加 定时器  定期检查 任务id 是否下载完成
  // 任务完成 通知 notify_url 附带必要参数
  response.writeHead(200, { "Content-Type": "application/json" });
  response.write(JSON.stringify({ code: 0, tast_id: guid }));
  response.end();
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
