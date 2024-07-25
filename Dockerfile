FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS insallserver
RUN mkdir -p /temp/prod
COPY server/package.json server/bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS installclient
RUN mkdir -p /temp/prod
COPY client/package.json client/bun.lockb /temp/prod/
RUN cd /temp/prod/ && bun install

FROM base as buildclient
RUN mkdir -p /temp/prod/build
COPY client/ /temp/prod/build
COPY --from=installclient /temp/prod/node_modules /temp/prod/build/node_modules
ENV NODE_ENV=production
RUN cd /temp/prod/build && bun run build

# copy production dependencies and source code into final image
FROM base AS release
ENV NODE_ENV=production
COPY server/ .
COPY --from=insallserver /temp/prod/node_modules node_modules
RUN mkdir -p ./client/dist
COPY --from=buildclient /temp/prod/build/dist client/dist

# run the app
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "index.ts" ]