FROM node:22-alpine

WORKDIR /app

# 仅复制运行所需文件（无 node_modules）；构建前需在宿主机准备好 .env
COPY package.json server.js app.js index.html styles.css ./
COPY data ./data
COPY .env .env

# 确保风格库目录可写（node 非 root 用户）
RUN mkdir -p data/style-library/images \
    && chown -R node:node /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/index.html > /dev/null || exit 1

CMD ["node", "server.js"]
