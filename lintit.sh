#!/bin/bash

find src tests -name "*.js" | 
while read fn
do
  echo -e "JSLinting file: $fn\n--------------------"
  jslint $fn
done
