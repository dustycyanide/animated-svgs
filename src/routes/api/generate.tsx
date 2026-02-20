import { createFileRoute } from "@tanstack/react-router";
import { handleApiRequest } from "../../start/server/web-api";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: ({ request }) => handleApiRequest(request),
    },
  },
});
