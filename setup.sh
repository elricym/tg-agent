#!/bin/bash
set -e

echo "🐾 tg-agent setup"
echo "─────────────────────────"

# Check Node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install it first."
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 22 ]; then
  echo "❌ Node.js 22+ required (for node:sqlite). You have $(node -v)"
  exit 1
fi
echo "✅ Node $(node -v)"

# Check acpx (optional)
if command -v acpx &>/dev/null; then
  echo "✅ acpx found (Claude Code via ACP available)"
else
  echo "⚠️  acpx not found — ACP tool will be disabled at runtime"
fi

# Install deps
echo ""
echo "📦 Installing dependencies..."
npm install

# Setup .env
if [ ! -f .env ]; then
  echo ""
  echo "📝 Creating .env from template..."
  cp .env.example .env

  # Interactive setup
  read -p "Telegram Bot Token: " BOT_TOKEN
  read -p "Anthropic API Key: " API_KEY
  read -p "Your Telegram User ID (use /myid if unsure): " USER_ID

  sed -i '' "s|your-bot-token-from-botfather|$BOT_TOKEN|" .env
  sed -i '' "s|sk-ant-xxx-or-sk-ant-oat-xxx|$API_KEY|" .env
  if [ -n "$USER_ID" ]; then
    sed -i '' "s|ALLOWED_USERS=999808594|ALLOWED_USERS=$USER_ID|" .env
  fi

  echo "✅ .env created — review it: vim .env"
else
  echo ""
  echo "✅ .env exists, skipping"
fi

# Build
echo ""
echo "🔨 Building..."
npx tsc --noEmit
echo "✅ TypeScript OK"

# Verify security
echo ""
echo "🔒 Security checklist:"
source .env 2>/dev/null || true

if [ -z "$ALLOWED_USERS" ]; then
  echo "  ❌ ALLOWED_USERS is empty — bot will refuse to start!"
else
  echo "  ✅ ALLOWED_USERS: $ALLOWED_USERS"
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "your-bot-token-from-botfather" ]; then
  echo "  ❌ TELEGRAM_BOT_TOKEN not set"
else
  echo "  ✅ TELEGRAM_BOT_TOKEN configured"
fi

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "sk-ant-xxx-or-sk-ant-oat-xxx" ]; then
  echo "  ❌ ANTHROPIC_API_KEY not set"
else
  echo "  ✅ ANTHROPIC_API_KEY configured"
fi

echo ""
echo "🚀 Ready! Run with:"
echo "   npm run dev"
echo ""
echo "Or with pm2 for production:"
echo "   npx tsx src/index.ts  # or pm2 start"
