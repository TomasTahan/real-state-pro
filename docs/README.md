# Documentación del Proyecto

Bienvenido a la documentación del proyecto. Aquí encontrarás guías sobre diferentes aspectos de la aplicación.

## 📚 Contenido

### Supabase Realtime + React Query

- **[Quick Start](./REALTIME_QUICKSTART.md)** - Empieza en 5 minutos
- **[Guía Completa](./REALTIME.md)** - Documentación detallada con todos los casos de uso

### Otros temas

_(Agregar más documentación aquí según se necesite)_

---

## 🚀 Quick Links

### Supabase Realtime

| Necesito... | Ver... |
|-------------|--------|
| Empezar rápido | [Quick Start](./REALTIME_QUICKSTART.md) |
| Entender cómo funciona | [Guía Completa - Conceptos Básicos](./REALTIME.md#conceptos-básicos) |
| Ejemplos de código | [Guía Completa - Ejemplos](./REALTIME.md#ejemplos-por-caso-de-uso) |
| Solucionar problemas | [Troubleshooting](./REALTIME.md#troubleshooting) |
| Referencia de API | [API Reference](./REALTIME.md#api-reference) |

---

## 🏗️ Arquitectura del Proyecto

```
/
├── app/                    # Next.js App Router
├── components/             # Componentes reutilizables
├── lib/
│   ├── hooks/             # Custom hooks (incluye useSupabaseRealtime)
│   ├── supabase/          # Cliente de Supabase
│   ├── reactquery/        # Configuración de React Query
│   └── utils.ts           # Utilidades
├── docs/                   # 📖 Documentación (estás aquí)
└── temporal/              # Temporal.io workflows
```

---

## 🤝 Contribuir a la documentación

Si encuentras algo que falta o puede mejorarse:

1. Edita los archivos en `/docs`
2. Usa Markdown para formatear
3. Incluye ejemplos de código cuando sea posible
4. Mantén un tono claro y conciso

---

## 📞 Soporte

Si tienes preguntas que no están cubiertas en la documentación, consulta:

- [Documentación de Supabase](https://supabase.com/docs)
- [Documentación de React Query](https://tanstack.com/query/latest)
- [Documentación de Next.js](https://nextjs.org/docs)
