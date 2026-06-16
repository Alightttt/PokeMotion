import asyncio
import os
import sys
import aiohttp
from loguru import logger

from pipecat.frames.frames import EndFrame, AudioRawFrame, TextFrame, Frame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.services.openai import OpenAILLMService
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.transports.services.daily import DailyTransport
from pipecat.services.base import Service

class HuggingFaceIndicMioTTSService(Service):
    """
    Custom Pipecat Service for SPRINGLab/Indic-Mio via Hugging Face Inference API.
    Configured for 44.1kHz Male voice output.
    """
    def __init__(self, api_token: str, model_id: str = "SPRINGLab/Indic-Mio"):
        super().__init__()
        self._api_token = api_token
        self._model_id = model_id
        self._api_url = f"https://api-inference.huggingface.co/models/{model_id}"

    async def process_frame(self, frame: Frame, direction: Frame.Direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, TextFrame):
            text = frame.text
            logger.info(f"Generating high-fidelity male voice (Indic-Mio) for: {text}")
            
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {self._api_token}"}
                payload = {
                    "inputs": text,
                    "parameters": {
                        "speaker_id": "male", # Strictly male voice requirement
                        "sampling_rate": 44100
                    }
                }
                
                try:
                    async with session.post(self._api_url, headers=headers, json=payload) as response:
                        if response.status == 200:
                            audio_data = await response.read()
                            # Push audio frame at 44.1kHz to the transport
                            await self.push_frame(AudioRawFrame(audio_data, 44100, 1))
                        else:
                            error_text = await response.text()
                            logger.error(f"Hugging Face TTS Error: {response.status} - {error_text}")
                except Exception as e:
                    logger.error(f"TTS Request failed: {e}")

        await self.push_frame(frame, direction)

async def main(room_url: str, token: str):
    # Initialize keys
    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        logger.error("Missing HF_TOKEN environment variable")
        return

    dg_key = os.getenv("DEEPGRAM_API_KEY")
    oa_key = os.getenv("OPENAI_API_KEY")

    async with DailyTransport(
        room_url,
        token,
        "Lord Poke",
        DailyTransport.Params(
            audio_out_enabled=True, 
            audio_out_sample_rate=44100 # Match Indic-Mio 44kHz fidelity
        )
    ) as transport:
        
        # 1. Initialize Services
        stt = DeepgramSTTService(api_key=dg_key)
        llm = OpenAILLMService(api_key=oa_key, model="gpt-4o")
        
        # 2. Custom Indic-Mio TTS Service (44kHz Male Voice)
        tts = HuggingFaceIndicMioTTSService(api_token=hf_token)

        messages = [
            {"role": "system", "content": "You are Lord Poke, a sharp, charismatic, and slightly arrogant AI assistant. Speak concisely and challenge the user to be their best. You have a deep, commanding male voice."}
        ]

        # 3. Build Pipeline
        pipeline = Pipeline([
            transport.input(),
            stt,
            llm,
            tts,
            transport.output(),
        ])

        task = PipelineTask(pipeline, PipelineParams(allow_interruptions=True))

        @transport.event_handler("on_first_participant_joined")
        async def on_first_participant_joined(transport, participant):
            transport.capture_participant_video(participant["id"])
            await task.queue_frames([llm.user_duplex_message(messages)])

        @transport.event_handler("on_participant_left")
        async def on_participant_left(transport, participant, reason):
            await task.queue_frames([EndFrame()])

        runner = PipelineRunner()
        await runner.run(task)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python bot.py <room_url> <bot_token>")
        sys.exit(1)
        
    url = sys.argv[1]
    token = sys.argv[2]
    asyncio.run(main(url, token))
