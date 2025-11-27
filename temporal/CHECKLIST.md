# ✅ Checklist de Deploy

## Antes de empezar:
- [ ] Tengo una cuenta de GitHub
- [ ] Temporal está corriendo en Easypanel
- [ ] Puedo acceder a Temporal Web UI

## 1. Preparar GitHub:
- [ ] Crear repositorio en GitHub
- [ ] Ejecutar `./setup-github.sh` o hacer push manual
- [ ] Verificar que el código está en GitHub

## 2. Worker en Easypanel:
- [ ] Create Service → App → GitHub
- [ ] Name: `temporal-worker`
- [ ] Build Path: `temporal`
- [ ] Dockerfile Path: `Dockerfile.worker`
- [ ] Agregar variables de entorno:
  - [ ] `TEMPORAL_ADDRESS=temporal-server:7233`
  - [ ] `TEMPORAL_NAMESPACE=default`
- [ ] NO exponer puerto
- [ ] Deploy exitoso

## 3. API en Easypanel:
- [ ] Create Service → App → GitHub
- [ ] Name: `temporal-api`
- [ ] Build Path: `temporal`
- [ ] Dockerfile Path: `Dockerfile.api`
- [ ] Agregar variables de entorno:
  - [ ] `TEMPORAL_ADDRESS=temporal-server:7233`
  - [ ] `TEMPORAL_NAMESPACE=default`
  - [ ] `API_PORT=4000`
- [ ] Enable Public Access ✅
- [ ] Port: `4000`
- [ ] Deploy exitoso
- [ ] Copiar URL generada

## 4. Verificación:
- [ ] Worker aparece en Temporal Web UI
- [ ] Hacer curl a la API y recibir respuesta 200
- [ ] Workflow se ejecuta correctamente
- [ ] Ver logs sin errores

## 5. Integración con Next.js:
- [ ] Guardar URL de la API
- [ ] Crear endpoint en Next.js que llame a la API
- [ ] Probar crear un workflow desde Next.js

## ¡Listo! 🎉

Ahora cada vez que hagas push a GitHub, se redeploya automáticamente.

