#!/usr/bin/env bash

cd client
bun run build 
cd ..
cd server
mkdir client
cp -r ../client/dist ./client
cd ..
