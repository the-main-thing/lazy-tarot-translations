#!/usr/bin/env bash
cd client
bun install
bun run build
cd ..
cd server
bun install
bun run index.ts
