export const dynamic = "force-dynamic";

export default function StudioShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f5f5f6]">{children}</div>;
}
