#!/bin/bash
source /etc/profile
processlist=`ps -ef |grep node|grep aria2c|grep -v grep |wc -l`
if [[ $processlist -lt 1 ]];then
    cd /usr/local/webui-aria2
    nohup aria2c --enable-rpc --rpc-listen-all > ./logs/'aria2_log'`date +%y-%m-%d_%H%M%S`'.out' 2>&1 &
fi
