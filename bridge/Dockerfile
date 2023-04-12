FROM node:18 as build
WORKDIR /build/app

COPY bridge/package.json bridge/yarn.lock bridge/.yarnrc.yml ./
COPY bridge/.yarn ./.yarn
COPY lib ../lib
COPY revolt.js ../revolt.js

RUN yarn --cwd ../lib --immutable
RUN yarn --cwd ../lib build

WORKDIR /build/revolt.js
RUN corepack enable
RUN corepack prepare pnpm@7.14.2 --activate
RUN pnpm install
RUN pnpm run build

WORKDIR /build/app
RUN yarn install --immutable
COPY ./bridge .
RUN yarn build

FROM node:18 as prod
WORKDIR /app/bridge
COPY --from=build /build/app/package.json /build/app/yarn.lock /build/app/.yarnrc.yml ./
COPY --from=build /build/app/.yarn ./.yarn
COPY --from=build /build/app/dist ./dist
COPY --from=build /build/lib ../lib
COPY --from=build /build/revolt.js ../revolt.js
RUN yarn install --immutable
CMD ["yarn", "start"]
