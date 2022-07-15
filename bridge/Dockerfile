FROM node:16 as build
WORKDIR /build/app
COPY bridge/package.json bridge/yarn.lock bridge/.yarnrc.yml ./
COPY bridge/.yarn ./.yarn
COPY lib ../lib
RUN yarn --cwd ../lib build
RUN yarn install --immutable
COPY ./bridge .
RUN yarn build

FROM node:16 as prod
WORKDIR /app/bridge
COPY --from=build /build/app/package.json /build/app/yarn.lock /build/app/.yarnrc.yml ./
COPY --from=build /build/app/.yarn ./.yarn
COPY --from=build /build/app/dist ./dist
COPY ./lib ../lib
RUN yarn install --immutable
CMD ["yarn", "start"]
