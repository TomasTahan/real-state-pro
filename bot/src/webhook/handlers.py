import logging
import os

from fastapi import APIRouter, Request
from pydantic import ValidationError

from src.models.schemas import TelegramUpdate, TelegramUserData
from src.services.telegram import get_telegram_service
from src.services.transcription import get_transcription_service
from src.services.supabase_client import (
    get_user_by_telegram_id,
    get_user_organizations,
    update_telegram_user_org,
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

    # Obtener usuario vinculado
    user_data = await get_user_by_telegram_id(telegram_id)

    # Extraer contenido del mensaje
    content = await extract_message_content(message)

    if content is None:
        await telegram.send_message(
            chat_id,
            "No pude entender tu mensaje. Envía texto, audio o un documento PDF.",
        )
        return {"ok": True}

    # Manejar comandos especiales
    if content.startswith("/"):
        await handle_command(chat_id, telegram_id, content, user_data)
        return {"ok": True}

    # Verificar si hay selección de org pendiente
    if telegram_id in _pending_org_selection:
        await handle_org_selection(chat_id, telegram_id, content, user_data)
        return {"ok": True}

    # Verificar usuario vinculado
    if not user_data:
        await telegram.send_message(chat_id, UNLINKED_USER_MESSAGE)
        return {"ok": True}

    # Procesar mensaje con el agente
    agent = get_agent()
    response = await agent.process_message(
        telegram_id=telegram_id,
        message=content,
        organizacion_id=user_data.organizacion_id,
        org_nombre=user_data.org_nombre or "Sin nombre",
        user_nombre=user_data.user_nombre or "Usuario",
    )

    await telegram.send_message(chat_id, response, reply_to_message_id=message.message_id)
    return {"ok": True}


async def extract_message_content(message) -> str | None:
    """
    Extrae el contenido del mensaje (texto, audio transcrito, o caption de documento).
    """
    # Texto directo
    if message.text:
        return message.text

    # Audio (voice note)
    if message.voice:
        telegram = get_telegram_service()
        transcription = get_transcription_service()

        audio_path = await telegram.download_file(message.voice.file_id)
        if audio_path:
            try:
                text = await transcription.transcribe(audio_path)
                return text
            finally:
                # Limpiar archivo temporal
                if os.path.exists(audio_path):
                    os.remove(audio_path)

    # Documento (PDF) - por ahora solo extraemos caption
    # TODO: Implementar extracción de contenido de PDF
    if message.document:
        if message.caption:
            return message.caption
        return f"[Documento: {message.document.file_name}]"

    # Foto con caption
    if message.photo and message.caption:
        return message.caption

    return None


async def handle_command(
    chat_id: int,
    telegram_id: int,
    command: str,
    user_data: TelegramUserData | None,
):
    """Maneja comandos especiales del bot"""
    telegram = get_telegram_service()
    cmd = command.lower().strip()

    # /start
    if cmd == "/start":
        if user_data:
            await telegram.send_message(
                chat_id,
                WELCOME_MESSAGE.format(
                    user_nombre=user_data.user_nombre or "Usuario",
                    org_nombre=user_data.org_nombre or "tu organización",
                ),
            )
        else:
            await telegram.send_message(chat_id, UNLINKED_USER_MESSAGE)
        return

    # /vincular <codigo>
    if cmd.startswith("/vincular"):
        # TODO: Implementar vinculación con código
        await telegram.send_message(
            chat_id,
            "La vinculación por código estará disponible pronto. "
            "Por ahora, contacta al administrador.",
        )
        return

    # /cambiar_org
    if cmd == "/cambiar_org":
        if not user_data:
            await telegram.send_message(chat_id, UNLINKED_USER_MESSAGE)
            return

        orgs = await get_user_organizations(user_data.user_id)

        if len(orgs) <= 1:
            await telegram.send_message(
                chat_id,
                NO_MORE_ORGS_MESSAGE.format(org_nombre=user_data.org_nombre or "tu organización"),
            )
            return

        # Guardar orgs para selección
        _pending_org_selection[telegram_id] = orgs

        # Formatear lista
        org_list = "\n".join(
            [f"{i+1}. {org['nombre']}" for i, org in enumerate(orgs)]
        )
        await telegram.send_message(
            chat_id,
            SELECT_ORG_MESSAGE.format(org_list=org_list),
        )
        return

    # /help
    if cmd == "/help":
        help_text = """
Comandos disponibles:

/start - Inicia el bot
/cambiar_org - Cambiar de organización
/vincular <código> - Vincular tu cuenta
/help - Muestra esta ayuda

También puedes enviarme:
• Texto con tu consulta
• Audio describiendo lo que necesitas
• Documentos PDF de contratos
        """
        await telegram.send_message(chat_id, help_text)
        return

    # Comando no reconocido
    await telegram.send_message(
        chat_id,
        "Comando no reconocido. Usa /help para ver los comandos disponibles.",
    )


async def handle_org_selection(
    chat_id: int,
    telegram_id: int,
    content: str,
    user_data: TelegramUserData | None,
):
    """Maneja la selección de organización"""
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

            await telegram.send_message(
                chat_id,
                f"Cambiaste a la organización: {selected_org['nombre']}\n\n"
                f"¿En qué te puedo ayudar?",
            )
        else:
            await telegram.send_message(
                chat_id,
                "Número inválido. Por favor selecciona un número de la lista.",
            )
    except ValueError:
        await telegram.send_message(
            chat_id,
            "Por favor responde con el número de la organización.",
        )
