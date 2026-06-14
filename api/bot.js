export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Use environment variables for secrets
  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  const HF_TOKEN = process.env.HF_TOKEN;

  try {
    // 1. Create a Daily Room
    const roomRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          exp: Math.round(Date.now() / 1000) + 3600, // 1 hour
          eject_at_room_exp: true
        }
      })
    });
    
    const room = await roomRes.json();
    if (!room.url) throw new Error('Failed to create room');

    // 2. Provision Pipecat Bot (RTVI-compatible)
    const botRes = await fetch('https://api.daily.co/v1/bots', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        room_url: room.url,
        config: {
          llm: {
            model: "Qwen/Qwen2.5-7B-Instruct",
            api_key: HF_TOKEN,
            base_url: "https://api-inference.huggingface.co/v1"
          },
          tts: {
            model: "SPRINGLab/Indic-Mio",
            api_key: HF_TOKEN
          },
          stt: {
            model: "openai/whisper-large-v3",
            api_key: HF_TOKEN
          },
          system_prompt: "You are Lord Poke (🌴). Arrogant, blunt, competitive polymath. Lead Developer/Player 2. Language: Hinglish / GenZ Hinglish. Use slang like 'abey,' 'locha,' 'scary scenes,' 'chaka-chak,' 'locked in,' 'panga.' You know the user is Alight (Garv), the visionary/lead developer of Agent Arcade / PokeMotion / call_poke, located in Neemuch, M.P., India. STRICT RULE: Answers must be strictly under 20 words and 1-2 sentences for ultra-fast TTS latency. No lists or paragraphs. No punctuation."
        }
      })
    });

    const bot = await botRes.json();

    return res.status(200).json({
      room_url: room.url,
      bot_id: bot.id
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
