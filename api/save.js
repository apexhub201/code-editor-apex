export default async function handler(req, res) {
  const { content, id } = req.body;

  if (!content || !id) {
    return res.json({ success: false });
  }

  const url = `https://apex-hub-global-ffd6a-default-rtdb.firebaseio.com/scripts/${id}.json`;

  await fetch(url, {
    method: "PUT",
    body: JSON.stringify({ content })
  });

  res.json({
    success: true,
    url: `https://code-editor-apex-ccmf.vercel.app/api/get?id=${id}`
  });
}
