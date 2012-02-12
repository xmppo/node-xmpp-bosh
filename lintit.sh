#!/bin/bash

find src tests *.js -name "*.js" | 
while read fn
do
  S="JSLinting file: $fn"
  L=${#S}
  FS="%${L}s"
  D=$(printf $FS ' ')
  D=${D//?/-}
  echo -e "$S\n$D"
  jslint --forin=false --node=false --nomen=true --vars=true $fn
  echo ""
done
