FROM node:16 as build
ARG VITE_API_URL
ARG VITE_BOT_PREFIX
WORKDIR /build/
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:16 as prod
WORKDIR /app/
COPY --from=build /build/package.json /build/yarn.lock ./
COPY --from=build /build/dist ./dist
RUN yarn add --production --frozen-lockfile vite
# Running this with bash -c because it won't exit on ctrl+c otherwise
CMD ["bash", "-c", "yarn preview --port=80 --strictPort=true --clearScreen=false --host"]
