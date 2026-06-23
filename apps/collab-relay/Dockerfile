FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY . .

RUN pnpm install --frozen-lockfile

ENV COLLAB_RELAY_HOST=0.0.0.0
ENV COLLAB_RELAY_PORT=4327
ENV COLLAB_ALLOWED_ROOM_PREFIX=layo:

EXPOSE 4327

CMD ["pnpm", "--filter", "@layo/collab-relay", "start"]
