#!/bin/bash
source /etc/profile
processlist=`ps -ef |grep node|grep dwn-server.js|grep -v grep |wc -l`
if [[ $processlist -lt 1 ]];then
    cd /usr/local/webui-aria2
    nohup node dwn-server.js > ./logs/'dwn_log'`date +%y-%m-%d_%H%M%S`'.out' 2>&1 &
fi
