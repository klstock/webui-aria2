var http = require("http"),
  url = require("url"),
  path = require("path"),
  fs = require("fs");
port = process.argv[2] || 8888;

function downloadM3U8(request, response) {
  var m3u8_url = "";
  var notify_url = "";
  var tmp_path = "";

  // http.get 获取 m3u8_url  内容
  // m3u8_url  内容 中的 所有 ts  写入 到  tmp_path 目录中 保持原文件名
  // aria2.addUri 添加 所有 ts 下载任务
  // 添加 定时器  定期检查 任务id 是否下载完成
  // 任务完成 通知 notify_url 附带必要参数
  response.writeHead(200, { "Content-Type": contentType });
  response.write(JSON.stringify({ code: 0 }));
  response.end();
}

function downloadMp4(request, response) {
  var m3u8_url = "";
  var notify_url = "";
  var tmp_path = "";

  // aria2.addUri 添加 mp4 下载任务
  // 添加 定时器  定期检查 任务id 是否下载完成
  // 任务完成 通知 notify_url 附带必要参数
  response.writeHead(200, { "Content-Type": contentType });
  response.write(JSON.stringify({ code: 0 }));
  response.end();
}

http
  .createServer(function(request, response) {
    var uri = url.parse(request.url).pathname,
      filename = path.join(process.cwd(), "docs", uri);
    if (uri == "/api/downloadM3U8") {
      downloadM3U8(request, response);
      return;
    } else if (uri == "/api/downloadMp4") {
      downloadMp4(request, response);
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
