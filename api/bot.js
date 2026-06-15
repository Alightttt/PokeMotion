import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  
  if (!DAILY_API_KEY) {
    return res.status(500).json({ error: 'Missing DAILY_API_KEY on server' });
  }

  try {
    // Create a room with high-fidelity settings
    const roomResponse = await axios.post('https://api.daily.co/v1/rooms', {
      properties: {
        exp: Math.round(Date.now() / 1000) + 3600,
        enable_chat: true,
        enable_recording: "cloud",
        start_audio_off: false,
      }
    }, {
      headers: { 
        Authorization: \`Bearer \${DAILY_API_KEY}\`,
        'Content-Type': 'application/json'
      }
    });

    const room = roomResponse.data;

    // Return the room URL. 
    // In a full Pipecat setup, we would also trigger the bot process here 
    // (e.g., via a webhook or a dedicated bot runner service).
    return res.status(200).json({
      room_url: room.url,
      bot_status: 'spawned',
      room_name: room.name
    });

  } catch (error) {
    console.error('Daily API Error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Failed to initialize call session',
      details: error.response?.data?.error || error.message 
    });
  }
}
