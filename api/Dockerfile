FROM node:18 as build
WORKDIR /build/app
COPY api/package.json api/yarn.lock api/.yarnrc.yml ./
COPY api/.yarn ./.yarn
COPY lib ../lib
RUN yarn --cwd ../lib --immutable
RUN yarn --cwd ../lib build
RUN yarn install --immutable
COPY ./api .
RUN yarn build

FROM node:18 as prod
WORKDIR /app/api
COPY --from=build /build/app/package.json /build/app/yarn.lock /build/app/.yarnrc.yml ./
COPY --from=build /build/app/.yarn ./.yarn
COPY --from=build /build/app/dist ./dist
COPY --from=build /build/lib ../lib
RUN yarn install --immutable
CMD ["yarn", "start"]
