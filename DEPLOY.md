# Despliegue en Render

Render es un servicio de hosting gratuito con soporte para Node.js y Python.

## Pasos para desplegar:

### 1. Preparar el proyecto

Asegurate de tener:
- `package.json` con scripts correctos
- `tsconfig.json` configurado
- `yt-dlp` en el sistema

### 2. Subir a GitHub

```bash
# Crear repositorio Git
git init
git add .
git commit -m "MuviDL API - Initial commit"

# Crear repositorio en GitHub y subir
git remote add origin https://github.com/TU_USUARIO/MuviDL.git
git push -u origin main
```

### 3. Crear servicio en Render

1. Ve a https://dashboard.render.com
2. Crea un nuevo **Web Service**
3. Conecta tu repositorio de GitHub
4. Configura:

| Campo | Valor |
|-------|-------|
| Name | muvidl-api |
| Environment | Node |
| Build Command | `pip install yt-dlp && npm install && npm run build` |
| Start Command | `npm start` |

### 4. Variables de Entorno

En Render, configura:

```
PORT=3000
APIFY_TOKEN=   # Opcional: tu token de Apify
```

### 5. Despliegue

- Click en **Create Web Service**
- Esperá a que haga build (~5 minutos)
- Listo! obtendrá una URL como `https://muvidl-api.onrender.com`

---

## alternativa: VPS (DigitalOcean, AWS, etc.)

### Commands en el servidor:

```bash
# Actualizar
sudo apt update && sudo apt upgrade -y

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar Python y yt-dlp
sudo apt install -y python3 python3-pip
pip install yt-dlp

# Clonar y configurar
git clone https://github.com/TU_USUARIO/MuviDL.git
cd MuviDL
npm install
npm run build

# Ejecutar (con pm2 para mantener vivo)
npm install -g pm2
pm2 start dist/server.js --name muvidl

# Ver logs
pm2 logs muvidl

# Reiniciar después de cambios
pm2 restart muvidl
```

---

## Configuración adicional para YouTube

### Opción 1: Tu propia instancia de Invidious

```bash
# Docker
docker run -p8080:8080 quay.io/invidious/invidious

# Luego actualiza src/infrastructure/adapters/MultiExtractor.ts
```

### Opción 2: Cookies de tu cuenta (1 vez)

1. Exporta cookies de YouTube (Chrome extensión)
2. Sube el archivo a tu servidor: `cp cookies.txt ./cookies/`
3. Agrega perfil: `POST /api/v1/cookies/profiles`

---

## URLs de producción

Después de desplegar, tu base URL será:

```
https://tu-servidor.onrender.com/api/v1
```

O si usastu propio dominio personalizado.

---

## Troubleshooting

### Error: "yt-dlp not found"
```bash
# Verificar instalación
which yt-dlp
pip install yt-dlp
```

### Error: "Connection timeout"
- Aumenta el timeout en el cliente
- YouTube puede estar bloqueando la IP

### Memoria insuficiente
- Usa el plan gratuito con cuidado
- Descarga videos grandes puede fallar

---

## Notas finales

1. **Plan gratuito de Render:** tiene límites (750 horas/mes, 15 min de build timeout)
2. **YouTube:** puede bloquear IPs de servicios gratuitos
3. **Mejor:** usar tu propio VPS o instancia dedicada