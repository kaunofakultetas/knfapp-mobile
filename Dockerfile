FROM node:24-alpine

WORKDIR /app


RUN apk add --no-cache git bash libc6-compat \
    && corepack enable

ENV EXPO_NO_TELEMETRY=1 \
    WATCHPACK_POLLING=true \
    CHOKIDAR_USEPOLLING=true \
    REACT_EDITOR=none



EXPOSE 8081
CMD ["sh", "-c", "npm install && npx expo start --port 8081 --host lan"]
