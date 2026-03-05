FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY index.js ./
RUN mkdir -p /usr/src/app/data

CMD ["npm", "run", "start"]
