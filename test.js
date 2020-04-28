const HLSDownloader = require("./hlsdownloader").downloader;

var m3u8_url =
  "http://play-9.xunliansoft.com/xlylive/UhEHszmf.m3u8?auth_key=1588132031-5ea7a73fa4c85-0-8912fe7f8b3ae8b5c4160d8e03adc397";
var m3u8_file = "UhEHszmf.m3u8";
var tmp_path = "./tmp";

var doneMap = {};
var tsMap = {};
var tsSeq = [];
var playTime = 0;
var startTime = new Date().valueOf();
var isDownload = false;

setInterval(playTs, 100);

function playTs() {
  var now = new Date().valueOf();
  if (now - startTime < playTime) {
    return;
  }

  if (!isDownload && tsSeq.length <= 3) {
    console.log("dumpM3U8", playTime / 1000);
    dumpM3U8(m3u8_url, m3u8_file, tmp_path, appendTs);
  }
  var ts = tsSeq.shift();
  if (!ts || ts in doneMap || !(ts in tsMap)) {
    console.log("skip", playTime / 1000);
    return;
  }
  var t = tsMap[ts];
  playTime += t * 1000;
  console.log("playTs", ts, t, playTime / 1000);
}

function appendTs(err, msg) {
  var map = msg.map || {};
  var ts = msg.errors || [];
  ts = ts.slice(1);
  for (const k of ts) {
    // #EXTINF:5.970,
    var ext = map[k] || "";
    var tmp = ext.match(/#EXTINF:([\d.]+).*/i);
    if (tmp && tmp[1]) {
      var t = parseFloat(tmp[1]);
      if (t > 0) {
        var newTs = !(k in tsMap);
        tsMap[k] = t;
        newTs && tsSeq.push(k);
      }
    }
  }
}

function dumpM3U8(m3u8_url, m3u8_file, tmp_path, callback) {
  isDownload = true;
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
          err
        );
        callback && callback(err);
      } else {
        // console.info("M3u8DownSuc", msg.map);
        callback && callback(null, msg);
      }
      isDownload = false;
    });
  } catch (err) {
    console.error(
      "error",
      m3u8_url,
      tmp_path,
      err.name + ": " + err.message,
      err
    );
    callback && callback(err);
    isDownload = false;
  }
}
