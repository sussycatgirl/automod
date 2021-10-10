FROM node:14 AS build
WORKDIR /build/
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:14 as prod
WORKDIR /app/
COPY --from=build /build/package.json /build/yarn.lock ./
COPY --from=build /build/dist ./dist
RUN yarn install --production --frozen-lockfile
CMD ["yarn", "start"]
