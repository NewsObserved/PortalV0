/**
 * Seed editorially-assigned stories into the queue (not community submissions).
 *
 *   npm run desk:seed
 *
 * Each carries a research brief of what has been verified and what has NOT,
 * so the agent starts from facts rather than assumptions. Confirmation email
 * is pre-stamped: nobody needs a receipt for a desk assignment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "../lib/supabase";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* ambient env */
  }
}

interface DeskStory {
  ref_id: string;
  day: string;
  headline: string;
  category: string;
  location: string;
  story: string;
}

const STORIES: DeskStory[] = [
  {
    ref_id: "NO-DESK01",
    day: "Sunday",
    headline: "Black woman found hanging in tree behind vacant Jackson home",
    category: "Justice",
    location: "Jackson, Mississippi",
    story: `DESK ASSIGNMENT — national slate, high sensitivity.

VERIFIED: Jackson police responded to the 500 block of Remembrance around 7:30 p.m. on Monday after a report of a woman hanging in a tree behind a vacant home. The Hinds County Coroner's Office identified her as Tasia Fortune, 29. Coroner Jeremiah Howard said the body would go to the Mississippi State Medical Examiner's Office for an autopsy to determine cause and manner of death. The Jackson Police Department declined to release an incident report, citing an active investigation.

NOT ESTABLISHED: Cause of death. Manner of death. Whether foul play is suspected — authorities have not said. Do NOT characterize this as a lynching or a homicide. The story is the death, the silence, and the context — not a conclusion.

CONTEXT TO VERIFY: In September 2025 an 18-year-old Delta State University student, Trey Reed, who was Black, was found hanging from a tree on the Cleveland, Mississippi campus. Mississippi's history of lynching is why these cases carry the weight they do for Black readers.

REPORTING TASKS: Confirm current status of the autopsy. Seek comment from JPD and the coroner. Check whether the family has spoken publicly or retained counsel. Establish what, if anything, national outlets have reported.

SOURCES: mississippifreepress.org (Tasia Fortune identification), capitalbnews.org, mississippitoday.org (Aug 6 2026 coroner ID).`,
  },
  {
    ref_id: "NO-DESK02",
    day: "Monday",
    headline: "Three charged with threatening judge and witnesses in Nolan Wells case",
    category: "Justice",
    location: "Mississippi Gulf Coast",
    story: `DESK ASSIGNMENT — national slate, high sensitivity.

VERIFIED: Nolan Xavier Wells, an 18-year-old Black teenager, went missing during a Fourth of July boat trip with friends and was later found dead. Authorities believe he drowned and have said they do not suspect foul play. Civil rights attorney Ben Crump has pointed to what he calls "glaring contradictions" in witness accounts — whether Wells stayed on or left the island, why he did not have his phone, and whether a young athlete who could swim would drown. Three people have been charged with threatening witnesses, officials and a judge connected to the case. Wells's parents have appeared publicly with the families of Daniel Erving and Tyler Smith, two other Black 18-year-olds who died in unclear circumstances.

NOT ESTABLISHED: That Wells was killed. That the friends caused his death. Reporting that community members noted the friends present were white is a fact about the community's questions — it is not evidence of a crime.

THE STRONGEST ANGLE: The witness-intimidation charges are documented court fact. A case where people are charged with threatening a judge and witnesses is newsworthy on its own terms and does not require speculating about the death.

REPORTING TASKS: Identify the three charged and the specific charges. Confirm the current status of the death investigation. Verify the Erving and Smith cases before mentioning them.

SOURCES: washingtonpost.com (Aug 6 2026, three charged), pbs.org/newshour (what we know about the death), mississippitoday.org (July 30 2026, three Black teens, unresolved).`,
  },
  {
    ref_id: "NO-DESK03",
    day: "Tuesday",
    headline: "Federal task force has shot seven people in Memphis, four fatally — with almost no national coverage",
    category: "Justice",
    location: "Memphis, Tennessee",
    story: `DESK ASSIGNMENT — national slate.

VERIFIED: The Tennessee Lookout reported on August 3, 2026 that agents with the Memphis Safe Task Force have shot seven people, four fatally, and that the shootings have drawn little national news coverage. The task force was announced by Trump in September to "end violent crime" through what was described as large-scale saturation of neighborhoods.

WHY IT IS OURS: This is the definition of a buried story — federal agents killing people in a majority-Black city, covered locally and largely ignored nationally. The absence of coverage is itself part of the story.

REPORTING TASKS: Confirm the count and dates of each shooting. Identify who was killed, and whether the families have spoken. Establish which agencies make up the task force and what oversight or review applies to agent shootings. Seek comment from the task force and from Memphis officials. Verify what national coverage exists.

SOURCES: tennesseelookout.com (Aug 3 2026).`,
  },
  {
    ref_id: "NO-DESK04",
    day: "Wednesday",
    headline: "The paperwork problem taking Black families' land — 3.5 million acres and counting",
    category: "Economy",
    location: "National — Deep South focus",
    story: `DESK ASSIGNMENT — national slate, explainer.

VERIFIED: Heirs' property — land inherited without a will, leaving fractured title among many descendants — accounts for more than a third of Southern Black-owned land, estimated at 3.5 million acres worth more than $28 billion. The USDA has identified it as the leading cause of involuntary Black land loss. Between 1910 and 1997, Black Americans lost roughly 90 percent of their farmland. Median wealth among Black families is about a tenth that of white families. The practice traces to Reconstruction and Jim Crow, when Black families were denied meaningful access to lawyers and courts.

VERIFY BEFORE USING: The Bruce's Beach return in Manhattan Beach, California (2022) as a counter-example of land returned. Mississippi has a state initiative aimed at heirs' property; confirm its current status.

WHY IT IS OURS: This is how the wealth gap actually gets made — not dramatic, mostly invisible, and devastating. A short video can explain the mechanism: no will, fractured title, one heir sells, a speculator forces a partition sale, the family loses everything.

REPORTING TASKS: Find a named family whose case illustrates it, ideally in California, Mississippi, or Georgia. Confirm current figures with the USDA or a land trust. Identify what legal remedy exists (Uniform Partition of Heirs Property Act — check which states have adopted it).

SOURCES: landtrustalliance.org, ruralreconcile.org, USDA, nbcnews.com (Bruce's Beach / California Black settlers).`,
  },
  {
    ref_id: "NO-DESK05",
    day: "Thursday",
    headline: "Black land-grant universities were shorted up to $2.1 billion. The bill never came due.",
    category: "Education",
    location: "National",
    story: `DESK ASSIGNMENT — national slate.

VERIFIED: The USDA estimates that the nation's historically Black land-grant universities could have received between $172 million and $2.1 billion in additional funding had their states provided legally required matching funds over roughly three decades. There are 19 historically Black land-grant institutions. Black farmers have mobilized to protect an HBCU scholarship tied to this funding.

CONTEXT TO VERIFY: Pigford v. Glickman (settled 1999), one of the largest civil rights settlements in US history, established that USDA systematically discriminated against Black farmers in loans and disaster aid. Confirm the current status of the farm bill provisions affecting 1890 land-grant institutions.

WHY IT IS OURS: States were legally required to match federal money and simply did not, for decades, with no consequence. That is a quantified, documented transfer away from Black institutions.

REPORTING TASKS: Confirm the USDA figure and its date. Identify which states have the largest shortfalls. Get comment from at least one affected institution. Establish what the scholarship is and what threatens it.

SOURCES: capitalbnews.org (Black farmers mobilize to protect HBCU scholarship), insidehighered.com, USDA.`,
  },
  {
    ref_id: "NO-DESK06",
    day: "Friday",
    headline: "Young Black men say both parties ignore them until October",
    category: "Politics",
    location: "National",
    story: `DESK ASSIGNMENT — national slate.

VERIFIED: A survey of roughly 1,600 young Black men, reported by Capital B News, found that campaigns overlook these voters, that the respondents value democracy, and that they feel unseen by both parties. The reported takeaway is that Black men require year-round engagement rather than last-minute appeals ahead of the 2026 midterms.

REPORTING TASKS: Identify who conducted the poll, the sample, the margin of error, and the fielding dates before citing any number. Pull two or three specific findings rather than the general summary. Establish what campaigns actually spent on outreach to this group, if that data exists.

WHY IT IS OURS: It is a story about our own audience, and it is the rare political story that is not about a candidate.

CAUTION: Do not overstate a single poll. Attribute clearly to the polling organization and note the sample size in the video.

SOURCES: capitalbnews.org (2026 midterms, Black men voters poll).`,
  },
  {
    ref_id: "NO-DESK07",
    day: "Saturday",
    headline: "August is National Black Business Month — and almost nobody knows who started it",
    category: "Business",
    location: "National",
    story: `DESK ASSIGNMENT — national slate, POSITIVE story. Timely: it is August now.

VERIFIED: August is National Black Business Month. It was created in 2004 by engineer Frederick E. Jordan and historian John William Templeton, to drive the policy agenda affecting what was then counted as 2.6 million African-American businesses and to build economic freedom in Black communities. Separately, the US Federal Reserve has found Black entrepreneurs are roughly twice as likely to be turned down for loans as white counterparts.

VERIFY BEFORE USING: The current count of Black-owned businesses in the US and its source and year — the 2.6 million figure needs a date attached. Confirm Jordan's and Templeton's roles and whether either is still living. Confirm the Fed finding and its year. Look for 2026 growth data on Black business formation, which has been notably strong in recent years — if that holds up it is the heart of the story.

WHY IT IS OURS: A designated month most people have never heard of, with a founding story nobody tells, during the month itself. Positive and useful — viewers can act on it today.

TONE: This one is celebratory and practical, not an accountability piece. Lead with the scale of Black business ownership now, name the two men who started the month, and close on what the growth looks like. Do not make the loan-discrimination stat the centre of gravity; it is context, not the story.

REPORTING TASKS: Find two or three named Black-owned businesses with real 2026 milestones worth naming. Get the current national figures from Census or Fed data.

SOURCES: National Black Business Month origin (Jordan/Templeton, 2004); US Federal Reserve small business credit survey; US Census Annual Business Survey.`,
  },
  {
    ref_id: "NO-DESK08",
    day: "Sunday (week 2)",
    headline: "Laila Edwards made Team USA history — and most people never heard about it",
    category: "Sports",
    location: "National",
    story: `DESK ASSIGNMENT — national slate, POSITIVE story.

REPORTED BUT UNVERIFIED: Laila Edwards is described as the first Black woman to represent Team USA in Olympic ice hockey, in connection with the 2026 Winter Games in Milan, Italy. EVERY element of this needs independent confirmation before drafting: her full name and spelling, the exact nature of the "first" (first Black woman on the US Olympic women's hockey team? first to score? first at a World Championship versus the Olympics — these are different claims and are often conflated), the year, and the result. Historic-first claims are frequently overstated in aggregation; verify against USA Hockey, the IIHF, or Team USA directly, and state the first precisely as the record supports.

IF THE CLAIM DOES NOT HOLD UP: Say so in editor notes and recommend against publication rather than softening it. A wrong "first" is the kind of error that gets a Black newsroom dismissed.

WHY IT IS OURS: A young Black woman breaking a barrier in one of the whitest sports in America, in a sport our audience is rarely shown. If it checks out it is a genuinely joyful story, and the under-coverage is itself part of it.

TONE: Celebratory. Center her, not the barrier. Find her own words if any exist on the record.

REPORTING TASKS: Confirm with USA Hockey. Find where she is from and where she plays now. Look for on-record quotes from her. Establish how much mainstream coverage the milestone actually received.

SOURCES: USA Hockey, Team USA, IIHF; secondary mentions in Word In Black and BET good-news roundups.`,
  },
];

async function main() {
  loadEnv();
  const db = supabaseAdmin();

  for (const s of STORIES) {
    const { error } = await db.from("submissions").upsert(
      {
        ref_id: s.ref_id,
        headline: s.headline,
        story: s.story,
        category: s.category,
        location: s.location,
        evidence: ["public_records", "news_reports"],
        covered: "partial",
        submitter_name: "Observed Editorial Desk",
        submitter_email: process.env.EDITORIAL_EMAIL ?? "observernews@gmail.com",
        relation: `Desk assignment — ${s.day} slot`,
        privacy: "named",
        // Desk assignments have no submitter to interview — the agent must
        // draft from research rather than emailing follow-up questions to us.
        consent: false,
        // No receipt for our own assignments.
        confirmation_sent_at: new Date().toISOString(),
      },
      { onConflict: "ref_id", ignoreDuplicates: true },
    );
    console.log(error ? `✗ ${s.ref_id}: ${error.message}` : `✓ ${s.ref_id} — ${s.day}: ${s.headline.slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
