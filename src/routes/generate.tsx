import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchPage, getWorkbenchPageHead } from "../start/client/workbench-page";

export const Route = createFileRoute("/generate")({
  head: getWorkbenchPageHead,
  component: WorkbenchPage,
});
