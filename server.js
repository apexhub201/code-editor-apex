import http from "node:http";
import rawHandler from "./api/raw.js";

const PORT = Number(process.env.PORT || 3000);

function createResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
    },

    status(code) {
      res.statusCode = code;
      return this;
    },

    json(data) {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(data));
    },

    end(data = "") {
      res.end(data);
    },

    send(data = "") {
      res.end(data);
    }
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Vercel-style req.query
  req.query = Object.fromEntries(url.searchParams.entries());

  // Parse JSON body cho POST/PUT
  if (req.method === "POST" || req.method === "PUT") {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch {
        req.body = {};
      }

      try {
        await rawHandler(req, createResponse(res));
      } catch (error) {
        console.error(error);
        if (!res.headersSent) res.statusCode = 500;
        res.end(JSON.stringify({
          success: false,
          error: "Internal server error"
        }));
      }
    });

    return;
  }

  try {
    await rawHandler(req, createResponse(res));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.statusCode = 500;
    res.end(JSON.stringify({
      success: false,
      error: "Internal server error"
    }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`APEX HUB API running on port ${PORT}`);
});
