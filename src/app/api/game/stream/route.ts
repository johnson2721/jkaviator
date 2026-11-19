import { ensureEngine } from "@/lib/game/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const engine = ensureEngine();
  await engine.readyPromise;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const client = {
        push: (payload: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          } catch {
            closed = true;
          }
        },
      };

      engine.addClient(client);
      client.push(JSON.stringify({ type: "hello", snapshot: engine.snapshot() }));

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        engine.removeClient(client);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      /* stream torn down */
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
