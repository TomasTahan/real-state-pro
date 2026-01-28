import logging
import os
from dataclasses import dataclass
from datetime import date

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    ResultMessage,
    TextBlock,
)

from src.config import get_settings
from src.agent.prompts import build_system_prompt


logger = logging.getLogger(__name__)


@dataclass
class UserSession:
    """Sesión de un usuario con el agente"""

    session_id: str
    date: date
    organizacion_id: str


class RealStateAgent:
    """Agente de gestión de arriendos con Claude SDK y MCP de Supabase"""

    def __init__(self):
        self.settings = get_settings()
        self.sessions: dict[int, UserSession] = {}  # telegram_id -> session

    def _get_mcp_servers(self) -> dict:
        """Retorna la configuración de MCP servers"""
        return {
            "supabase": {
                "command": "npx",
                "args": [
                    "-y",
                    "@supabase/mcp-server-supabase@latest",
                    "--project-ref",
                    self.settings.supabase_project_ref,
                    "--access-token",
                    self.settings.supabase_access_token,
                ],
            }
        }

    def _get_openrouter_env(self) -> dict[str, str]:
        """Variables de entorno para que el CLI use OpenRouter"""
        env = {}
        for key in [
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
        ]:
            val = os.environ.get(key)
            if val is not None:
                env[key] = val
        return env

    def _create_options(
        self,
        organizacion_id: str,
        org_nombre: str,
        user_nombre: str,
        session_id: str | None = None,
    ) -> ClaudeAgentOptions:
        """Crea las opciones del agente"""
        openrouter_env = self._get_openrouter_env()

        allowed_tools = ["mcp__supabase__*"]

        if session_id:
            # Resumir sesión existente
            return ClaudeAgentOptions(
                mcp_servers=self._get_mcp_servers(),
                permission_mode="acceptEdits",
                allowed_tools=allowed_tools,
                model="sonnet",
                resume=session_id,
                env=openrouter_env,
            )
        else:
            # Nueva sesión
            return ClaudeAgentOptions(
                system_prompt=build_system_prompt(organizacion_id, org_nombre, user_nombre),
                mcp_servers=self._get_mcp_servers(),
                permission_mode="acceptEdits",
                allowed_tools=allowed_tools,
                model="sonnet",
                env=openrouter_env,
            )

    def _get_session(self, telegram_id: int, organizacion_id: str) -> str | None:
        """
        Obtiene el session_id si existe una sesión válida para hoy y la misma org.
        """
        session = self.sessions.get(telegram_id)
        if session and session.date == date.today() and session.organizacion_id == organizacion_id:
            return session.session_id
        return None

    def _save_session(self, telegram_id: int, session_id: str, organizacion_id: str):
        """Guarda la sesión del usuario"""
        self.sessions[telegram_id] = UserSession(
            session_id=session_id,
            date=date.today(),
            organizacion_id=organizacion_id,
        )

    def _clear_session(self, telegram_id: int):
        """Limpia la sesión del usuario"""
        if telegram_id in self.sessions:
            del self.sessions[telegram_id]

    async def process_message(
        self,
        telegram_id: int,
        message: str,
        organizacion_id: str,
        org_nombre: str,
        user_nombre: str,
    ) -> str:
        """
        Procesa un mensaje del usuario y retorna la respuesta del agente.
        """
        # Intentar resumir sesión existente
        existing_session_id = self._get_session(telegram_id, organizacion_id)

        options = self._create_options(
            organizacion_id=organizacion_id,
            org_nombre=org_nombre,
            user_nombre=user_nombre,
            session_id=existing_session_id,
        )

        response_text = ""
        new_session_id = None

        try:
            async with ClaudeSDKClient(options=options) as client:
                await client.query(message)

                async for msg in client.receive_response():
                    if isinstance(msg, AssistantMessage):
                        for block in msg.content:
                            if isinstance(block, TextBlock):
                                response_text += block.text
                    elif isinstance(msg, ResultMessage):
                        new_session_id = msg.session_id

            # Guardar sesión para futuros mensajes
            if new_session_id:
                self._save_session(telegram_id, new_session_id, organizacion_id)

            return response_text or "No pude procesar tu mensaje. Intenta de nuevo."

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            # Limpiar sesión corrupta
            self._clear_session(telegram_id)
            return "Ocurrió un error procesando tu mensaje. Por favor intenta de nuevo."


_agent: RealStateAgent | None = None


def get_agent() -> RealStateAgent:
    global _agent
    if _agent is None:
        _agent = RealStateAgent()
    return _agent
