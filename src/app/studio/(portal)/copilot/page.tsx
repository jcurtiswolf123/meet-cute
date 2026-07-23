import CopilotChat from "./CopilotChat";
import { requireOperatorPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  await requireOperatorPage();
  return <CopilotChat />;
}
