import { createFileRoute } from "@tanstack/react-router";
import { handleApiRequest } from "../../../start/server/web-api";

export const Route = createFileRoute("/api/library/unhide")({
  server: {
    handlers: {
      POST: ({ request }) => handleApiRequest(request),
    },
  },
});
