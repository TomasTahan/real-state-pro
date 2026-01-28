from pydantic import BaseModel, Field


# ============== Telegram Models ==============


class TelegramUser(BaseModel):
    id: int
    is_bot: bool = False
    first_name: str
    last_name: str | None = None
    username: str | None = None


class TelegramPhoto(BaseModel):
    file_id: str
    file_unique_id: str
    width: int
    height: int
    file_size: int | None = None


class TelegramVoice(BaseModel):
    file_id: str
    file_unique_id: str
    duration: int
    mime_type: str | None = None
    file_size: int | None = None


class TelegramDocument(BaseModel):
    file_id: str
    file_unique_id: str
    file_name: str | None = None
    mime_type: str | None = None
    file_size: int | None = None


class TelegramMessage(BaseModel):
    message_id: int
    from_user: TelegramUser | None = Field(default=None, alias="from")
    date: int
    text: str | None = None
    photo: list[TelegramPhoto] | None = None
    voice: TelegramVoice | None = None
    document: TelegramDocument | None = None
    caption: str | None = None

    model_config = {"populate_by_name": True}


class TelegramUpdate(BaseModel):
    update_id: int
    message: TelegramMessage | None = None


# ============== App Models ==============


class TelegramUserData(BaseModel):
    """Datos del usuario vinculado desde la BD"""

    id: str
    telegram_id: int
    user_id: str
    organizacion_id: str
    org_nombre: str | None = None
    user_nombre: str | None = None
