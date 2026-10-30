/* The light site, for phones and tablets (Hunter, Oct 30, on his phone: "terrible performance. lets strip
   it down so way more on mobile where we need to"). Touch-first devices get no WebGL on the pages
   themselves (the flat laurels, the drawn pills, no particles), stills where a desktop plays loops, and
   the homepage's work as a plain scrolling list. The same test as the CSS's
   @media (hover: none), (pointer: coarse); a piece opened in the Playground still runs live. */
export const LITE = matchMedia("(hover: none), (pointer: coarse)").matches;
