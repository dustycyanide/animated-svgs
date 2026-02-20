import { createFileRoute } from "@tanstack/react-router";
import { GridPage, getGridPageHead } from "../start/client/grid-page";

export const Route = createFileRoute("/")({
  head: getGridPageHead,
  component: GridPage,
});
