/* The work, in the order the site shows it.

   cover     media id (public/media/<id>.mp4 + .jpg, cut by scripts/build-media.mjs)
   gallery   more media ids for the case study page
   case      a case study page at /work/<slug>; without one, the card links out
   does      what Kinetic did: Brand, Web design, Development, Product
   industry  one per project; the Work filter folds any industry with a single
             project into "Other"

   Copy rules (from the proposals): no build platform is ever named, no em
   dashes. The case study words are a first draft for Hunter's pass: they
   describe the company and the work, and claim no results. */

export const DISCIPLINES = ["Brand", "Web design", "Development", "Product"];

export const INDUSTRIES = ["AI", "Health", "Defense & space", "Climate & industry", "Consumer", "Venture", "Fintech & web3"];

export const WORK = [
  {
    slug: "rime", name: "Rime", industry: "AI", does: ["Web design", "Development"],
    cover: "rime", gallery: ["rime-voices", "rime-circles", "rime-every"], url: "https://www.rime.ai/", case: true, isNew: true,
    lead: "Voice models made for human conversation.",
    body: [
      "Rime builds text-to-speech models for real-time phone calls, used by contact centres, healthcare, fintech and hospitality teams.",
      "We redesigned rime.ai around the thing that makes them different: voices that sound like people. Overlapping circles stand in for voices joining a conversation, and they react as you move.",
    ],
  },
  {
    slug: "dawn", name: "Dawn", industry: "Health", does: ["Brand", "Web design", "Development"],
    cover: "dawn", gallery: ["dawn-home", "dawn-how", "dawn-clouds"], url: "https://joindawn.com", case: true,
    lead: "AI for mental wellbeing, warm from the first frame.",
    body: [
      "Dawn is evidence-based support for everyday emotional challenges, available any hour.",
      "We built the brand and the site from morning light: warm gradients, open sky and a calm, human voice that makes a hard first step feel easy.",
    ],
  },
  {
    slug: "claude", name: "Claude", client: "Anthropic", industry: "AI", does: ["Web design", "Development"], partner: "with DBCo",
    cover: "claude", gallery: ["claude-home", "claude-code", "claude-scroll"], url: "https://claude.com/solutions/code-modernization", case: true,
    lead: "Pages for claude.com, in partnership with DBCo.",
    body: [
      "Anthropic's Claude is the AI for problem solvers. We designed and built pages for claude.com, including the code modernization story, in partnership with DBCo.",
      "The work sits inside Claude's own system: hand-drawn illustration, quiet type and motion that explains how the product works.",
    ],
  },
  {
    slug: "cambium", name: "Cambium", industry: "Climate & industry", does: ["Web design", "Development"],
    cover: "cambium", gallery: ["cambium-rings", "cambium-map", "cambium-stipple", "cambium-wordmark"], url: "https://www.cambium.com/", case: true, isNew: true,
    lead: "The modern market for wood.",
    body: [
      "Cambium connects sawmills, suppliers and builders to source carbon-smart, domestically grown wood.",
      "Growth rings became the system: drawn contour by contour, mapped across the country and stippled into buildings with a tool we made for the team.",
    ],
  },
  {
    slug: "counsel-health", name: "Counsel Health", industry: "Health", does: ["Web design"],
    cover: "counsel", gallery: ["counsel-wave", "counsel-mobile"], url: "https://www.counselhealth.com/", case: true, isNew: true,
    lead: "Meet the doctor that's with you for life.",
    body: [
      "Counsel pairs medical AI with real doctors, so anyone can ask a question and reach a physician in one conversation.",
      "We designed the site around a single thread of colour that runs from the first question to the doctor's answer.",
    ],
  },
  {
    slug: "wispr-flow", name: "Wispr Flow", industry: "AI", does: ["Brand", "Web design", "Development"],
    cover: "wispr-flow", gallery: ["flow-hero", "flow-notes", "wispr-flow-brand"], url: "https://wisprflow.ai/", case: true,
    lead: "Effortless voice dictation, in every app.",
    body: [
      "Wispr Flow turns speech into clear writing anywhere you type.",
      "We gave the brand motion and built a site that feels as light as talking: soft colour, flowing type and product moments that show the words appearing.",
    ],
  },
  {
    slug: "venus-aerospace", name: "Venus Aerospace", industry: "Defense & space", does: ["Web design", "Development"],
    cover: "venus", gallery: ["venus-site", "venus-slant"], url: "https://venusaero.com/", case: true,
    lead: "Revolutionizing rocket engine propulsion.",
    body: [
      "Venus Aerospace is building hypersonic flight on rotating detonation rocket engines.",
      "The site is cinematic and engineered: full-bleed footage, a single bright accent and type that moves with the confidence of the hardware.",
    ],
  },
  {
    slug: "epirus", name: "Epirus", industry: "Defense & space", does: ["Web design", "Development"],
    cover: "epirus", gallery: ["epirus-site", "epirus-film"], url: "https://www.epirusinc.com/", case: true,
    lead: "Directed energy, made to be understood.",
    body: [
      "Epirus builds high-power microwave systems that defend against drone swarms.",
      "We designed and built the site, then made its launch film: the hardware in its own world, framed with restraint.",
    ],
  },
  {
    slug: "superorganism", name: "Superorganism", industry: "Venture", does: ["Web design", "Development"],
    cover: "superorganism", gallery: ["superorganism-site", "superorganism-how"], url: "https://www.superorganism.com/", case: true,
    lead: "Venture capital for biodiversity.",
    body: [
      "Superorganism backs founders working to protect life on Earth.",
      "The site moves like the natural world it funds: slow footage, organic transitions and a warm, field-guide voice.",
    ],
  },
  {
    slug: "new-era", name: "New Era", industry: "Consumer", does: ["Web design"],
    cover: "new-era", gallery: ["new-era-hats", "new-era-coins"], url: "https://www.neweracap.com/", case: true,
    lead: "Campaign pages for an icon of sport and streetwear.",
    body: [
      "New Era has made the caps of every major league for more than a century.",
      "We designed launch moments for the brand, from 59FIFTY Day to the 9SEVENTY: rotating product, collectable coins and pages that feel like a drop.",
    ],
  },

  { slug: "heygen", name: "HeyGen", industry: "AI", does: ["Web design", "Development"], cover: "heygen", url: "https://www.heygen.com/" },
  { slug: "ethos", name: "Ethos", industry: "Fintech & web3", does: ["Brand", "Web design", "Development"], cover: "ethos", url: "https://www.ethos.network/" },
  { slug: "happy-droid", name: "Happy Droid", industry: "AI", does: ["Web design", "Development"], cover: "happy-droid", url: "https://www.happydroid.ai/" },
  { slug: "metamag", name: "Metamag", industry: "Defense & space", does: ["Brand", "Web design", "Development"], cover: "metamag", url: "https://metamag.us" },
  { slug: "distributional", name: "Distributional", industry: "AI", does: ["Web design", "Development"], cover: "distributional", url: "https://distributional.com/" },
  { slug: "way", name: "Way", industry: "Consumer", does: ["Web design", "Development"], cover: "way", url: "https://way.co" },
  { slug: "range", name: "Range", industry: "Climate & industry", does: ["Web design", "Development"], cover: "range", url: "https://range.energy/" },
  { slug: "ingredient-ai", name: "IngredientAI", industry: "AI", does: ["Development"], cover: "ingredient", url: "https://www.ingredient-ai.com/" },
  { slug: "roam-robotics", name: "Roam Robotics", industry: "Health", does: ["Web design"], cover: "roam", url: "https://www.roamrobotics.com/" },
  { slug: "para", name: "Para AI", industry: "AI", does: ["Brand", "Web design", "Development"], cover: "para", url: "https://www.usepara.com/" },
  { slug: "august-health", name: "August Health", industry: "Health", does: ["Web design", "Development"], cover: "august-health", url: "https://www.augusthealth.com/" },
  { slug: "superlink", name: "Superlink", industry: "Consumer", does: ["Brand", "Web design"], cover: "superlink", url: "https://superlink.me/" },
  { slug: "konvoy", name: "Konvoy", industry: "Venture", does: ["Web design", "Development"], cover: "konvoy", url: "https://www.konvoy.vc/" },
  { slug: "reshape", name: "Reshape Biotech", industry: "Health", does: ["Web design", "Development"], cover: "reshape", url: "https://reshapebiotech.com/" },
  { slug: "tydo", name: "Tydo", industry: "Consumer", does: ["Web design", "Product", "Development"], cover: "tydo", url: "https://www.tydo.com/" },
  { slug: "baseten", name: "Baseten", industry: "AI", does: ["Web design", "Development"], cover: "baseten", url: "https://baseten.co/" },
  { slug: "lemon-squeezy", name: "Lemon Squeezy", industry: "Fintech & web3", does: ["Development"], cover: "lemon-squeezy", url: "https://www.lemonsqueezy.com/" },
  { slug: "redesign-health", name: "Redesign Health", industry: "Health", does: ["Web design"], cover: "redesign-health", url: "https://redesignhealth.com/" },
  { slug: "carter", name: "Carter + Co", industry: "Real estate", does: ["Web design", "Development"], cover: "carter", url: "http://carterco.us" },
  { slug: "cird", name: "CIRD", industry: "Civic", does: ["Web design", "Development"], cover: "cird", url: "https://www.rural-design.org/" },
];

/* The client wall: everyone above plus the names that only appear in the
   proposal decks' client slide. */
export const CLIENTS = [
  "Anthropic", "Google", "Andreessen Horowitz", "Superhuman", "Wispr Flow", "New Era", "Buck Mason", "HeyGen",
  "Rime", "Cambium", "Counsel Health", "Dawn", "Baseten", "Venus Aerospace", "Epirus", "August Health",
  "Redesign Health", "Lemon Squeezy", "Superorganism", "Konvoy", "Tydo", "Way", "Ethos", "Range",
  "Distributional", "Para", "IngredientAI", "Roam Robotics", "Reshape Biotech", "Metamag", "Happy Droid", "Superlink",
];

export const STATS = [
  { value: "13", label: "Years of creative direction" },
  { value: "119", label: "Websites built" },
  { value: "60+", label: "World-class clients" },
];

export const AWARDS = [
  { name: "Webby", line: "1 win, 2 nominations", logo: "/images/awards/webby.svg", width: 4.25 },
  { name: "Awwwards", line: "Site of the Day, 2 Honorable Mentions", logo: "/images/awards/awwwards.svg", width: 6 },
  { name: "SXSW", line: "Interactive Innovation Award", logo: "/images/awards/sxsw.svg", width: 5 },
];
