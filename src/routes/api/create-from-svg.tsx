import { createFileRoute } from "@tanstack/react-router";
import { handleApiRequest } from "../../start/server/web-api";

export const Route = createFileRoute("/api/create-from-svg")({
  server: {
    handlers: {
      POST: ({ request }) => handleApiRequest(request),
    },
  },
});
