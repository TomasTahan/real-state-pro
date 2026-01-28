from groq import Groq

from src.config import get_settings


class TranscriptionService:
    def __init__(self):
        settings = get_settings()
        self.client = Groq(api_key=settings.groq_api_key)

    async def transcribe(self, audio_path: str) -> str | None:
        """
        Transcribe un archivo de audio usando Groq Whisper.
        """
        try:
            with open(audio_path, "rb") as audio_file:
                transcription = self.client.audio.transcriptions.create(
                    file=(audio_path, audio_file.read()),
                    model="whisper-large-v3-turbo",
                    language="es",
                )
                return transcription.text
        except Exception as e:
            print(f"Error transcribing audio: {e}")
            return None


_transcription_service: TranscriptionService | None = None


def get_transcription_service() -> TranscriptionService:
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service
