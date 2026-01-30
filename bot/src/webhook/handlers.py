import logging
import os
from datetime import datetime

import telegramify_markdown
from fastapi import APIRouter, Request
from pydantic import ValidationError

from src.models.schemas import TelegramUpdate, TelegramUserData
from src.services.telegram import get_telegram_service
from src.services.transcription import get_transcription_service
from src.services.supabase_client import (
    get_user_by_telegram_id,
    get_user_organizations,
    update_telegram_user_org,
    save_telegram_message,
)
from src.agent.agent import get_agent
from src.agent.prompts import (
    UNLINKED_USER_MESSAGE,
    WELCOME_MESSAGE,
    NO_MORE_ORGS_MESSAGE,
    SELECT_ORG_MESSAGE,
)


logger = logging.getLogger(__name__)
router = APIRouter()

# Estado temporal para usuarios seleccionando organización
_pending_org_selection: dict[int, list[dict]] = {}


def log_incoming(user_name: str, telegram_id: int, content_type: str, content: str, org_name: str | None = None):
    """Log formateado para mensajes entrantes"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    org_info = f" [{org_name}]" if org_name else ""
    content_preview = content[:100] + "..." if len(content) > 100 else content
    logger.info(f"📥 {timestamp} | {user_name} ({telegram_id}){org_info} | {content_type}: {content_preview}")


def log_outgoing(user_name: str, telegram_id: int, content: str):
    """Log formateado para mensajes salientes"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    content_preview = content[:100] + "..." if len(content) > 100 else content
    logger.info(f"📤 {timestamp} | → {user_name} ({telegram_id}) | {content_preview}")


@router.post("/webhook")
async def telegram_webhook(request: Request):
    """Recibe y procesa updates de Telegram"""
    telegram = get_telegram_service()

    try:
        body = await request.json()
        update = TelegramUpdate.model_validate(body)
    except ValidationError as e:
        logger.error(f"Error validating update: {e}")
        return {"ok": False, "error": "Invalid update"}

    if not update.message or not update.message.from_user:
        return {"ok": True}

    message = update.message
    chat_id = message.from_user.id
    telegram_id = message.from_user.id
    user_first_name = message.from_user.first_name or "Usuario"

    # Obtener usuario vinculado
    user_data = await get_user_by_telegram_id(telegram_id)
    user_display_name = user_data.user_nombre if user_data else user_first_name
    org_name = user_data.org_nombre if user_data else None

    # Extraer contenido del mensaje y tipo
    content, content_type = await extract_message_content(message)

    if content is None:
        response = "No pude entender tu mensaje. Envía texto, audio o un documento PDF."
        log_incoming(user_display_name, telegram_id, "unknown", "[contenido no soportado]", org_name)
        await telegram.send_message(chat_id, response)
        log_outgoing(user_display_name, telegram_id, response)
        return {"ok": True}

    # Log del mensaje entrante
    log_incoming(user_display_name, telegram_id, content_type, content, org_name)

    # Guardar mensaje entrante en BD
    await save_telegram_message(
        telegram_user_id=user_data.id if user_data else None,
        telegram_id=telegram_id,
        chat_id=chat_id,
        direction="incoming",
        content=content,
        content_type=content_type,
        message_id=message.message_id,
        metadata={"org_id": user_data.organizacion_id, "org_name": org_name} if user_data else {},
    )

    # Manejar comandos especiales
    if content.startswith("/"):
        response = await handle_command(chat_id, telegram_id, content, user_data)
        if response:
            log_outgoing(user_display_name, telegram_id, response)
            await save_telegram_message(
                telegram_user_id=user_data.id if user_data else None,
                telegram_id=telegram_id,
                chat_id=chat_id,
                direction="outgoing",
                content=response,
                content_type="text",
            )
        return {"ok": True}

    # Verificar si hay selección de org pendiente
    if telegram_id in _pending_org_selection:
        response = await handle_org_selection(chat_id, telegram_id, content, user_data)
        if response:
            log_outgoing(user_display_name, telegram_id, response)
            await save_telegram_message(
                telegram_user_id=user_data.id if user_data else None,
                telegram_id=telegram_id,
                chat_id=chat_id,
                direction="outgoing",
                content=response,
                content_type="text",
            )
        return {"ok": True}

    # Verificar usuario vinculado
    if not user_data:
        response = UNLINKED_USER_MESSAGE
        await telegram.send_message(chat_id, response)
        log_outgoing(user_display_name, telegram_id, response)
        await save_telegram_message(
            telegram_user_id=None,
            telegram_id=telegram_id,
            chat_id=chat_id,
            direction="outgoing",
            content=response,
            content_type="text",
        )
        return {"ok": True}

    # Procesar mensaje con el agente
    agent = get_agent()
    response = await agent.process_message(
        telegram_id=telegram_id,
        message=content,
        organizacion_id=user_data.organizacion_id,
        org_nombre=user_data.org_nombre or "Sin nombre",
        user_nombre=user_data.user_nombre or "Usuario",
        org_url=user_data.org_url or "",
    )

    # Convertir markdown estándar a Telegram MarkdownV2
    try:
        converted = telegramify_markdown.markdownify(response)
        await telegram.send_message(
            chat_id, converted, reply_to_message_id=message.message_id, parse_mode="MarkdownV2"
        )
    except Exception:
        # Fallback: enviar como texto plano si la conversión falla
        await telegram.send_message(
            chat_id, response, reply_to_message_id=message.message_id, parse_mode=None
        )

    # Log y guardar respuesta
    log_outgoing(user_display_name, telegram_id, response)
    await save_telegram_message(
        telegram_user_id=user_data.id,
        telegram_id=telegram_id,
        chat_id=chat_id,
        direction="outgoing",
        content=response,
        content_type="text",
        metadata={"org_id": user_data.organizacion_id, "org_name": org_name},
    )

    return {"ok": True}


async def extract_message_content(message) -> tuple[str | None, str]:
    """
    Extrae el contenido del mensaje (texto, audio transcrito, o caption de documento).
    Retorna (contenido, tipo).
    """
    # Texto directo
    if message.text:
        return message.text, "text"

    # Audio (voice note)
    if message.voice:
        telegram = get_telegram_service()
        transcription = get_transcription_service()

        audio_path = await telegram.download_file(message.voice.file_id)
        if audio_path:
            try:
                text = await transcription.transcribe(audio_path)
                return text, "voice"
            finally:
                # Limpiar archivo temporal
                if os.path.exists(audio_path):
                    os.remove(audio_path)

    # Documento (PDF) - por ahora solo extraemos caption
    # TODO: Implementar extracción de contenido de PDF
    if message.document:
        if message.caption:
            return message.caption, "document"
        return f"[Documento: {message.document.file_name}]", "document"

    # Foto con caption
    if message.photo and message.caption:
        return message.caption, "photo"

    return None, "unknown"


async def handle_command(
    chat_id: int,
    telegram_id: int,
    command: str,
    user_data: TelegramUserData | None,
) -> str | None:
    """Maneja comandos especiales del bot. Retorna la respuesta enviada."""
    telegram = get_telegram_service()
    cmd = command.lower().strip()

    # /start
    if cmd == "/start":
        if user_data:
            response = WELCOME_MESSAGE.format(
                user_nombre=user_data.user_nombre or "Usuario",
                org_nombre=user_data.org_nombre or "tu organización",
            )
        else:
            response = UNLINKED_USER_MESSAGE
        await telegram.send_message(chat_id, response)
        return response

    # /vincular <codigo>
    if cmd.startswith("/vincular"):
        response = (
            "La vinculación por código estará disponible pronto. "
            "Por ahora, contacta al administrador."
        )
        await telegram.send_message(chat_id, response)
        return response

    # /cambiar_org
    if cmd == "/cambiar_org":
        if not user_data:
            response = UNLINKED_USER_MESSAGE
            await telegram.send_message(chat_id, response)
            return response

        orgs = await get_user_organizations(user_data.user_id)

        if len(orgs) <= 1:
            response = NO_MORE_ORGS_MESSAGE.format(org_nombre=user_data.org_nombre or "tu organización")
            await telegram.send_message(chat_id, response)
            return response

        # Guardar orgs para selección
        _pending_org_selection[telegram_id] = orgs

        # Formatear lista
        org_list = "\n".join(
            [f"{i+1}. {org['nombre']}" for i, org in enumerate(orgs)]
        )
        response = SELECT_ORG_MESSAGE.format(org_list=org_list)
        await telegram.send_message(chat_id, response)
        return response

    # /help
    if cmd == "/help":
        response = """Comandos disponibles:

/start - Inicia el bot
/cambiar_org - Cambiar de organización
/vincular <código> - Vincular tu cuenta
/help - Muestra esta ayuda

También puedes enviarme:
• Texto con tu consulta
• Audio describiendo lo que necesitas
• Documentos PDF de contratos"""
        await telegram.send_message(chat_id, response)
        return response

    # Comando no reconocido
    response = "Comando no reconocido. Usa /help para ver los comandos disponibles."
    await telegram.send_message(chat_id, response)
    return response


async def handle_org_selection(
    chat_id: int,
    telegram_id: int,
    content: str,
    user_data: TelegramUserData | None,
) -> str | None:
    """Maneja la selección de organización. Retorna la respuesta enviada."""
    telegram = get_telegram_service()
    orgs = _pending_org_selection.get(telegram_id, [])

    try:
        selection = int(content.strip()) - 1
        if 0 <= selection < len(orgs):
            selected_org = orgs[selection]

            # Actualizar org en BD
            if user_data:
                await update_telegram_user_org(user_data.id, selected_org["organizacion_id"])

            # Limpiar estado
            del _pending_org_selection[telegram_id]

            # Limpiar sesión del agente (forzar nuevo contexto)
            agent = get_agent()
            agent._clear_session(telegram_id)

            response = (
                f"Cambiaste a la organización: {selected_org['nombre']}\n\n"
                f"¿En qué te puedo ayudar?"
            )
            await telegram.send_message(chat_id, response)
            return response
        else:
            response = "Número inválido. Por favor selecciona un número de la lista."
            await telegram.send_message(chat_id, response)
            return response
    except ValueError:
        response = "Por favor responde con el número de la organización."
        await telegram.send_message(chat_id, response)
        return response
