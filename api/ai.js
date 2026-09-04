// api/ai.js - Phiên bản tối giản và chắc chắn hoạt động
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;
    
    console.log('Received request with model:', model);
    console.log('Messages length:', messages?.length);

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Sử dụng OpenRouter API thay vì Groq (dễ cấu hình hơn)
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    
    // Fallback: Nếu không có OpenRouter, thử dùng Groq
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!OPENROUTER_API_KEY && !GROQ_API_KEY) {
      console.error('No API key configured');
      return res.status(500).json({ 
        error: 'API key not configured. Add OPENROUTER_API_KEY or GROQ_API_KEY to Vercel env variables.' 
      });
    }

    let response;
    let apiUrl;
    
    if (OPENROUTER_API_KEY) {
      // Sử dụng OpenRouter
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://apexhubeditor.vercel.app',
          'X-Title': 'APEX HUB Editor'
        },
        body: JSON.stringify({
          model: model || 'openai/gpt-oss-120b',
          messages: messages.slice(-20),
          max_tokens: 4000
        })
      });
    } else {
      // Sử dụng Groq
      const modelMap = {
        'openai/gpt-oss-120b': 'llama-3.3-70b-versatile',
        'openai/gpt-oss-20b': 'llama-3.1-8b-instant',
        'qwen/qwen3.6-27b': 'mixtral-8x7b-32768'
      };
      
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: modelMap[model] || 'llama-3.3-70b-versatile',
          messages: messages.slice(-20),
          max_tokens: 4000
        })
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `API request failed: ${response.status}` 
      });
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return res.status(200).json({
        success: true,
        content: data.choices[0].message.content
      });
    } else {
      console.error('Invalid response:', data);
      return res.status(500).json({ error: 'Invalid response from AI service' });
    }

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error: ' + error.message 
    });
  }
}
