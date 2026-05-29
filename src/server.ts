import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setupSocketHandlers } from "./lib/socket/server";
import type { ServerToClientEvents, ClientToServerEvents } from "./types";

const dev = process.env.NODE_ENV !== "production";
const basePath = process.env.BASE_PATH || "";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: { origin: "*" },
      path: `${basePath}/api/socketio`,
    }
  );

  setupSocketHandlers(io);

  const port = parseInt(process.env.PORT || "3000");
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
