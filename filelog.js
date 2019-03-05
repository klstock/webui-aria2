var fs = require("fs");
var path = require("path");
var s_bashDir = null;

if (!path.sep) {
  path.sep = "/";
}
exports.NewLog = function() {
  var arr = [];
  for (var i in arguments) {
    var str = String(arguments[i]);
    if (str.lastIndexOf(path.sep) != -1) {
      console.log("参数中不要使用 目录 分隔符");
      return null;
    }
    arr.push(str);
  }
  return new FileLogger(arr);
};
exports.SetLogDir = function() {
  if (s_bashDir) return;
  s_bashDir = path.join(process.cwd(), "log", GetDay());
  _mkdirSync(s_bashDir);
  for (var i in arguments) {
    var str = String(arguments[i]);
    s_bashDir = path.join(s_bashDir, str);
    _mkdirSync(s_bashDir);
  }
};

function GetDay() {
  var time = null;
  time = new Date();
  var moth = time.getMonth() + 1;
  var timStr = "log_" + time.getFullYear() + "_" + moth + "_" + time.getDate();
  return timStr;
}

function _getRootDir() {
  if (s_bashDir) {
    if (!fs.existsSync(s_bashDir)) {
      _mkdirSync(s_bashDir);
    }
    return s_bashDir;
  }
  s_bashDir = path.join(process.cwd(), "logs", GetDay());
  _mkdirSync(s_bashDir);
  return s_bashDir;
}

function _createDir(dirArr) {
  var dir = _getRootDir();
  for (var i in dirArr) {
    dir = path.join(dir, dirArr[i]);
    _mkdirSync(dir);
  }
  return dir;
}

function _mkdirSync(filename) {
  try {
    fs.mkdirSync(filename, 0777);
  } catch (err) {}
}

function _getFileName(id) {
  var date = new Date();
  var logname = "[pid=" + process.pid + "]_" + id + ".txt";
  return logname;
}

const STATE_OPEN = 1;
const STATE_CLOSE = 2;

function FileLogger(arr) {
  this.file_fd_ = null;
  this.dir_path_ = _createDir(arr);
  this.num_line_ = 0;
  this.file_name_id_ = 1;
  this.num_write_per_second_ = 0;
  this.timer_ = setInterval(this.OnTimer.bind(this, 1), 1000);
  this.file_state_ = STATE_CLOSE;
  this._makeFilePath();
}

FileLogger.prototype._makeFilePath = function() {
  this._checkPath();
  var name = _getFileName(this.file_name_id_++);
  this.file_name_ = this.dir_path_ + path.sep + name;
};

FileLogger.prototype._checkPath = function() {
  _getRootDir();
  if (!fs.existsSync(this.dir_path_)) {
    _mkdirSync(this.dir_path_);
  }
};

FileLogger.prototype.open = function() {
  try {
    this._checkPath();
    this.file_fd_ = fs.openSync(this.file_name_, "a+");
  } catch (err) {
    console.log("fs.openSync error:", err);
  }
  if (!this.file_fd_) console.log("open file fail:", this.file_name_);
  else {
    this.file_state_ = STATE_OPEN;
  }
};

FileLogger.prototype.OnTimer = function(df) {
  this.num_write_per_second_ = 0;
  if (this.file_state_ == STATE_OPEN) {
    this.lastWrite += df;
    if (this.lastWrite >= 2) {
      this._closeFile();
    }
  }
};

FileLogger.prototype._closeFile = function() {
  try {
    if (this.file_state_ == STATE_OPEN) {
      fs.closeSync(this.file_fd_);
      this.file_fd_ = null;
      this.file_state_ = STATE_CLOSE;
    }
  } catch (err) {
    console.log("log close file fail:", err, err.stack);
  }
};

FileLogger.prototype.Println = function(pre, args) {
  var arr = [];
  arr.push(GetTimeStr() + "(pid:" + process.pid + ")  [" + pre + "]  ");
  for (var i in args) {
    arr.push(args[i]);
  }
  this.write.apply(this, arr);
};

FileLogger.prototype.write = function() {
  if (this.file_state_ != STATE_OPEN) this.open();
  if (!this.file_fd_) return;
  if (this.num_write_per_second_++ > 200) {
    return;
  }
  berror = false;
  while (true) {
    try {
      fs.write(this.file_fd_, _getString(arguments), function(err) {
        err && console.log("log write file fail:", err, err.stack);
      });
      break;
    } catch (err) {
      if (berror) break; //only try once
      berror = true;
      this._closeFile();
      this.open();
    }
  }
  var fileSize = fs.statSync(this.file_name_).size;
  if (fileSize >= 2048 * 1000) {
    //大于2M
    this._closeFile();
    this._makeFilePath();
  }
};

FileLogger.prototype.Destroy = function() {
  this._closeFile();
  clearInterval(this.timer_);
};

FileLogger.prototype.WriteLog = function() {
  try {
    this.Println("Log", arguments);
  } catch (err) {
    console.log("WriteLog err", err);
  }
};

function _getString(arr) {
  var s = "";
  for (var n = 0; n < arr.length; n++) {
    var arg = arr[n];
    if (typeof arg == "object") arg = JSON.stringify(arg);
    s = s + arg + "  ";
  }
  var st = s + "\n";
  return st;
}

function GetTimeStr(date) {
  var time = null;
  if (!date) {
    time = new Date();
  } else if (data instanceof Date) {
    time = date;
  } else if (date instanceof Number) {
    time = new Date(date);
  }

  var timStr =
    time.getFullYear() +
    "-" +
    TimeTo(time.getMonth() + 1) +
    "-" +
    TimeTo(time.getDate()) +
    "-" +
    TimeTo(time.getHours()) +
    "." +
    TimeTo(time.getMinutes()) +
    "." +
    TimeTo(time.getSeconds()) +
    "." +
    TimeTo(time.getMilliseconds());
  return timStr;
}

function TimeTo(str) {
  str = String(str);
  if (str.length == 1) {
    return "0" + str;
  }
  return str;
}
