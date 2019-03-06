#!/bin/bash
source /etc/profile
ps -ef | grep 'aria2c' | grep -v grep | awk '{print "kill -9",$2}' | sh
sleep 2
/usr/local/webui-aria2
nohup aria2c --enable-rpc --rpc-listen-all > ./logs/'aria2_log'`date +%y-%m-%d_%H%M%S`'.out' 2>&1 &

#  01  4  *  *  *  sh /usr/local/webui-aria2/restart_aria2.sh > /tmp/restart_vss_aria2.log  2>&1
#  */2  *  *  *  * sh /usr/local/webui-aria2/check_aria2.sh > /tmp/check_vss_aria2.log  2>&1
