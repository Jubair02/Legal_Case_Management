#!/bin/bash

set -euo pipefail

# 数据库现在是 PostgreSQL（Neon），不再有随构建产物打包的 SQLite 文件。
# The database is PostgreSQL (Neon) — there is no SQLite file to package with
# the build any more. This step only validates the connection string and syncs
# the schema against it.

PROJECT_DIR="${PROJECT_DIR:-/home/z/my-project}"
BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ DATABASE_URL 未设置 / DATABASE_URL is not set."
    echo "   生产库连接串是必需的（例如 Neon PostgreSQL）。"
    echo "   A PostgreSQL connection string is required, e.g."
    echo "   postgresql://user:pass@host/db?sslmode=require"
    exit 1
fi

case "$DATABASE_URL" in
    file:*|*.db|*.sqlite|*.sqlite3)
        echo "❌ DATABASE_URL 指向 SQLite 文件，但本项目已迁移到 PostgreSQL。"
        echo "   DATABASE_URL points at a SQLite file; this project now uses PostgreSQL."
        exit 1
        ;;
    postgres://*|postgresql://*) ;;
    *)
        echo "❌ DATABASE_URL 必须是 postgres:// 或 postgresql:// 连接串。"
        echo "   DATABASE_URL must be a postgres:// or postgresql:// connection string."
        exit 1
        ;;
esac

# Prefer bun when the sandbox provides it, otherwise fall back to npm.
if command -v bun >/dev/null 2>&1; then
    RUNNER="bun run"
else
    RUNNER="npm run"
fi

echo "🗄️  同步数据库结构 / Syncing database schema..."
(
    cd "$PROJECT_DIR"
    $RUNNER db:push
)

# 构建产物不再包含 db 目录；上传的文件仍需要一个可写目录。
# The build no longer ships a db/ directory, but uploads still need one.
mkdir -p "$BUILD_DIR/uploads"

echo "✅ 数据库结构已同步 / Database schema is in sync"
