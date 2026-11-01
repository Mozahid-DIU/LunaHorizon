/** The website's pages, and where each one appears in the navigation. */
export interface SitePage {
  href: string;
  label: string;
}

const page = (href: string, label: string): SitePage => ({ href, label });

const ATLAS = page("/", "Atlas");
const SKY = page("/sky", "Sky");
const COMPARE = page("/compare", "Compare");
const DATES = page("/dates", "Dates");
const POWER = page("/power", "Power");
const ELLIPSE = page("/ellipse", "Ellipse");
const THREE_D = page("/3d", "3D");
const PROOF = page("/proof", "Proof");
export const BRIEF = page("/brief", "Brief");

export const DESKTOP_NAV: readonly SitePage[] = [ATLAS, SKY, COMPARE, DATES, POWER, ELLIPSE, THREE_D, PROOF];
export const ALL_PAGES: readonly SitePage[] = [...DESKTOP_NAV, BRIEF];
export const PHONE_TABS: readonly SitePage[] = [ATLAS, SKY, COMPARE];
export const PHONE_MORE: readonly SitePage[] = [DATES, POWER, ELLIPSE, THREE_D, PROOF, BRIEF];

/** True when `pathname` is this page or a path below it. */
export function isActivePage(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
