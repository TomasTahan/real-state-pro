# Temporal Worker & API - Guía de Deploy en Easypanel

Este proyecto contiene el Worker y la API para Temporal.io desplegado en Easypanel.

## 📋 Prerequisitos

- Cuenta de GitHub
- Temporal ya desplegado en Easypanel (temporal-server corriendo)
- Acceso a tu panel de Easypanel

## 🚀 Paso 1: Subir código a GitHub

1. Crea un nuevo repositorio en GitHub (puede ser privado o público)

2. En tu terminal local, ejecuta:

```bash
cd /Users/mac-tomy/Documents/prog/real-state-pro
git add temporal/
git commit -m "Add temporal worker and API"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## 🏗️ Paso 2: Crear servicio WORKER en Easypanel

1. En Easypanel, ve a tu proyecto y haz clic en **"Create Service"**

2. Selecciona **"App"** → **"GitHub"**

3. Configura el servicio:
   - **Name**: `temporal-worker`
   - **Repository**: Selecciona tu repositorio
   - **Branch**: `main`
   - **Build Path**: `temporal`
   - **Dockerfile Path**: `Dockerfile.worker`

4. En **Environment Variables**, agrega:
   ```
   TEMPORAL_ADDRESS=temporal-server:7233
   TEMPORAL_NAMESPACE=default
   ```
   
   ⚠️ IMPORTANTE: Usa `temporal-server:7233` (nombre interno del servicio, no la URL pública)

5. En **Networking**:
   - NO necesitas exponer puerto (el worker solo escucha, no recibe requests)

6. Haz clic en **"Deploy"**

## 🌐 Paso 3: Crear servicio API en Easypanel

1. En Easypanel, crea otro servicio: **"Create Service"**

2. Selecciona **"App"** → **"GitHub"**

3. Configura el servicio:
   - **Name**: `temporal-api`
   - **Repository**: Selecciona el mismo repositorio
   - **Branch**: `main`
   - **Build Path**: `temporal`
   - **Dockerfile Path**: `Dockerfile.api`

4. En **Environment Variables**, agrega:
   ```
   TEMPORAL_ADDRESS=temporal-server:7233
   TEMPORAL_NAMESPACE=default
   API_PORT=4000
   ```

5. En **Networking**:
   - **Enable Public Access**: ✅ Activar
   - **Port**: `4000`
   - **Domain**: Easypanel te generará uno automáticamente (ej: `temporal-api-xxxxx.easypanel.host`)

6. Haz clic en **"Deploy"**

## ✅ Paso 4: Verificar que todo funciona

### Verificar Worker:
1. Ve a tu Temporal Web UI: https://tahan-temporal-web.0cguqx.easypanel.host
2. En la pestaña **"Workers"** deberías ver tu worker conectado

### Verificar API:
Prueba hacer un request a tu API (reemplaza con tu dominio de Easypanel):

```bash
curl -X POST https://temporal-api-xxxxx.easypanel.host/workflows/create-user \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "email": "test@example.com"}'
```

Deberías recibir:
```json
{
  "ok": true,
  "workflowId": "create-user-test123-1234567890",
  "runId": "..."
}
```

## 📦 Arquitectura del Deploy

```
GitHub Repo
    ↓
Easypanel (auto-build on push)
    ↓
┌─────────────────────────────────────┐
│  temporal-worker (Dockerfile.worker)│
│  - Escucha taskQueue "default"      │
│  - Ejecuta workflows                │
└─────────────────────────────────────┘
         ↕
┌─────────────────────────────────────┐
│  temporal-server                    │
│  (Ya desplegado)                    │
└─────────────────────────────────────┘
         ↕
┌─────────────────────────────────────┐
│  temporal-api (Dockerfile.api)      │
│  - Puerto 4000                      │
│  - POST /workflows/create-user      │
│  - Inicia workflows                 │
└─────────────────────────────────────┘
         ↑
    Tu App Next.js
```

## 🔄 Deploy automático

Cada vez que hagas push a GitHub en la carpeta `temporal/`, Easypanel automáticamente:
1. Detecta los cambios
2. Construye las imágenes Docker
3. Redeploya los servicios
4. Sin downtime

## 🔧 Comandos útiles

### Desarrollo local:
```bash
npm run dev:worker    # Corre worker en local
npm run dev:api       # Corre API en local
```

### Build local:
```bash
npm run build         # Compila TypeScript
```

### Ver logs en Easypanel:
1. Ve al servicio (temporal-worker o temporal-api)
2. Haz clic en la pestaña **"Logs"**

## 🐛 Troubleshooting

### El worker no se conecta a Temporal:
- Verifica que `TEMPORAL_ADDRESS=temporal-server:7233` (nombre interno, no URL pública)
- Verifica que el namespace sea correcto
- Revisa logs en Easypanel

### La API no responde:
- Verifica que el puerto 4000 esté expuesto en Networking
- Revisa los logs para ver errores
- Verifica las variables de entorno

### Workflow no se ejecuta:
- Verifica que el worker esté corriendo
- Verifica que la taskQueue sea la misma (`default`)
- Ve a Temporal Web UI para ver el estado del workflow

## 📝 Próximos pasos

1. Agregar autenticación a la API (JWT, API keys)
2. Agregar validación de entrada
3. Implementar más workflows
4. Agregar monitoreo y alertas

