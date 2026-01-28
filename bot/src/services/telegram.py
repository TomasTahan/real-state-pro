import httpx
import tempfile
import os

from src.config import get_settings


class TelegramService:
    def __init__(self):
        settings = get_settings()
        self.token = settings.telegram_bot_token
        self.base_url = f"https://api.telegram.org/bot{self.token}"
        self.file_url = f"https://api.telegram.org/file/bot{self.token}"

    async def send_message(
        self,
        chat_id: int,
        text: str,
        reply_to_message_id: int | None = None,
        parse_mode: str = "MarkdownV2",
    ) -> dict:
        """Envía un mensaje a un chat"""
        async with httpx.AsyncClient() as client:
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            }
            if reply_to_message_id:
                payload["reply_to_message_id"] = reply_to_message_id

            response = await client.post(f"{self.base_url}/sendMessage", json=payload)
            return response.json()

    async def download_file(self, file_id: str) -> str | None:
        """
        Descarga un archivo de Telegram y lo guarda en un archivo temporal.
        Retorna la ruta del archivo.
        """
        async with httpx.AsyncClient() as client:
            # Obtener file_path
            response = await client.get(f"{self.base_url}/getFile", params={"file_id": file_id})
            data = response.json()

            if not data.get("ok"):
                return None

            file_path = data["result"]["file_path"]

            # Descargar archivo
            file_response = await client.get(f"{self.file_url}/{file_path}")

            if file_response.status_code != 200:
                return None

            # Guardar en archivo temporal
            extension = os.path.splitext(file_path)[1] or ".tmp"
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=extension)
            temp_file.write(file_response.content)
            temp_file.close()

            return temp_file.name

    async def set_webhook(self, webhook_url: str) -> bool:
        """Configura el webhook de Telegram"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/setWebhook",
                json={"url": webhook_url},
            )
            data = response.json()
            return data.get("ok", False)

    async def delete_webhook(self) -> bool:
        """Elimina el webhook de Telegram"""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{self.base_url}/deleteWebhook")
            data = response.json()
            return data.get("ok", False)


_telegram_service: TelegramService | None = None


def get_telegram_service() -> TelegramService:
    global _telegram_service
    if _telegram_service is None:
        _telegram_service = TelegramService()
    return _telegram_service
