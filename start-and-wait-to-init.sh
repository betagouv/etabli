#!/bin/sh

#
# We trigger an init endpoint to set up all async processes like cron scheduling
# because unfortunately Next.js does not provide a proper way to use a startup callback
#

echo "Start the server in background"
node server.js &

# Store the server process ID
next_pid=$!

stop_server() {
  echo "Shut down Next.js server..."
  kill $next_pid
  exit 0
}

# Bind the callback to the SIGINT signal to shut down the background process properly
trap stop_server SIGINT

check_server_and_init() {
  timeout=15
  counter=0

  while true; do
    response=$(curl --write-out %{http_code} --silent --output /dev/null http://localhost:$PORT)
    if [ "$response" = "200" ]; then
      break
    fi

    if [ $counter -eq $timeout ]; then
      echo "Error: the Next.js server is not ready within the expected timeframe"

      # Kill the server since it has no reason to continue
      kill $next_pid
      exit 1
    fi

    echo "the Next.js server is not yet ready"

    sleep 1
    counter=$((counter+1))
  done

  curl http://localhost:$PORT/api/init
}

# In parallel wait for the server readiness to init some services
check_server_and_init

# Wait for the Next.js server to return
wait

echo "The wait instruction has exited normally"
