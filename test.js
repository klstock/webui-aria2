const HLSDownloader = require("./hlsdownloader").downloader;

var m3u8_url =
  "http://play-9.xunliansoft.com/xlylive/UhEHszmf.m3u8?auth_key=1588132031-5ea7a73fa4c85-0-8912fe7f8b3ae8b5c4160d8e03adc397";
var m3u8_file = "UhEHszmf.m3u8";
var tmp_path = "./tmp";

var doneMap = {};
var tsMap = {};
var tsSeq = [];
var playTime = 0;
var errorNum = 0;
var isDownload = false;

setInterval(playTs, 100);

function playTs() {
  var now = new Date().valueOf();

  if (
    typeof tsSeq[0] != "undefined" &&
    tsSeq[0] in tsMap &&
    tsMap[tsSeq[0]].at > now
  ) {
    return;
  }

  var errorSkip = errorNum * 5 < 60 && errorNum * 5 > 0 ? errorNum * 5 : 60;
  if (errorNum > 0 && parseInt(now / 1000) % errorSkip != 0) {
    return;
  }

  if (!isDownload && tsSeq.length <= 3) {
    console.log(formatDateStr(), " [info] dumpM3U8", playTime / 1000);
    isDownload = true;
    dumpM3U8(m3u8_url, m3u8_file, tmp_path, function(err, msg) {
      if (err) {
        errorNum += 1;
      }
      appendTs(err, msg);
      isDownload = false;
    });
  }

  if (
    typeof tsSeq[0] != "undefined" &&
    tsSeq[0] in tsMap &&
    tsMap[tsSeq[0]].at > now
  ) {
    return;
  }

  var ts = tsSeq.shift();
  if (!ts || ts in doneMap || !(ts in tsMap)) {
    return;
  }
  errorNum = 0;
  var t = tsMap[ts].t;
  playTime += t * 1000;
  doneMap[ts] = now;
  console.log(formatDateStr(), " [info] playTs", ts, t, playTime / 1000);
}

function appendTs(err, msg) {
  if (err) {
    return;
  }
  var at = new Date().valueOf();

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
        tsMap[k] = {
          t: t,
          at: at
        };
        newTs && tsSeq.push(k);

        at += t * 1000;
      }
    }
  }
}

function dumpM3U8(m3u8_url, m3u8_file, tmp_path, callback) {
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
  }
}

function formatDateStr() {
  var now = new Date(new Date().getTime());
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var date = now.getDate();
  var hour = now.getHours();
  var minute = now.getMinutes();
  if (minute < 10) {
    minute = "0" + minute.toString();
  }
  var seconds = now.getSeconds();
  if (seconds < 10) {
    seconds = "0" + seconds.toString();
  }
  return (
    year + "-" + month + "-" + date + " " + hour + ":" + minute + ":" + seconds
  );
}
