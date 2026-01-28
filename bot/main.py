import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # Cargar .env como variables de entorno del proceso

import uvicorn
from fastapi import FastAPI

from src.config import get_settings
from src.services.telegram import get_telegram_service
from src.webhook.handlers import router as webhook_router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Configura el webhook de Telegram al iniciar"""
    settings = get_settings()
    telegram = get_telegram_service()

    if settings.webhook_url:
        webhook_url = f"{settings.webhook_url}/webhook"
        success = await telegram.set_webhook(webhook_url)
        if success:
            logger.info(f"Webhook configurado: {webhook_url}")
        else:
            logger.error("Error configurando webhook")
    else:
        logger.warning("WEBHOOK_URL no configurado, el bot no recibirá mensajes")

    yield

    # Cleanup al cerrar
    logger.info("Cerrando servidor...")


app = FastAPI(
    title="Real State Bot",
    description="Bot de Telegram para gestión de arriendos",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(webhook_router)


@app.get("/")
async def root():
    return {"status": "ok", "service": "real-state-bot"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
