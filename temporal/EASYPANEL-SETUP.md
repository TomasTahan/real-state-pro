# 🎯 Guía Rápida: Deploy en Easypanel

## 📁 Archivos creados:

✅ `Dockerfile.worker` - Imagen Docker para el worker  
✅ `Dockerfile.api` - Imagen Docker para la API  
✅ `.dockerignore` - Archivos a ignorar en build  
✅ `docker-compose.yml` - Para desarrollo local (opcional)  
✅ `setup-github.sh` - Script para subir a GitHub  
✅ `README.md` - Documentación completa  

---

## 🚀 PASOS RÁPIDOS:

### 1️⃣ Subir a GitHub

**Opción A: Usando el script (recomendado)**
```bash
cd temporal
./setup-github.sh
```

**Opción B: Manual**
1. Crea un repo en GitHub
2. Ejecuta:
```bash
cd /Users/mac-tomy/Documents/prog/real-state-pro
git add temporal/
git commit -m "Add temporal worker and API"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

---

### 2️⃣ Crear servicio WORKER en Easypanel

1. **Create Service** → **App** → **GitHub**
2. Configuración:
   - Name: `temporal-worker`
   - Repository: Tu repo
   - Branch: `main`
   - Build Path: `temporal`
   - Dockerfile Path: `Dockerfile.worker`

3. **Environment Variables:**
   ```
   TEMPORAL_ADDRESS=temporal-server:7233
   TEMPORAL_NAMESPACE=default
   ```

4. **Networking**: NO exponer puerto
5. **Deploy**

---

### 3️⃣ Crear servicio API en Easypanel

1. **Create Service** → **App** → **GitHub**
2. Configuración:
   - Name: `temporal-api`
   - Repository: Tu repo (el mismo)
   - Branch: `main`
   - Build Path: `temporal`
   - Dockerfile Path: `Dockerfile.api`

3. **Environment Variables:**
   ```
   TEMPORAL_ADDRESS=temporal-server:7233
   TEMPORAL_NAMESPACE=default
   API_PORT=4000
   ```

4. **Networking**: 
   - ✅ Enable Public Access
   - Port: `4000`
   
5. **Deploy**

---

### 4️⃣ Verificar

**Worker:**
- Ve a: https://tahan-temporal-web.0cguqx.easypanel.host
- Busca tu worker en la pestaña "Workers"

**API:**
Prueba con curl (reemplaza con tu URL de Easypanel):
```bash
curl -X POST https://temporal-api-xxxxx.easypanel.host/workflows/create-user \
  -H "Content-Type: application/json" \
  -d '{"userId": "123", "email": "test@example.com"}'
```

---

## ⚠️ IMPORTANTE:

- Usa `temporal-server:7233` (nombre interno) NO la URL pública
- El worker NO necesita puerto expuesto
- La API SÍ necesita puerto 4000 expuesto
- Cada push a GitHub redeploya automáticamente

---

## 🐛 Si algo falla:

1. **Worker no conecta**: Revisa logs en Easypanel
2. **API no responde**: Verifica que el puerto 4000 esté expuesto
3. **Build falla**: Verifica que Build Path sea `temporal`

---

## 📞 Usar la API desde Next.js:

```typescript
// En tu app Next.js
const response = await fetch('https://temporal-api-xxxxx.easypanel.host/workflows/create-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    userId: user.id, 
    email: user.email 
  })
});

const data = await response.json();
console.log('Workflow ID:', data.workflowId);
```

