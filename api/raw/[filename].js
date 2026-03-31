// api/raw/[filename].js
export default async function handler(req, res) {
  const { filename } = req.query;
  
  if (!filename || !filename.endsWith('.lua')) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  try {
    // Lấy content từ memory store (trong thực tế dùng database hoặc storage)
    const content = global.rawStore?.[filename];
    
    if (!content) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set headers cho raw file
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    return res.status(200).send(content);
    
  } catch (error) {
    console.error('Error serving raw:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
