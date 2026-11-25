FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.mjs ./
ENV PORT=3015 DATA_DIR=/data
EXPOSE 3015
CMD ["node", "index.mjs"]
