import { createFileRoute } from "@tanstack/react-router";
import { GridPage, getGridPageHead } from "../start/client/grid-page";

export const Route = createFileRoute("/grid")({
  head: getGridPageHead,
  component: GridPage,
});
