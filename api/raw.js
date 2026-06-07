let scripts = {};

export default function handler(req, res) {

    if (req.method === "POST") {

        const { code } = req.body;

        const id = Math.random()
            .toString(36)
            .substring(2, 10);

        scripts[id] = code;

        return res.status(200).json({
            success: true,
            raw: `${req.headers.origin}/api/raw?id=${id}`
        });
    }

    if (req.method === "GET") {

        const { id } = req.query;

        if (!scripts[id]) {
            return res.status(404).send("Not Found");
        }

        res.setHeader(
            "Content-Type",
            "text/plain"
        );

        return res.send(scripts[id]);
    }

    return res.status(405).end();
}
