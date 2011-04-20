#!/bin/bash

find src tests *.js bosh.conf.example.js -name "*.js" | 
while read fn
do
  S="JSLinting file: $fn"
  L=${#S}
  FS="%${L}s"
  D=$(printf $FS ' ')
  D=${D//?/-}
  echo -e "$S\n$D"
  jslint $fn
  echo ""
done
