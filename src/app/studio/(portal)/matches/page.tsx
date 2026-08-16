import { requireOperatorPage } from "@/lib/page-auth";
import { StudioTabs } from "@/components/StudioTabs";
import { LiveView, liveCount } from "./LiveView";
import { BoardView, openMatchCount } from "./BoardView";
import { AllView, totalMatchCount } from "./AllView";

export const dynamic = "force-dynamic";

// One destination for a match. The rail used to carry four: Matchmaking drew
// the live introductions and the whole roster, Conversations drew the same
// introductions with different signal, Matches was the ledger, and Status was
// the board with a second composer on it. Making a match is a separate job and
// keeps its own page; looking at one is this.
//
// The three old routes still exist as redirects, so `actions.ts`, the co-pilot,
// the docs and anybody's bookmarks keep working.

const VIEWS = ["live", "board", "all"] as const;
type View = (typeof VIEWS)[number];

function parseView(value: string | undefined): View {
  return (VIEWS as readonly string[]).includes(value ?? "") ? (value as View) : "live";
}

// The labels are three different words on purpose. "Matches / Matchmaking /
// Live / Board / All" put the same idea in front of an operator five times and
// left them reading the page to work out which was which. The rail says
// Introduce (the act) and Matches (the record), and each tab names what is
// actually in it.
const TAB_LABEL: Record<View, string> = {
  live: "In flight",
  board: "Pipeline",
  all: "History",
};

const BLURB: Record<View, string> = {
  live: "Sent and waiting on a decision. Who has opted in, and whether it needs you.",
  board: "Every open pair, from suggestion to relationship. Where it stalls is where you act.",
  all: "Everyone you have introduced, past and present, including the closed ones.",
};

export default async function Matches({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; resent?: string; closed?: string }>;
}) {
  const [, sp] = await Promise.all([requireOperatorPage(), searchParams]);
  const view = parseView(sp.view);

  // Three cheap counts in one lane, so the tab strip can carry them without a
  // serialised round trip to us-east-2 per tab.
  const [live, open, total] = await Promise.all([liveCount(), openMatchCount(), totalMatchCount()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Matches</h1>
        <p className="mt-1 text-sm text-muted">{BLURB[view]}</p>
      </div>

      <StudioTabs
        ariaLabel="Match views"
        active={view}
        hrefFor={(key) => (key === "live" ? "/studio/matches" : `/studio/matches?view=${key}`)}
        // The `view` keys stay live/board/all: they are what the redirects from
        // /studio/conversations and /studio/pipeline point at, and renaming a
        // label should not break a bookmark.
        tabs={[
          { key: "live", label: TAB_LABEL.live, count: live },
          { key: "board", label: TAB_LABEL.board, count: open },
          { key: "all", label: TAB_LABEL.all, count: total },
        ]}
      />

      {view === "live" && <LiveView resent={sp.resent} closed={sp.closed} />}
      {view === "board" && <BoardView />}
      {view === "all" && <AllView />}
    </div>
  );
}
