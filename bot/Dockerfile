FROM node:16 as build
WORKDIR /build/
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable
COPY . .
RUN yarn build

FROM node:16 as prod
WORKDIR /app/
COPY --from=build /build/package.json /build/yarn.lock /build/.yarnrc.yml ./
COPY --from=build /build/.yarn ./.yarn
COPY --from=build /build/dist ./dist
RUN yarn install --immutable
CMD ["yarn", "start"]
