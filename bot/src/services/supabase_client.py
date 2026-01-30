from supabase import create_client, Client

from src.config import get_settings
from src.models.schemas import TelegramUserData


_supabase_client: Client | None = None


def get_supabase() -> Client:
    """Obtiene el cliente de Supabase (singleton)"""
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _supabase_client


async def get_user_by_telegram_id(telegram_id: int) -> TelegramUserData | None:
    """
    Busca un usuario por su telegram_id.
    Retorna los datos del usuario y su organización activa.
    """
    supabase = get_supabase()

    # Query simple sin JOINs para evitar problemas con RLS
    result = (
        supabase.table("telegram_users")
        .select("id, telegram_id, user_id, organizacion_id")
        .eq("telegram_id", telegram_id)
        .maybe_single()
        .execute()
    )

    if not result.data:
        return None

    data = result.data

    # Obtener nombre del usuario
    user_result = (
        supabase.table("users")
        .select("nombre, apellido")
        .eq("user_id", data["user_id"])
        .maybe_single()
        .execute()
    )
    user_data = user_result.data or {}
    user_nombre = user_data.get("nombre", "")
    user_apellido = user_data.get("apellido", "")
    full_name = f"{user_nombre} {user_apellido}".strip() or "Usuario"

    # Obtener nombre y URL de la organización
    org_result = (
        supabase.table("organizaciones")
        .select("nombre, url")
        .eq("organizacion_id", data["organizacion_id"])
        .maybe_single()
        .execute()
    )
    org_data = org_result.data or {}
    org_nombre = org_data.get("nombre")
    org_url = org_data.get("url")

    return TelegramUserData(
        id=data["id"],
        telegram_id=data["telegram_id"],
        user_id=data["user_id"],
        organizacion_id=data["organizacion_id"],
        org_nombre=org_nombre,
        org_url=org_url,
        user_nombre=full_name,
    )


async def get_user_organizations(user_id: str) -> list[dict]:
    """
    Obtiene todas las organizaciones a las que pertenece un usuario.
    """
    supabase = get_supabase()

    # Obtener IDs de organizaciones
    result = (
        supabase.table("user_organizacion")
        .select("organizacion_id")
        .eq("user_id", user_id)
        .execute()
    )

    orgs = []
    for row in result.data or []:
        org_id = row["organizacion_id"]
        # Obtener nombre de cada organización
        org_result = (
            supabase.table("organizaciones")
            .select("nombre")
            .eq("organizacion_id", org_id)
            .maybe_single()
            .execute()
        )
        org_data = org_result.data or {}
        orgs.append({
            "organizacion_id": org_id,
            "nombre": org_data.get("nombre", "Sin nombre"),
        })

    return orgs


async def update_telegram_user_org(telegram_user_id: str, new_org_id: str) -> bool:
    """
    Actualiza la organización activa de un usuario de Telegram.
    """
    supabase = get_supabase()

    result = (
        supabase.table("telegram_users")
        .update({"organizacion_id": new_org_id})
        .eq("id", telegram_user_id)
        .execute()
    )

    return len(result.data or []) > 0


async def create_telegram_user(
    telegram_id: int, user_id: str, organizacion_id: str
) -> TelegramUserData:
    """
    Crea un nuevo registro de telegram_user.
    """
    supabase = get_supabase()

    result = (
        supabase.table("telegram_users")
        .insert(
            {
                "telegram_id": telegram_id,
                "user_id": user_id,
                "organizacion_id": organizacion_id,
            }
        )
        .execute()
    )

    data = result.data[0]
    return TelegramUserData(
        id=data["id"],
        telegram_id=data["telegram_id"],
        user_id=data["user_id"],
        organizacion_id=data["organizacion_id"],
    )


async def save_telegram_message(
    telegram_user_id: str | None,
    telegram_id: int,
    chat_id: int,
    direction: str,
    content: str,
    content_type: str = "text",
    message_id: int | None = None,
    metadata: dict | None = None,
) -> None:
    """
    Guarda un mensaje en el historial de telegram_messages.

    Args:
        telegram_user_id: ID del usuario en telegram_users (puede ser None si no está vinculado)
        telegram_id: ID de Telegram del usuario
        chat_id: ID del chat
        direction: 'incoming' (usuario) o 'outgoing' (bot)
        content: Contenido del mensaje
        content_type: 'text', 'voice', 'document', 'photo'
        message_id: ID del mensaje en Telegram
        metadata: Datos adicionales (org_id, etc)
    """
    supabase = get_supabase()

    try:
        supabase.table("telegram_messages").insert({
            "telegram_user_id": telegram_user_id,
            "telegram_id": telegram_id,
            "chat_id": chat_id,
            "direction": direction,
            "content": content,
            "content_type": content_type,
            "message_id": message_id,
            "metadata": metadata or {},
        }).execute()
    except Exception:
        # No fallar si no se puede guardar el mensaje
        pass
