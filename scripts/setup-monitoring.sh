#!/bin/bash
#
# setup-monitoring.sh
#
# Starts the Automaker monitoring stack (Prometheus + Grafana + node-exporter)
# and verifies all services are healthy.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Automaker Monitoring Stack Setup                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running${NC}"
  echo "  Please start Docker and try again"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Navigate to project root
cd "$PROJECT_ROOT"

# Check if docker-compose.monitoring.yml exists
if [ ! -f "docker-compose.monitoring.yml" ]; then
  echo -e "${RED}✗ docker-compose.monitoring.yml not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Found docker-compose.monitoring.yml${NC}"

# Check if monitoring configuration exists
if [ ! -f "monitoring/prometheus/prometheus.yml" ]; then
  echo -e "${RED}✗ Prometheus configuration not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Found Prometheus configuration${NC}"

if [ ! -f "monitoring/grafana/grafana.ini" ]; then
  echo -e "${RED}✗ Grafana configuration not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Found Grafana configuration${NC}"

if [ ! -f "monitoring/grafana/provisioning/datasources/prometheus.yml" ]; then
  echo -e "${RED}✗ Grafana datasource provisioning not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Found Grafana datasource provisioning${NC}"

echo ""
echo -e "${BLUE}Starting monitoring stack...${NC}"

# Stop existing containers if running
if docker compose -f docker-compose.monitoring.yml ps --quiet | grep -q .; then
  echo -e "${YELLOW}⚠ Stopping existing monitoring containers...${NC}"
  docker compose -f docker-compose.monitoring.yml down
fi

# Start the monitoring stack
docker compose -f docker-compose.monitoring.yml up -d

echo ""
echo -e "${BLUE}Waiting for services to be healthy...${NC}"

# Wait for Prometheus
MAX_RETRIES=30
RETRY_COUNT=0
until docker compose -f docker-compose.monitoring.yml ps --filter "health=healthy" | grep -q "automaker-prometheus" || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  echo -e "${YELLOW}⏳ Waiting for Prometheus... ($((RETRY_COUNT+1))/$MAX_RETRIES)${NC}"
  sleep 2
  ((RETRY_COUNT++))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "${RED}✗ Prometheus failed to start${NC}"
  docker compose -f docker-compose.monitoring.yml logs prometheus
  exit 1
fi
echo -e "${GREEN}✓ Prometheus is healthy${NC}"

# Wait for Grafana
RETRY_COUNT=0
until docker compose -f docker-compose.monitoring.yml ps --filter "health=healthy" | grep -q "automaker-grafana" || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  echo -e "${YELLOW}⏳ Waiting for Grafana... ($((RETRY_COUNT+1))/$MAX_RETRIES)${NC}"
  sleep 2
  ((RETRY_COUNT++))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "${RED}✗ Grafana failed to start${NC}"
  docker compose -f docker-compose.monitoring.yml logs grafana
  exit 1
fi
echo -e "${GREEN}✓ Grafana is healthy${NC}"

# Wait for node-exporter
RETRY_COUNT=0
until docker compose -f docker-compose.monitoring.yml ps --filter "health=healthy" | grep -q "automaker-node-exporter" || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  echo -e "${YELLOW}⏳ Waiting for node-exporter... ($((RETRY_COUNT+1))/$MAX_RETRIES)${NC}"
  sleep 2
  ((RETRY_COUNT++))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "${RED}✗ node-exporter failed to start${NC}"
  docker compose -f docker-compose.monitoring.yml logs node-exporter
  exit 1
fi
echo -e "${GREEN}✓ node-exporter is healthy${NC}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Monitoring Stack Started Successfully!                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Services:${NC}"
echo -e "  ${GREEN}Prometheus${NC}    http://localhost:9090"
echo -e "  ${GREEN}Grafana${NC}       http://localhost:3010 (admin/admin)"
echo -e "  ${GREEN}node-exporter${NC} http://localhost:9100/metrics"
echo ""
echo -e "${BLUE}Scrape Targets:${NC}"
echo -e "  • Automaker Server:  http://host.docker.internal:3008/api/metrics/prometheus"
echo -e "  • Node Exporter:     http://node-exporter:9100/metrics"
echo -e "  • Prometheus:        http://localhost:9090/metrics"
echo ""
echo -e "${YELLOW}Note:${NC} Grafana is configured with anonymous read-only access."
echo -e "      Dashboards are viewable without login."
echo ""
echo -e "${BLUE}To stop the monitoring stack:${NC}"
echo -e "  docker compose -f docker-compose.monitoring.yml down"
echo ""
