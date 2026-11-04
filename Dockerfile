# Frontend de TimeTrack: build con Vite y servido con nginx con cabeceras de seguridad (#35).
# Dokploy lo construye desde la raíz del repo y genera .env (createEnvFile) antes del build.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Las VITE_* llegan por el .env de Dokploy o como build args. Un build arg vacío no debe
# tapar el valor del .env (Vite da prioridad a process.env), así que se quitan si están vacíos.
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN for v in VITE_API_URL VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do \
      eval "[ -n \"\${$v}\" ] || unset $v"; \
    done; \
    npm run build

FROM nginx:1.27-alpine
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
