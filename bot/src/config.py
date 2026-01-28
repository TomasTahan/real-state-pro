from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Telegram
    telegram_bot_token: str

    # Supabase MCP
    supabase_project_ref: str
    supabase_access_token: str

    # Supabase Client
    supabase_url: str
    supabase_service_role_key: str

    # Groq
    groq_api_key: str

    # Server
    webhook_url: str | None = None
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
