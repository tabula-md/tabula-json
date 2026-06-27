FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3004 \
    TABULA_JSON_DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "const port=process.env.PORT||3004;fetch('http://127.0.0.1:'+port+'/health').then(async(response)=>{if(!response.ok)process.exit(1);const body=await response.json();process.exit(body&&body.ok===true&&body.service==='tabula-json'?0:1);}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
