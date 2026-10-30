/* The light copies scripts/webp-stills.mjs makes beside every still: <name>-640.webp for phones and
   <name>.webp at the still's own width for everything bigger. `width` is the JPEG's own width (card
   posters are 1200; media stills are in media.json). */
export const stillSrcset = (jpg, width) => `${jpg.replace(/\.jpg$/, "-640.webp")} 640w, ${jpg.replace(/\.jpg$/, ".webp")} ${width}w`;
export const stillWebp = (jpg) => jpg.replace(/\.jpg$/, ".webp");
