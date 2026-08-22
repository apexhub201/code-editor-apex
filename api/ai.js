// API endpoint for APEX AI using Groq
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not set in environment variables');
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const selectedModel = model || 'openai/gpt-oss-120b';

    const requestBody = {
      model: selectedModel,
      messages: messages,
      max_tokens: 4000,
      temperature: 0.3,
      top_p: 0.9
    };

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Groq API error:', errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'Groq API request failed' 
      });
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({ error: 'Invalid response from Groq API' });
    }

    return res.status(200).json({
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage || null
    });

  } catch (error) {
    console.error('APEX AI API error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}
