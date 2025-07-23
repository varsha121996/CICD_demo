#!/bin/bash

# Set up nvm (use environment variable or detect automatically)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Use a specific version of Node.js -- only needed if project differs from system default
# nvm use 20 >/dev/null 2>&1

# Change to the project directory (use relative path)
cd "$(dirname "$0")"

# Start the MCP server
yarn strapi mcp --endpoint http://localhost:4001/mcp 