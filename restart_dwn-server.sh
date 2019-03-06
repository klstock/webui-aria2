#!/bin/bash
source /etc/profile
ps -ef | grep 'dwn-server.js' | grep -v grep | awk '{print "kill -9",$2}' | sh
sleep 2
/usr/local/webui-aria2
nohup node dwn-server.js > ./logs/'dwn_log'`date +%y-%m-%d_%H%M%S`'.out' 2>&1 &

#  01  4  *  *  *  sh /usr/local/webui-aria2/restart_dwn.sh > /tmp/restart_vss_dwn.log  2>&1
#  */2  *  *  *  * sh /usr/local/webui-aria2/check_dwn.sh > /tmp/check_vss_dwn.log  2>&1
