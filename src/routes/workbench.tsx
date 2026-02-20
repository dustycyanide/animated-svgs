import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchPage, getWorkbenchPageHead } from "../start/client/workbench-page";

export const Route = createFileRoute("/workbench")({
  head: getWorkbenchPageHead,
  component: WorkbenchPage,
});
