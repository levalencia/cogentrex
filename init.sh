#!/usr/bin/env bash
# init.sh — Verify the development environment is healthy before starting work.
# Run this at the start of every agent session. If it fails, fix before coding.
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

step() {
    printf "\n${YELLOW}▶ %s${NC}\n" "$1"
}

pass() {
    printf "  ${GREEN}✓ %s${NC}\n" "$1"
    PASS=$((PASS + 1))
}

fail() {
    printf "  ${RED}✗ %s${NC}\n" "$1"
    FAIL=$((FAIL + 1))
}

echo "═══════════════════════════════════════════"
echo "  Cogentrex — Environment Health Check"
echo "═══════════════════════════════════════════"

# 1. Confirm repo root
step "Checking working directory"
if [ -f "AGENTS.md" ] && [ -f "Makefile" ] && [ -d "backend" ] && [ -d "frontend" ]; then
    pass "Repo root confirmed: $(pwd)"
else
    fail "Not in repo root. cd to the directory containing AGENTS.md and Makefile."
    exit 1
fi

# 2. Check Python
step "Checking Python"
if command -v python3.11 &>/dev/null; then
    pass "Python 3.11: $(python3.11 --version 2>&1)"
elif command -v python3 &>/dev/null; then
    PY_VER=$(python3 --version 2>&1)
    if echo "$PY_VER" | grep -q "3.11\|3.12"; then
        pass "Python: $PY_VER"
    else
        fail "Python 3.11+ required, found: $PY_VER"
    fi
else
    fail "Python not found"
fi

# 3. Check uv
step "Checking uv"
if command -v uv &>/dev/null; then
    pass "uv: $(uv --version 2>&1)"
else
    fail "uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

# 4. Check Node.js
step "Checking Node.js"
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>&1)
    pass "Node.js: $NODE_VER"
else
    fail "Node.js not found"
fi

# 5. Check Docker
step "Checking Docker"
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    pass "Docker: running"
else
    fail "Docker not running or not installed (needed for integration tests)"
fi

# 6. Backend dependencies
step "Installing backend dependencies"
if cd backend && uv sync --extra dev --extra llm 2>&1 | tail -1; then
    pass "Backend deps installed"
else
    fail "Backend dep install failed"
fi
cd ..

# 7. Backend lint
step "Running backend lint"
if cd backend && uv run ruff check . 2>&1 | tail -3; then
    pass "Lint clean"
else
    fail "Lint errors found — fix before starting work"
fi
cd ..

# 8. Backend tests
step "Running backend unit tests"
if cd backend && uv run pytest -m unit -q --tb=short 2>&1 | tail -5; then
    pass "Unit tests passed"
else
    fail "Unit tests failed — fix before starting work"
fi
cd ..

# 9. Frontend dependencies
step "Installing frontend dependencies"
if cd frontend && npm ci --silent 2>&1 | tail -1; then
    pass "Frontend deps installed"
else
    fail "Frontend dep install failed"
fi
cd ..

# 10. Frontend checks
step "Running frontend checks"
if cd frontend && npx vitest run --reporter=dot 2>&1 | tail -3; then
    pass "Frontend tests passed"
else
    fail "Frontend tests failed"
fi
cd ..

# Summary
echo ""
echo "═══════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
    printf "  ${GREEN}READY${NC} — All %d checks passed\n" "$PASS"
    echo "  Start working. Remember: one feature at a time."
else
    printf "  ${RED}BLOCKED${NC} — %d passed, %d failed\n" "$PASS" "$FAIL"
    echo "  Fix the failures above before starting any feature work."
fi
echo "═══════════════════════════════════════════"

exit $FAIL
