let scripts = {};

export default function handler(req, res) {

    // TẠO RAW
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

    // XEM RAW
    if (req.method === "GET") {

        const { id } = req.query;

        if (!scripts[id]) {
            return res.status(404).send("Not Found");
        }

        const userAgent =
            req.headers["user-agent"] || "";

        // Người mở bằng trình duyệt
        if (
            userAgent.includes("Mozilla")
        ) {

            res.setHeader(
                "Content-Type",
                "text/plain"
            );

            return res.send(
`ACTIVATE PROTECTION

Access:
https://code-editor-apex-ccmf.vercel.app/`
            );
        }

        // Trả code thật
        res.setHeader(
            "Content-Type",
            "text/plain"
        );

        return res.send(
            scripts[id]
        );
    }

    return res.status(405).end();
}
