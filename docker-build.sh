#!/bin/bash

# Docker build script for Equilibrium application

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building Equilibrium Docker image...${NC}"

# Get version from package.json or use latest
VERSION=${1:-latest}
IMAGE_NAME="equilibrium"

# Build the image
docker build -t ${IMAGE_NAME}:${VERSION} .

echo -e "${GREEN}✓ Build complete!${NC}"
echo -e "${BLUE}Image: ${IMAGE_NAME}:${VERSION}${NC}"
echo ""
echo "To run the container:"
echo "  docker run -d -p 5006:5006 --env-file .env.local ${IMAGE_NAME}:${VERSION}"
echo ""
echo "Or use docker-compose:"
echo "  docker-compose up -d"

