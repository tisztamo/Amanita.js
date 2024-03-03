#!/bin/sh

export TESTSERVER_PORT=3000
export BACKEND_PORT=2626
export HEAD_COLOR='\033[0;32m'
export NO_COLOR='\033[0m'

printf "$HEAD_COLOR\n"
echo "-------------- Amanita.js test server -------------------"
echo "- Static web server at http://localhost:${TESTSERVER_PORT}/         -"
echo "- Amanita.js (Deno) websocket backend at port ${BACKEND_PORT}    -"
echo "-------------------------------------------------------"
printf "$NO_COLOR"

# Kill every process at ctrl-c
cleanup() {
    # kill all processes whose parent is this process
    pkill -P $$
}
for sig in INT QUIT HUP TERM; do
  trap "
    cleanup
    trap - $sig EXIT
    kill -s $sig "'"$$"' "$sig"
done
trap cleanup EXIT


# Static server
npx ws -p $TESTSERVER_PORT &

# Backend server
deno run --inspect --allow-net --allow-read --location=http://localhost:3000 src/server/a-server.js $BACKEND_PORT
