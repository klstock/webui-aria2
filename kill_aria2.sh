#!/bin/bash
ps -ef | grep 'aria2c' | grep -v grep | awk '{print "kill -9",$2}' | sh
