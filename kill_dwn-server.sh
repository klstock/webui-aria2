#!/bin/bash
ps -ef | grep 'dwn-server.js' | grep -v grep | awk '{print "kill -9",$2}' | sh
