// API endpoint for APEX AI using Groq
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Messages are required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured. Please set GROQ_API_KEY in environment variables.' 
      });
    }

    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const selectedModel = model || 'openai/gpt-oss-120b';

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages.slice(-20),
        max_tokens: 4000,
        temperature: 0.3,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        success: false, 
        error: errorData.error?.message || 'Groq API request failed' 
      });
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({ success: false, error: 'Invalid response from Groq API' });
    }

    return res.status(200).json({
      success: true,
      content: data.choices[0].message.content,
      model: data.model || selectedModel
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
