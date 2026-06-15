import { PrismaClient } from "@prisma/client";
import { embed } from "../src/lib/ai";
import { profileText } from "../src/lib/copilot";

const db = new PrismaClient();

function avatar(seed: string) {
  return `https://i.pravatar.cc/480?u=${encodeURIComponent(seed)}`;
}

type SingleSpec = {
  name: string;
  email: string;
  city: "NYC" | "SF";
  age: number;
  gender: "woman" | "man";
  seeking: string;
  neighborhood: string;
  headline: string;
  bio: string;
  lookingFor: string;
  dealBreakers: string;
  prompts: [string, string][];
};

const singles: SingleSpec[] = [
  {
    name: "Maya Rosen", email: "maya@example.com", city: "NYC", age: 29, gender: "woman", seeking: "man",
    neighborhood: "West Village", headline: "Cookbook editor who runs on espresso and long walks",
    bio: "Edits cookbooks for a living, so I have strong and unsolicited opinions about your pasta water. Half-marathoner, terrible at chess, very good at planning trips.",
    lookingFor: "Someone curious and kind who reads actual books and wants a real partnership, not a situationship.",
    dealBreakers: "Smoking, and people who are mean to waiters.",
    prompts: [["The way to my heart is", "a perfect roast chicken and a plan for the weekend."], ["I geek out on", "regional Italian food and old New Yorker essays."]],
  },
  {
    name: "Jordan Lee", email: "jordan@example.com", city: "NYC", age: 32, gender: "woman", seeking: "man",
    neighborhood: "Fort Greene", headline: "Architect, jazz obsessive, weekend potter",
    bio: "I design libraries and schools. I throw pottery on Sundays and most of it is lopsided. Looking for someone with their own thing going on.",
    lookingFor: "An equal. Someone ambitious but warm, who wants kids eventually.",
    dealBreakers: "Doesn't want kids; allergic to commitment.",
    prompts: [["My ideal Sunday", "farmers market, pottery studio, a long dinner."], ["I'm weirdly competitive about", "crosswords and Mario Kart."]],
  },
  {
    name: "David Cohen", email: "davidc@example.com", city: "NYC", age: 34, gender: "man", seeking: "woman",
    neighborhood: "Williamsburg", headline: "Founder, ex-musician, makes a mean negroni",
    bio: "Building a climate startup. Played in a band for a decade so I still know every dive with a good jukebox. Direct, warm, a little intense about the things I love.",
    lookingFor: "A partner who is building something of her own and wants to build a life together.",
    dealBreakers: "Flakiness.",
    prompts: [["I'll fall for you if", "you have a cause you can't shut up about."], ["My most controversial take", "brunch is overrated, dinner is the only meal."]],
  },
  {
    name: "Ben Adler", email: "ben@example.com", city: "NYC", age: 31, gender: "man", seeking: "woman",
    neighborhood: "Cobble Hill", headline: "ER doctor who somehow still loves people",
    bio: "Work nights in an emergency room so my schedule is chaos, but I show up when it counts. Big reader, bigger eater, training for the marathon.",
    lookingFor: "Someone steady and funny who gets that my job is intense but my heart is in it.",
    dealBreakers: "No empathy.",
    prompts: [["The hallmark of a life well lived", "people who'd drop everything for you."], ["I'm looking for", "my person, genuinely. Done with games."]],
  },
  {
    name: "Sofia Marin", email: "sofia@example.com", city: "NYC", age: 28, gender: "woman", seeking: "man",
    neighborhood: "Park Slope", headline: "Documentary producer, salsa dancer, dog aunt",
    bio: "I make films about people doing brave things. I dance salsa on Thursdays and will absolutely drag you to a class. Loud laugh, soft heart.",
    lookingFor: "Someone with range. Can hold a real conversation and also be silly.",
    dealBreakers: "No sense of humor.",
    prompts: [["We'll get along if", "you can dance badly without caring."], ["I spend too much money on", "flights and good olive oil."]],
  },
  {
    name: "Marcus Webb", email: "marcus@example.com", city: "NYC", age: 36, gender: "man", seeking: "woman",
    neighborhood: "Harlem", headline: "Civil rights lawyer, vinyl collector, runs the BBQ",
    bio: "I litigate things that matter. On weekends I'm at the record shop or manning the grill for anyone who shows up. Looking for something serious.",
    lookingFor: "A partner who cares about the world and wants a family.",
    dealBreakers: "Apathy about anything.",
    prompts: [["I want a relationship that's", "a true team, ride or die."], ["Best meal of my life", "my grandmother's gumbo, no contest."]],
  },
  {
    name: "Priya Nair", email: "priya@example.com", city: "NYC", age: 30, gender: "woman", seeking: "man",
    neighborhood: "Long Island City", headline: "Product designer, rock climber, plant hoarder",
    bio: "I design apps you've probably used. Climb three times a week, kill houseplants slightly slower than I buy them. Calm on the outside, very online on the inside.",
    lookingFor: "A genuinely kind, ambitious guy who is emotionally available.",
    dealBreakers: "Emotionally unavailable.",
    prompts: [["My love language is", "acts of service and good snacks."], ["I'm secretly great at", "parallel parking and trivia."]],
  },
  {
    name: "Tom Hessler", email: "tom@example.com", city: "NYC", age: 33, gender: "man", seeking: "woman",
    neighborhood: "Greenpoint", headline: "Chef turned food-tech PM, marathoner",
    bio: "Cooked in restaurants for years, now I build software for them. I'll feed you well and out-walk you in the city. Even-keeled and curious.",
    lookingFor: "Someone warm and driven who wants a partner, not a project.",
    dealBreakers: "Constant negativity.",
    prompts: [["Way to my heart", "let me cook for you and actually enjoy it."], ["I geek out on", "ramen, running splits, and city planning."]],
  },
  {
    name: "Elena Voss", email: "elena@example.com", city: "SF", age: 31, gender: "woman", seeking: "man",
    neighborhood: "Hayes Valley", headline: "Climate VC, trail runner, terrible singer",
    bio: "I fund climate companies and run trails on the headlands. I sing loudly and badly in the car. Looking for a real grown-up partnership.",
    lookingFor: "Ambitious, kind, wants a family, can keep up on a hike.",
    dealBreakers: "Climate deniers; bad tippers.",
    prompts: [["My ideal weekend", "Marin trailhead at 7am, oysters by noon."], ["I'm looking for", "a teammate for the long haul."]],
  },
  {
    name: "Raj Patel", email: "raj@example.com", city: "SF", age: 33, gender: "man", seeking: "woman",
    neighborhood: "Mission", headline: "Staff engineer, amateur baker, board-game host",
    bio: "I write code at a company you've heard of and bake sourdough that's genuinely good. Host a game night that's gotten out of hand. Steady, funny, loyal.",
    lookingFor: "Someone warm and witty who wants to build a home and a family.",
    dealBreakers: "Doesn't want kids.",
    prompts: [["You should message me if", "you'll judge my sourdough honestly."], ["My happy place", "a loud kitchen full of friends."]],
  },
  {
    name: "Hannah Brooks", email: "hannah@example.com", city: "SF", age: 29, gender: "woman", seeking: "man",
    neighborhood: "Noe Valley", headline: "Pediatric nurse, surfer, ceramics nerd",
    bio: "I take care of tiny humans all day and surf at Linda Mar to reset. Make mugs nobody asked for. Warm, direct, low drama.",
    lookingFor: "Kind, grounded, emotionally available, wants kids.",
    dealBreakers: "Flaky or cold.",
    prompts: [["My love language", "showing up, every time."], ["I'm great at", "staying calm when everything's on fire."]],
  },
  {
    name: "Chris Tanaka", email: "chris@example.com", city: "SF", age: 35, gender: "man", seeking: "woman",
    neighborhood: "Bernal Heights", headline: "Design lead, cyclist, jazz on vinyl",
    bio: "Lead design at a startup, ride my bike everywhere, collect jazz records. Calm, curious, a good listener. Ready for the real thing.",
    lookingFor: "A partner with depth who wants a quiet, full life together.",
    dealBreakers: "Status-obsessed.",
    prompts: [["I want a relationship that's", "calm, honest, and a little adventurous."], ["I geek out on", "typography and bike routes."]],
  },
  {
    name: "Nina Castillo", email: "nina@example.com", city: "SF", age: 30, gender: "woman", seeking: "man",
    neighborhood: "Potrero Hill", headline: "Biotech scientist, climber, sci-fi reader",
    bio: "I work on cancer therapies, climb on weekends, and read too much sci-fi. Nerdy, warm, and surprisingly competitive at bar trivia.",
    lookingFor: "A smart, kind partner who has their own life and wants to share it.",
    dealBreakers: "Anti-science.",
    prompts: [["We'll vibe if", "you'll argue about Dune with me."], ["My happy place", "mid-route on a sunny crag."]],
  },
  {
    name: "Sam Okafor", email: "sam@example.com", city: "SF", age: 34, gender: "man", seeking: "woman",
    neighborhood: "Cole Valley", headline: "Doctor, runner, mediocre guitarist",
    bio: "Primary care physician, marathoner, I play guitar badly but with feeling. Calm, warm, family-oriented. Looking for the long haul.",
    lookingFor: "Someone kind and ambitious who wants a family and a partnership of equals.",
    dealBreakers: "Doesn't want kids.",
    prompts: [["The way to my heart", "a long run and a longer brunch."], ["I'm looking for", "my teammate for life."]],
  },
];

async function main() {
  console.log("Resetting tables...");
  // delete in FK-safe order
  await db.conciergeMessage.deleteMany();
  await db.conciergeThread.deleteMany();
  await db.reference.deleteMany();
  await db.note.deleteMany();
  await db.match.deleteMany();
  await db.vouch.deleteMany();
  await db.referral.deleteMany();
  await db.dinnerAttendee.deleteMany();
  await db.dinner.deleteMany();
  await db.coachingEngagement.deleteMany();
  await db.venueSlot.deleteMany();
  await db.venue.deleteMany();
  await db.photo.deleteMany();
  await db.prompt.deleteMany();
  await db.person.deleteMany();

  // ---- operators -----------------------------------------------------------
  const jess = await db.person.create({
    data: { name: "Jess", email: "jess@meetcute.co", city: "NYC", isOperator: true, status: "active", headline: "Overall lead, matchmaker" },
  });
  const zoe = await db.person.create({
    data: { name: "Zoe", email: "zoe@meetcute.co", city: "NYC", isOperator: true, status: "active", headline: "NYC co-lead, roster + member experience" },
  });
  const erik = await db.person.create({
    data: { name: "Erik", email: "erik@meetcute.co", city: "SF", isOperator: true, isCoach: true, status: "active", headline: "SF lead, brand, couples coaching" },
  });

  // ---- coaches -------------------------------------------------------------
  await db.person.create({ data: { name: "Emily Brenes", email: "emily@coach.co", city: "NYC", isCoach: true, status: "active", coachBio: "Dating + relationship coach, 8 years." } });
  await db.person.create({ data: { name: "Jessica Holton", email: "jess.h@coach.co", city: "SF", isCoach: true, status: "active", coachBio: "Couples coach, attachment-focused." } });

  // ---- ambassadors (supply engine) ----------------------------------------
  const amb = await Promise.all(
    [
      { name: "Olivia Grant", email: "olivia@amb.co", city: "NYC" as const, title: "Founding Ambassador" },
      { name: "Daniel Stern", email: "daniel@amb.co", city: "NYC" as const, title: "Founding Ambassador" },
      { name: "Aisha Rahman", email: "aisha@amb.co", city: "SF" as const, title: "Founding Ambassador" },
      { name: "Leo Marchetti", email: "leo@amb.co", city: "SF" as const, title: "Founding Ambassador" },
    ].map((a) =>
      db.person.create({
        data: {
          name: a.name, email: a.email, city: a.city, isAmbassador: true, status: "active",
          ambassadorTitle: a.title, ambassadorSince: new Date("2026-01-15"),
          headline: "Ambassador", photos: { create: [{ url: avatar(a.email), order: 0 }] },
        },
      })
    )
  );

  // ---- venues with standing held slots ------------------------------------
  const venues = [
    { city: "NYC", name: "Via Carota", area: "West Village", days: [[2, "19:00"], [3, "19:30"], [4, "20:00"]] },
    { city: "NYC", name: "The Long Island Bar", area: "Cobble Hill", days: [[1, "19:00"], [4, "19:00"], [5, "18:30"]] },
    { city: "SF", name: "Zuni Café", area: "Hayes Valley", days: [[2, "19:00"], [3, "19:30"], [4, "20:00"]] },
    { city: "SF", name: "Bar Crenn", area: "Cow Hollow", days: [[1, "19:00"], [4, "19:30"], [5, "19:00"]] },
  ];
  for (const v of venues) {
    await db.venue.create({
      data: {
        city: v.city, name: v.name, area: v.area, partner: true,
        slots: { create: v.days.map(([d, t]) => ({ dayOfWeek: d as number, time: t as string, held: true })) },
      },
    });
  }

  // ---- singles -------------------------------------------------------------
  console.log("Creating singles + embeddings...");
  const ambByCity = { NYC: [amb[0], amb[1]], SF: [amb[2], amb[3]] };
  const created: Record<string, string> = {};
  let i = 0;
  for (const s of singles) {
    const referrer = ambByCity[s.city][i % 2];
    const emb = await embed(
      profileText({ ...s, prompts: s.prompts.map(([question, answer]) => ({ question, answer })) })
    );
    const p = await db.person.create({
      data: {
        name: s.name, email: s.email, city: s.city, age: s.age, gender: s.gender, seeking: s.seeking,
        neighborhood: s.neighborhood, headline: s.headline, bio: s.bio, lookingFor: s.lookingFor,
        dealBreakers: s.dealBreakers, status: "active", fastTracked: true,
        appliedAt: new Date("2026-02-01"), acceptedAt: new Date("2026-02-05"),
        referredById: referrer.id, embedding: JSON.stringify(emb),
        photos: { create: [{ url: avatar(s.email), order: 0 }] },
        prompts: { create: s.prompts.map(([q, a], o) => ({ question: q, answer: a, order: o })) },
        invitesSent: { create: [{ code: `MC-${s.name.split(" ")[0].toUpperCase()}-${1000 + i}`, fastTrack: true }] },
      },
    });
    created[s.email] = p.id;
    i++;
  }

  const id = (email: string) => created[email];

  // ---- dinners + attendees (builds the mutual-friend graph) ----------------
  const dinner1 = await db.dinner.create({
    data: { city: "NYC", date: new Date("2026-03-12T19:00:00"), venue: "Via Carota", theme: "Founders + creatives", status: "done", capacity: 12 },
  });
  const dinner2 = await db.dinner.create({
    data: { city: "SF", date: new Date("2026-03-20T19:00:00"), venue: "Zuni Café", theme: "Operators + scientists", status: "done", capacity: 12 },
  });
  const dinner3 = await db.dinner.create({
    data: { city: "NYC", date: new Date("2026-06-25T19:00:00"), venue: "The Long Island Bar", theme: "Summer mixer", status: "open", capacity: 12 },
  });

  const nycDiners = ["maya@example.com", "jordan@example.com", "davidc@example.com", "ben@example.com", "sofia@example.com", "priya@example.com"];
  const sfDiners = ["elena@example.com", "raj@example.com", "hannah@example.com", "chris@example.com", "nina@example.com", "sam@example.com"];
  await db.dinnerAttendee.createMany({
    data: nycDiners.map((e) => ({ dinnerId: dinner1.id, personId: id(e), status: "attended" })),
  });
  await db.dinnerAttendee.createMany({
    data: sfDiners.map((e) => ({ dinnerId: dinner2.id, personId: id(e), status: "attended" })),
  });
  await db.dinnerAttendee.createMany({
    data: ["maya@example.com", "tom@example.com", "marcus@example.com"].map((e) => ({ dinnerId: dinner3.id, personId: id(e), status: "confirmed" })),
  });

  // ---- vouches (passive layer) ---------------------------------------------
  const vouchPairs: [string, string, string][] = [
    ["olivia@amb.co", "maya@example.com", "Known Maya for years. The most thoughtful person I know."],
    ["daniel@amb.co", "maya@example.com", "Brilliant, hilarious, weirdly humble."],
    ["jordan@example.com", "maya@example.com", "We went to school together. Marry her."],
    ["aisha@amb.co", "elena@example.com", "Elena is the real deal. Driven and so kind."],
    ["raj@example.com", "elena@example.com", "Trail-running partner. Best human."],
    ["olivia@amb.co", "davidc@example.com", "David is intense in the best way. Total catch."],
    ["leo@amb.co", "raj@example.com", "Raj throws the best game night in SF. Loyal to a fault."],
    ["daniel@amb.co", "ben@example.com", "Ben is the friend who shows up at 3am. No notes."],
  ];
  for (const [v, s, note] of vouchPairs) {
    await db.vouch.create({ data: { voucherId: id(v) ?? amb.find((a) => a.email === v)!.id, subjectId: id(s), note } });
  }

  // ---- matches across every pipeline stage ---------------------------------
  // suggested (pending)
  await db.match.create({
    data: {
      personAId: id("jordan@example.com"), personBId: id("davidc@example.com"),
      stage: "suggested", aDecision: "yes", bDecision: "pending", createdById: jess.id,
      rationale: "Both builders, both want kids, both have a creative practice on the side. Jordan needs someone with their own engine and David has one.",
    },
  });
  // mutual_yes (no thread yet -> concierge will spin up)
  const m2 = await db.match.create({
    data: {
      personAId: id("maya@example.com"), personBId: id("ben@example.com"),
      stage: "mutual_yes", aDecision: "yes", bDecision: "yes", createdById: jess.id,
      rationale: "Maya wants curious + kind + reads real books. Ben is the warm ER doctor done with games. High vouch overlap.",
    },
  });
  // date_scheduled (with confirmed thread) - built below for Sofia + Marcus
  const m3 = await db.match.create({
    data: {
      personAId: id("sofia@example.com"), personBId: id("marcus@example.com"),
      stage: "date_scheduled", aDecision: "yes", bDecision: "yes", createdById: zoe.id,
      rationale: "Both care loudly about the world, both want family. Sofia's energy + Marcus's steadiness.",
    },
  });
  // relationship (the flywheel)
  await db.match.create({
    data: {
      personAId: id("priya@example.com"), personBId: id("tom@example.com"),
      stage: "relationship", aDecision: "yes", bDecision: "yes", createdById: jess.id,
      rationale: "Acts-of-service love language meets the guy who wants to cook for someone. Met at the March dinner.",
    },
  });
  // SF pending suggestion
  await db.match.create({
    data: {
      personAId: id("elena@example.com"), personBId: id("raj@example.com"),
      stage: "suggested", aDecision: "pending", bDecision: "pending", createdById: erik.id,
      rationale: "Both want a teammate + family, both are weekend-outdoors people. Raj's warmth balances Elena's intensity.",
    },
  });

  // confirmed thread for Sofia + Marcus
  const venueNyc = await db.venue.findFirst({ where: { name: "Via Carota" } });
  const slot = new Date();
  slot.setDate(slot.getDate() + 2);
  slot.setHours(19, 0, 0, 0);
  const thread = await db.conciergeThread.create({
    data: {
      matchId: m3.id, venueId: venueNyc!.id, state: "confirmed", round: 1,
      proposedSlots: JSON.stringify([slot.toISOString()]), aPick: slot.toISOString(),
      bPick: slot.toISOString(), confirmedSlot: slot,
    },
  });
  await db.conciergeMessage.createMany({
    data: [
      { threadId: thread.id, direction: "out", toPersonId: id("sofia@example.com"), body: "You matched with Marcus 🎉 I've got you a table at Via Carota.", kind: "propose" },
      { threadId: thread.id, direction: "out", toPersonId: id("sofia@example.com"), body: "You're set with Marcus at Via Carota. Ask for the Meet Cute table. 🥂", kind: "confirm" },
    ],
  });

  // ---- notes ---------------------------------------------------------------
  await db.note.createMany({
    data: [
      { subjectId: id("jordan@example.com"), authorId: jess.id, kind: "general", body: "Jordan said she's done with apps. Wants intentional intros only. Two-week response window is fine for her." },
      { subjectId: id("maya@example.com"), authorId: zoe.id, kind: "postdate", body: "After a coffee with someone off-roster in Feb, Maya said chemistry matters but kindness matters more. Prioritize warm over flashy." },
      { subjectId: id("davidc@example.com"), authorId: jess.id, kind: "rationale", body: "David passed on two finance guys' profiles, wants someone mission-driven. Lead with the climate/cause angle." },
      { subjectId: id("ben@example.com"), authorId: jess.id, kind: "general", body: "Ben works ER nights Tue/Wed. Schedule dates Thu-Sun. Very responsive on text." },
      { subjectId: id("elena@example.com"), authorId: erik.id, kind: "general", body: "Elena travels for work ~1 week/month. Best to batch intros when she's in town." },
    ],
  });

  // ---- coaching engagements ------------------------------------------------
  const emily = await db.person.findUnique({ where: { email: "emily@coach.co" } });
  await db.coachingEngagement.create({
    data: { clientId: id("ben@example.com"), coachId: emily!.id, type: "dating", status: "active", sessions: 2, notes: "Profile + first-date prep." },
  });
  await db.coachingEngagement.create({
    data: { clientId: id("priya@example.com"), coachId: erik.id, type: "couples", partnerId: id("tom@example.com"), status: "active", sessions: 1, notes: "New couple, communication foundations." },
  });

  // ---- application queue (pending applicants, not yet accepted) ------------
  // Makes the accept-rate metric honest: we are selective, not a theater.
  const firsts = ["Alex", "Sam", "Jamie", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery", "Drew", "Cameron", "Reese", "Devon", "Skyler", "Jordan", "Parker", "Rowan", "Sasha", "Blake", "Emerson", "Hayden", "Finley", "Kai", "Logan", "Marlowe", "Noa", "Oakley", "Phoenix", "River", "Sage", "Tatum", "Wren", "Arden", "Bryn", "Ellis", "Frankie"];
  await db.person.createMany({
    data: firsts.map((f, k) => ({
      name: `${f} ${["Applicant", "Hopeful", "Prospect"][k % 3]}`,
      email: `applicant${k}@queue.co`,
      city: k % 2 ? "SF" : "NYC",
      status: "applicant",
      appliedAt: new Date(2026, 4, 1 + (k % 28)),
    })),
  });

  const counts = {
    people: await db.person.count(),
    applicants: await db.person.count({ where: { status: "applicant" } }),
    singles: await db.person.count({ where: { isOperator: false, isAmbassador: false, isCoach: false } }),
    matches: await db.match.count(),
    vouches: await db.vouch.count(),
    venues: await db.venue.count(),
    dinners: await db.dinner.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
