"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@/types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket() {
  const socketRef = useRef<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const socket: TypedSocket = io({
      path: "/savint/api/socketio",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.3,
      timeout: 10000,
    });

    socket.on("connect", () => {
      setConnected(true);
      setReconnecting(false);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.io.on("reconnect_attempt", () => {
      setReconnecting(true);
    });

    socket.io.on("reconnect_failed", () => {
      setReconnecting(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socket: socketRef.current, connected, reconnecting };
}
