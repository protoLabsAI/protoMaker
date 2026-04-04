#!/usr/bin/env bash
# Setup script for Infisical credentials on a new staging server.
# Run once on the staging server before the first deploy.
#
# Prerequisites:
#   - Infisical CLI installed: https://infisical.com/docs/cli/overview
#   - INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET from the protoLabs Studio
#     Infisical project (protolabs-studio, project ID: f0e3382b-611c-4964-8b57-89d0db4976be)
#     Identity: protolabs-studio-staging
#
# Usage:
#   INFISICAL_CLIENT_ID=<id> INFISICAL_CLIENT_SECRET=<secret> ./scripts/setup-infisical-staging.sh

set -euo pipefail

if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
  echo "ERROR: INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET must be set"
  echo "Get these from the Infisical project: protolabs-studio > identities > protolabs-studio-staging"
  exit 1
fi

# Verify infisical CLI is installed
if ! command -v infisical &>/dev/null; then
  echo "Installing Infisical CLI..."
  curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | bash
  apt-get install -y infisical
fi

# Verify the credentials work before storing them
echo "Verifying Infisical credentials..."
INFISICAL_MACHINE_IDENTITY_CLIENT_ID=$INFISICAL_CLIENT_ID \
INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET=$INFISICAL_CLIENT_SECRET \
infisical export \
  --domain https://secrets.proto-labs.ai/api \
  --env staging \
  --format dotenv \
  --silent \
  > /dev/null

echo "Credentials verified."

echo ""
echo "Next steps:"
echo "1. Add INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET as GitHub Actions secrets"
echo "   in the protoLabsAI/protoMaker repository:"
echo "   https://github.com/protoLabsAI/protoMaker/settings/secrets/actions"
echo ""
echo "   INFISICAL_CLIENT_ID=$INFISICAL_CLIENT_ID"
echo "   INFISICAL_CLIENT_SECRET=<see /tmp/infisical_project_creds.txt>"
echo ""
echo "2. The deploy workflow will now pull secrets from Infisical on every deploy."
echo "   The old .env.staging file is no longer needed."
