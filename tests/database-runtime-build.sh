#!/bin/bash

set -euo pipefail

# 项目已从 SQLite 迁移到 PostgreSQL：构建步骤不再打包数据库文件，
# 而是校验连接串并同步 schema。
# The project moved from SQLite to PostgreSQL: the build step no longer
# packages a database file, it validates the connection string and syncs the
# schema. These tests cover that contract.

SCRIPT_DIR="$(cd "$(dirname "$0")/../.zscripts" && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"

# Stub npm so `npm run db:push` records the URL it would have pushed to.
cat >"$FAKE_BIN/npm" <<'EOF'
#!/bin/bash
set -euo pipefail

if [ "$#" -ne 2 ] || [ "$1" != "run" ] || [ "$2" != "db:push" ]; then
    echo "unexpected npm invocation: $*" >&2
    exit 1
fi

case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*) ;;
    *)
        echo "DATABASE_URL must be a PostgreSQL connection string" >&2
        exit 1
        ;;
esac

printf '%s\n' "$DATABASE_URL" >>"${DB_PUSH_CALLS:?}"
EOF
chmod +x "$FAKE_BIN/npm"

# Hide any real bun so the script takes the npm path deterministically.
cat >"$FAKE_BIN/bun" <<'EOF'
#!/bin/bash
echo "bun should not be used when unavailable" >&2
exit 127
EOF
chmod +x "$FAKE_BIN/bun"
rm "$FAKE_BIN/bun"

export PATH="$FAKE_BIN:$PATH"
export DB_PUSH_CALLS="$TEST_ROOT/db-push-calls"
: >"$DB_PUSH_CALLS"

PROJECT="$TEST_ROOT/project"
BUILD="$TEST_ROOT/build"
mkdir -p "$PROJECT"

PG_URL="postgresql://user:pass@db.example.com/neondb?sslmode=require"

# 1. 正常路径：同步 schema，并为上传创建目录。
PROJECT_DIR="$PROJECT" BUILD_DIR="$BUILD" DATABASE_URL="$PG_URL" \
    bash "$SCRIPT_DIR/database-runtime-build.sh" >/dev/null

grep -Fx "$PG_URL" "$DB_PUSH_CALLS" >/dev/null
test -d "$BUILD/uploads"
test ! -e "$BUILD/db"          # 不再打包数据库文件 / no packaged database
test ! -e "$PROJECT/db"        # 项目目录保持不变 / project dir untouched

# 2. 缺少 DATABASE_URL 必须失败。
if PROJECT_DIR="$PROJECT" BUILD_DIR="$TEST_ROOT/b2" \
    bash "$SCRIPT_DIR/database-runtime-build.sh" >/dev/null 2>&1; then
    echo "expected failure when DATABASE_URL is unset" >&2
    exit 1
fi

# 3. 残留的 SQLite 连接串必须被拒绝，而不是静默建库。
if PROJECT_DIR="$PROJECT" BUILD_DIR="$TEST_ROOT/b3" DATABASE_URL="file:/app/db/custom.db" \
    bash "$SCRIPT_DIR/database-runtime-build.sh" >/dev/null 2>&1; then
    echo "expected failure for a SQLite DATABASE_URL" >&2
    exit 1
fi

# 4. 非 postgres 协议同样拒绝。
if PROJECT_DIR="$PROJECT" BUILD_DIR="$TEST_ROOT/b4" DATABASE_URL="mysql://user@host/db" \
    bash "$SCRIPT_DIR/database-runtime-build.sh" >/dev/null 2>&1; then
    echo "expected failure for a non-PostgreSQL DATABASE_URL" >&2
    exit 1
fi

# 只有第 1 步应该触发 db:push。
test "$(wc -l <"$DB_PUSH_CALLS" | tr -d ' ')" = "1"

echo "database runtime build tests passed"
