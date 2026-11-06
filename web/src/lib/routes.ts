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
export const PROOF_PAGE = PROOF;

/** The main menu: one entry per task, each opening its first page; pages of a group share sub-tabs. */
export interface NavGroup {
  label: string;
  pages: readonly SitePage[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Explore", pages: [ATLAS] },
  { label: "Plan", pages: [SKY, DATES, POWER] },
  { label: "Compare", pages: [COMPARE] },
  { label: "Landing", pages: [ELLIPSE, THREE_D] },
];

/** Pages reached on a phone from More, besides the groups. */
export const PHONE_MORE: readonly SitePage[] = [PROOF, BRIEF];

/** The group a page belongs to, or null for pages outside the groups (Proof, Brief). */
export function groupOf(pathname: string): NavGroup | null {
  return NAV_GROUPS.find(({ pages }) => pages.some(({ href }) => isActivePage(pathname, href))) ?? null;
}

/** True when `pathname` is this page or a path below it. */
export function isActivePage(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
