# MuviDL - API de Descarga de Videos y Música

API REST desarrollada con TypeScript y Express para descargar videos y música de YouTube, Facebook, Instagram y TikTok.

## Características

- **Multi-plataforma**: YouTube, Facebook, Instagram, TikTok
- **Streaming**: Descarga directa de archivos sin almacenar URLs
- **Fallback chain**: yt-dlp → Invidious → Piped → Apify
- **Cookies rotativas**: Sistema de gestión de perfiles de cookies
- **Auto-debugging**: Detección automática de errores
- **Arquitectura Hexagonal**: Código limpio y mantenible

## Requisitos

- Node.js 18+
- Python 3.8+
- yt-dlp (`pip install yt-dlp`)

## Instalación

```bash
npm install
pip install yt-dlp
```

## Desarrollo

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

## Producción

### Build
```bash
npm run build
```

### Run
```bash
npm start
```

## Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-----------|
| GET | `/api/v1/sources` | Lista de plataformas soportadas |
| GET | `/api/v1/download/info?url=...` | Obtener metadata |
| POST | `/api/v1/download` | Iniciar descarga |
| GET | `/api/v1/download/:id` | Estado de descarga |
| GET | `/api/v1/download/:id/stream` | Streaming del archivo |
| DELETE | `/api/v1/download/:id` | Cancelar descarga |

## Variables de Entorno

```env
PORT=3000
APIFY_TOKEN=token_opcional
```

## Estructura del Proyecto

```
src/
├── domain/           # Entidades y puertos
├── application/       # Casos de uso
├── infrastructure/   # Implementaciones
│   ├── adapters/    # YtDlpAdapter, MultiExtractor
│   ├── worker/     # DownloadWorker, CookieManager
│   └── routes/    # Endpoints
└── shared/        # Utilidades
```

## YouTube sin cookies

El sistema intenta múltiples métodos en orden:
1. yt-dlp directo
2. Instancias Invidious (instala tu propia si es necesario)
3. Instancias Piped
4. API de Apify (configura APIFY_TOKEN)

## Docker (Opcional)

```dockerfile
FROM node:20

RUN pip install yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

## Licencia

ISC