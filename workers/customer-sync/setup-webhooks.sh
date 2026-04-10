#!/bin/bash
#
# Register WooCommerce customer webhooks for all 3 regions.
# Creates customer.created, customer.updated, and customer.deleted webhooks
# on each store, pointing to the customer-sync worker.
#
# Usage: bash setup-webhooks.sh
#

WORKER_URL="https://hercules-customer-sync.kamindudushmantha.workers.dev"
WEBHOOK_SECRET="${WEBHOOK_SECRET:?Set WEBHOOK_SECRET env var}"

# WooCommerce API credentials per region — set these as env vars before running
declare -A STORE_URLS
STORE_URLS[DE]="https://hercules-merchandise.de"
STORE_URLS[UK]="https://hercules-merchandise.co.uk"
STORE_URLS[FR]="https://hercules-merchandising.fr"

declare -A CONSUMER_KEYS
CONSUMER_KEYS[DE]="${WC_DE_CK:?Set WC_DE_CK env var}"
CONSUMER_KEYS[UK]="${WC_UK_CK:?Set WC_UK_CK env var}"
CONSUMER_KEYS[FR]="${WC_FR_CK:?Set WC_FR_CK env var}"

declare -A CONSUMER_SECRETS
CONSUMER_SECRETS[DE]="${WC_DE_CS:?Set WC_DE_CS env var}"
CONSUMER_SECRETS[UK]="${WC_UK_CS:?Set WC_UK_CS env var}"
CONSUMER_SECRETS[FR]="${WC_FR_CS:?Set WC_FR_CS env var}"

TOPICS=("customer.created" "customer.updated" "customer.deleted")

echo "Setting up WooCommerce customer webhooks..."
echo "============================================"

for REGION in DE UK FR; do
  STORE="${STORE_URLS[$REGION]}"
  CK="${CONSUMER_KEYS[$REGION]}"
  CS="${CONSUMER_SECRETS[$REGION]}"
  DELIVERY_URL="${WORKER_URL}/webhook?region=${REGION}"

  echo ""
  echo "--- ${REGION} (${STORE}) ---"

  for TOPIC in "${TOPICS[@]}"; do
    NAME="CRM Sync: ${TOPIC} (${REGION})"

    echo -n "  Creating webhook: ${TOPIC}... "

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      "${STORE}/wp-json/wc/v3/webhooks" \
      -u "${CK}:${CS}" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"${NAME}\",
        \"topic\": \"${TOPIC}\",
        \"delivery_url\": \"${DELIVERY_URL}\",
        \"secret\": \"${WEBHOOK_SECRET}\",
        \"status\": \"active\"
      }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "201" ]; then
      WH_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
      echo "OK (id: ${WH_ID})"
    else
      echo "FAILED (HTTP ${HTTP_CODE})"
      echo "    Response: ${BODY}" | head -c 200
      echo ""
    fi
  done
done

echo ""
echo "============================================"
echo "Done! 9 webhooks should now be registered."
echo ""
echo "To verify, check each store:"
echo "  curl -s 'https://hercules-merchandise.de/wp-json/wc/v3/webhooks' -u 'ck_...:cs_...' | jq '.[].name'"
