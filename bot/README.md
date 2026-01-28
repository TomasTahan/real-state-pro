# Real State Bot

Bot de Telegram para gestión de arriendos con IA.

## Arquitectura

```
Usuario (Telegram)
    │
    ▼
┌─────────────────┐
│    FastAPI      │ ◀── Webhook de Telegram
│   (main.py)     │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌─────────────┐
│  Groq  │  │ Claude SDK  │
│Whisper │  │ + MCP       │
└────────┘  └──────┬──────┘
                   │
                   ▼
            ┌──────────────┐
            │   Supabase   │
            │  (via MCP)   │
            └──────────────┘
```

## Setup

### 1. Instalar dependencias

```bash
cd bot
pip install -e .
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Crear bot en Telegram

1. Habla con [@BotFather](https://t.me/BotFather)
2. Usa `/newbot` y sigue las instrucciones
3. Copia el token y ponlo en `TELEGRAM_BOT_TOKEN`

### 4. Exponer webhook (desarrollo)

Para desarrollo local, usa cloudflared:

```bash
cloudflared tunnel --url http://localhost:8000
```

Copia la URL y ponla en `WEBHOOK_URL`.

### 5. Ejecutar

```bash
python main.py
```

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram |
| `SUPABASE_PROJECT_REF` | Project ref de Supabase |
| `SUPABASE_ACCESS_TOKEN` | Personal access token de Supabase |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase |
| `GROQ_API_KEY` | API key de Groq (Whisper) |
| `WEBHOOK_URL` | URL pública del servidor |

## Comandos del Bot

| Comando | Descripción |
|---------|-------------|
| `/start` | Inicia el bot |
| `/cambiar_org` | Cambiar de organización |
| `/vincular <código>` | Vincular cuenta (pendiente) |
| `/help` | Muestra ayuda |

## Estructura

```
bot/
├── main.py                 # Entry point FastAPI
├── src/
│   ├── config.py          # Configuración
│   ├── agent/
│   │   ├── agent.py       # Claude SDK + MCP
│   │   └── prompts.py     # System prompts
│   ├── services/
│   │   ├── supabase_client.py  # Cliente Supabase
│   │   ├── telegram.py         # Cliente Telegram
│   │   └── transcription.py    # Groq Whisper
│   ├── webhook/
│   │   └── handlers.py    # Webhook handlers
│   └── models/
│       └── schemas.py     # Pydantic models
└── pyproject.toml
```

## Seguridad

El bot filtra TODAS las consultas por `org_id` del usuario autenticado.
Esto se hace mediante el system prompt que instruye al agente a siempre
incluir el filtro de organización.

## Deployment (EasyPanel)

1. Crear nuevo servicio en EasyPanel
2. Conectar repositorio Git
3. Configurar build command: `pip install -e ./bot`
4. Configurar start command: `cd bot && python main.py`
5. Agregar variables de entorno
6. Configurar dominio para webhook
