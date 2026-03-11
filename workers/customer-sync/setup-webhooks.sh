#!/bin/bash
#
# Register WooCommerce customer webhooks for all 3 regions.
# Creates customer.created, customer.updated, and customer.deleted webhooks
# on each store, pointing to the customer-sync worker.
#
# Usage: bash setup-webhooks.sh
#

WORKER_URL="https://hercules-customer-sync.kamindudushmantha.workers.dev"
WEBHOOK_SECRET="hercules-customer-sync-secret-2026"

# WooCommerce API credentials per region
declare -A STORE_URLS
STORE_URLS[DE]="https://hercules-merchandise.de"
STORE_URLS[UK]="https://hercules-merchandise.co.uk"
STORE_URLS[FR]="https://hercules-merchandising.fr"

declare -A CONSUMER_KEYS
CONSUMER_KEYS[DE]="ck_25a394425268abad8f7255eaff2349e10bc1e3d5"
CONSUMER_KEYS[UK]="ck_5d7dfb3d454cd2a0cbd8dae317caa09eb0084f9f"
CONSUMER_KEYS[FR]="ck_b2fb9151600c581d945db314fc83219877e10118"

declare -A CONSUMER_SECRETS
CONSUMER_SECRETS[DE]="cs_aee9e05ff27a008297c5bdded53e766efbbef068"
CONSUMER_SECRETS[UK]="cs_5257e559b5a555d9e5fe9e4983616583c55cb278"
CONSUMER_SECRETS[FR]="cs_38014792bf0129ddbac1f414ef5c9072c8ba4aca"

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
