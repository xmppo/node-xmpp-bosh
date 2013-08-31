#! /bin/bash

function cleanup {
  echo "Cleaning up NXB daemon process and tests (if any)"
  CPIDS=$(pgrep -s 0)
  echo "CPIDS: $CPIDS"
  kill -TERM $CPIDS
}
trap cleanup EXIT

CURL=`which curl`
echo "CURL: ${CURL}"
if [ "X$CURL" = "X" ]
then
    echo "'curl' was not found in the PATH"
    exit 1
fi

node run-server.js &

sleep 1
WAIT_SEC=3
echo -ne "Waiting for BOSH server to start... "
while [ $WAIT_SEC -gt 0 ]
do
    echo -ne "$WAIT_SEC  "
    WAIT_SEC=$(($WAIT_SEC - 1))
    sleep 1
done
echo "second"

bash tests/test_GET.sh &
wait $!
if [ $? -ne 0 ]
then
    echo -e "\e[00;31mFAILED: tests/test_GET.sh\e[00m" 1>&2
    exit 1
else
    echo -e "\e[00;32mSUCCESS: tests/test_GET.sh\e[00m" 1>&2
fi

node tests/basic.js --username="nonxbtest@jappix.com" --password="nonxbtest" &
wait $!
if [ $? -eq 0 ]
then
    echo -e "\e[00;31mFAILED: tests/basic.js\e[00m" 1>&2
    exit 1
else
    echo -e "\e[00;32mSUCCESS: tests/basic.js\e[00m" 1>&2
fi

node tests/basic.js --username="nxbtest@jappix.com" --password="nonxbtest" &
wait $!
if [ $? -eq 0 ]
then
    echo -e "\e[00;31mFAILED: tests/basic.js\e[00m" 1>&2
    exit 1
else
    echo -e "\e[00;32mSUCCESS: tests/basic.js\e[00m" 1>&2
fi

node tests/basic.js --username="nxbtest@jappix.com" --password="nxbtest" &
wait $!
if [ $? -ne 0 ]
then
    echo -e "\e[00;31mFAILED: tests/basic.js\e[00m" 1>&2
    exit 1
else
    echo -e "\e[00;32mSUCCESS: tests/basic.js\e[00m" 1>&2
fi

exit 0
