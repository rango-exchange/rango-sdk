#! /bin/bash

if [ -n "$1" ];then
buildPath=$1
echo "moved build files from dist to ${buildPath}"
mv dist/ ${buildPath}/
fi