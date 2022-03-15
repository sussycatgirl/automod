#!/bin/bash

mkdir -p ./private/mongo
docker run -p 27017:27017 -v $(pwd)/private/mongo:/data/db mongo
