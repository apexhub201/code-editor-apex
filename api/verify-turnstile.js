export default async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  const { token } = req.body;
  if(!token) return res.status(400).json({success: false, error: 'Missing token'});
  
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token
    })
  });
  
  const data = await response.json();
  return res.status(200).json({ success: data.success, errors: data['error-codes'] });
}
