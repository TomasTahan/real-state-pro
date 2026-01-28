# Documentación del Proyecto - Real State Pro

Bienvenido a la documentación completa de Real State Pro. Este directorio contiene toda la información necesaria para entender y trabajar en el proyecto.

## 📚 Documentos Disponibles

### 🎯 [CLAUDE.md](./CLAUDE.md) - **EMPEZAR AQUÍ**
**Documento principal del proyecto**
- Descripción general del sistema
- Stack técnico completo
- Módulos del sistema
- Arquitectura y patrones
- Reglas críticas de desarrollo
- Workflow de documentación

**Cuándo leer**: Siempre antes de empezar a trabajar en el proyecto.

---

### ⚡ [QUICK_START.md](./QUICK_START.md)
**Guía de inicio rápido**
- Checklist rápido
- Comandos útiles
- Flujo de trabajo típico
- Reglas de oro
- Estructura de directorios
- Debugging común

**Cuándo leer**: Cuando necesites recordar algo rápido o estés empezando una tarea.

---

### 💻 [CODE_PATTERNS.md](./CODE_PATTERNS.md)
**Ejemplos de código y patrones**
- Componentes típicos
- React Query patterns
- Formularios con shadcn/ui + Zod
- Manejo de errores
- Realtime subscriptions
- Zustand stores
- API routes
- Optimistic updates

**Cuándo leer**: Cuando vayas a escribir código y necesites seguir los patrones establecidos.

---

### 🗄️ [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
**Schema completo de Supabase**
- Diagrama de relaciones
- Todas las tablas con descripción
- Campos importantes
- Reglas de RLS
- Índices
- Queries comunes

**Cuándo leer**: Cuando necesites entender la estructura de datos o escribir queries.

---

### 📋 [MODULE_README_TEMPLATE.md](./MODULE_README_TEMPLATE.md)
**Template para documentación de módulos**
- Estructura estándar para README de módulos
- Secciones requeridas
- Ejemplos de cada sección

**Cuándo usar**: Al crear la documentación de un módulo nuevo o actualizar una existente.

---

## 🚀 Flujo de Trabajo Recomendado

### Para Claude (IA)
1. ✅ Leer `CLAUDE.md` para contexto completo
2. ✅ Revisar `QUICK_START.md` para recordar reglas
3. ✅ Consultar `CODE_PATTERNS.md` al escribir código
4. ✅ Usar `DATABASE_SCHEMA.md` para queries
5. ✅ **Preguntar antes** de actualizar README de módulo

### Para Desarrolladores Humanos
1. ✅ Leer `CLAUDE.md` para entender el proyecto
2. ✅ Revisar `QUICK_START.md` para setup
3. ✅ Seguir patrones de `CODE_PATTERNS.md`
4. ✅ Consultar `DATABASE_SCHEMA.md` cuando sea necesario
5. ✅ Actualizar READMEs de módulos al finalizar features

---

## 📁 Estructura del Directorio

```
.claude/
├── README.md                      # Este archivo (índice)
├── CLAUDE.md                      # 📘 Documento principal
├── QUICK_START.md                 # ⚡ Guía rápida
├── CODE_PATTERNS.md               # 💻 Patrones de código
├── DATABASE_SCHEMA.md             # 🗄️ Schema de BD
└── MODULE_README_TEMPLATE.md      # 📋 Template para módulos
```

---

## 🎯 Módulos del Sistema

Cada módulo debe tener su propio `README.md` en su directorio:

### Módulos Principales
- **Cobranza**: `app/(main)/cobranza/README.md`
  - Gestión de vouchers, pagos, multas, descuentos

- **Propiedades**: `app/(main)/propiedades/README.md`
  - Administración de propiedades y contratos

- **Bitácora**: `app/(main)/bitacora/README.md`
  - Registro histórico de eventos

- **Dashboard**: `app/(main)/dashboard/README.md`
  - Métricas y visualización

- **Servicios**: `app/(main)/servicios/README.md`
  - Gestión de servicios básicos

- **Errores**: `app/(main)/errores/README.md`
  - Sistema de gestión de errores

---

## 🔑 Conceptos Clave

### Multi-tenant
- Cada organización ve solo sus datos
- RLS habilitado en todas las tablas
- **SIEMPRE** filtrar por `organizacion_id`

### Client-First
- Preferir Client Components
- Queries directas a Supabase (sin API Routes)
- Minimizar latencia

### Regla de 3+ Usos
- Queries inline si se usan 1-2 veces
- Hooks reutilizables si se usan 3+ veces
- Componentes grandes están bien

### Documentación Viva
- READMEs de módulos son críticos
- Actualizar al finalizar implementaciones
- **Preguntar antes** de actualizar (para Claude)

---

## 📌 Links Útiles

### Documentación Externa
- [Supabase Docs](https://supabase.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [shadcn/ui](https://ui.shadcn.com)
- [Zod](https://zod.dev)
- [Next.js](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

### Herramientas del Proyecto
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Vercel Dashboard](https://vercel.com)
- [ETPAY Docs](https://etpay.com/docs) (si disponible)

---

## 🛠️ Comandos Rápidos

```bash
# Desarrollo
pnpm dev                    # Iniciar dev server

# Tipos
pnpm types:update          # Actualizar tipos de Supabase

# Build
pnpm build                 # Build producción
pnpm start                 # Start producción

# Lint
pnpm lint                  # Ejecutar ESLint
```

---

## ❓ FAQ

**P: ¿Por dónde empiezo?**
R: Lee `CLAUDE.md` primero, luego `QUICK_START.md`.

**P: ¿Necesito leer todo antes de empezar?**
R: No necesariamente. Lee `CLAUDE.md` para contexto general, luego consulta otros documentos según necesites.

**P: ¿Cuándo actualizo los READMEs de módulos?**
R: Al finalizar una implementación significativa. Claude debe preguntar antes de actualizar.

**P: ¿Dónde encuentro ejemplos de código?**
R: En `CODE_PATTERNS.md`.

**P: ¿Cómo sé qué tablas usar?**
R: Revisa `DATABASE_SCHEMA.md`.

---

## 📝 Notas para Mantenimiento

### Actualizar esta documentación cuando:
- Se agreguen nuevos módulos al sistema
- Cambien patrones de código establecidos
- Se modifique significativamente el schema de BD
- Se agreguen nuevas integraciones
- Cambien las reglas de desarrollo

### Responsables:
- Mantener actualizado: Equipo de desarrollo
- Revisar periódicamente: Tech lead
- Validar coherencia: Claude (al trabajar en el proyecto)

---

**Última actualización**: 2025-12-17
**Versión de documentación**: 1.0.0

---

## 🎉 ¡Listo para empezar!

Si eres Claude, empieza leyendo `CLAUDE.md`.
Si eres humano, bienvenido al proyecto. ¡Esperamos que esta documentación te sea útil!
