FROM node:16 as build
ARG VITE_API_URL
ARG VITE_BOT_PREFIX
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
RUN yarn add vite
# Running this with bash -c because it won't exit on ctrl+c otherwise
CMD ["bash", "-c", "yarn preview --port=80 --strictPort=true --clearScreen=false --host"]
