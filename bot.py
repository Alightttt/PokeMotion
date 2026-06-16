import asyncio
import os
import sys

from pipecat.frames.frames import EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.services.openai import OpenAILLMService
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.transports.services.daily import DailyTransport

from loguru import logger

# Note: For Hugging Face TTS with a custom model like Indic-Mio, 
# a custom Service class would normally be implemented. 
# Here we provide the standard pipeline structure using Cartesia/OpenAI 
# as placeholders, which you can swap for your HF Inference API implementation.

async def main(room_url: str, token: str):
    async with DailyTransport(
        room_url,
        token,
        "Lord Poke",
        DailyTransport.Params(audio_out_enabled=True)
    ) as transport:
        
        # 1. Initialize Services
        # Replace with your specific API keys and model choices
        stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))
        llm = OpenAILLMService(api_key=os.getenv("OPENAI_API_KEY"), model="gpt-4o")
        
        # TTS Placeholder for HF Inference API (SpringLab/Indic-Mio)
        # You would typically use a custom Pipecat TTS Service here
        from pipecat.services.cartesia import CartesiaTTSService
        tts = CartesiaTTSService(
            api_key=os.getenv("CARTESIA_API_KEY"),
            voice_id="79a125e8-cd45-4c13-8a67-27562218803a" # Example ID
        )

        messages = [
            {"role": "system", "content": "You are Lord Poke, a sharp, charismatic, and slightly arrogant AI assistant. Speak concisely and challenge the user to be their best."}
        ]

        # 2. Build Pipeline
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
    url = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DAILY_SAMPLE_ROOM_URL")
    token = sys.argv[2] if len(sys.argv) > 2 else os.getenv("DAILY_AUTH_TOKEN")
    asyncio.run(main(url, token))
