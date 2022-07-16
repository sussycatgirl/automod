FROM node:18 as build
ARG VITE_API_URL
ARG VITE_BOT_PREFIX
WORKDIR /build/app
COPY web/package.json web/yarn.lock web/.yarnrc.yml ./
COPY web/.yarn ./.yarn
COPY lib ../lib
RUN yarn --cwd ../lib --immutable
RUN yarn --cwd ../lib build
RUN yarn install --immutable
COPY web .
RUN yarn build

FROM node:18 as prod
WORKDIR /app/web
COPY --from=build /build/app/package.json /build/app/yarn.lock /build/app/.yarnrc.yml ./
COPY --from=build /build/app/.yarn ./.yarn
COPY --from=build /build/app/dist ./dist
COPY --from=build /build/lib ../lib
RUN yarn add vite
# Running this with bash -c because it won't exit on ctrl+c otherwise
CMD ["bash", "-c", "yarn preview --port=80 --strictPort=true --clearScreen=false --host"]
