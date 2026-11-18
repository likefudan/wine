import { AVAS, STATE_NAMES, avaOf } from "./ava";
import { nameKey } from "./model";

/**
 * Where a wine comes from, in the same levels everywhere (the levels LWIN uses):
 *
 *   country   国家     France       USA
 *   region    产区     Bordeaux     California     (the big region; for the USA and Australia, the state)
 *   area      大区     Médoc        Napa Valley    (Sonoma County, Barossa, Côte de Nuits…)
 *   appellation 子产区  Pauillac     Oakville       (the most precise place on the label)
 *
 * Nobody has to type the 大区: picking Oakville fills in Napa Valley (and California, USA). It is
 * stored, so a 大区 we do not know (Italy, Spain…) can still be typed by hand.
 */

/** Big regions and the well-known areas inside them, each with the appellations they hold. */
const AREAS: Record<string, Record<string, string[]>> = {
  Bordeaux: {
    Médoc: [
      "Médoc",
      "Haut-Médoc",
      "Pauillac",
      "Margaux",
      "Saint-Julien",
      "Saint-Estèphe",
      "Listrac-Médoc",
      "Moulis-en-Médoc",
    ],
    Graves: ["Graves", "Pessac-Léognan", "Sauternes", "Barsac", "Cérons"],
    "Rive Droite": [
      "Saint-Émilion",
      "Saint-Émilion Grand Cru",
      "Pomerol",
      "Lalande-de-Pomerol",
      "Fronsac",
      "Canon-Fronsac",
      "Montagne-Saint-Émilion",
      "Lussac-Saint-Émilion",
      "Puisseguin-Saint-Émilion",
      "Saint-Georges-Saint-Émilion",
      "Castillon-Côtes de Bordeaux",
    ],
  },
  Burgundy: {
    Chablis: ["Chablis", "Chablis Grand Cru", "Chablis Premier Cru", "Petit Chablis"],
    "Côte de Nuits": [
      "Marsannay",
      "Fixin",
      "Gevrey-Chambertin",
      "Chambertin",
      "Chambertin-Clos de Bèze",
      "Charmes-Chambertin",
      "Mazis-Chambertin",
      "Latricières-Chambertin",
      "Griotte-Chambertin",
      "Chapelle-Chambertin",
      "Ruchottes-Chambertin",
      "Mazoyères-Chambertin",
      "Morey-Saint-Denis",
      "Clos de la Roche",
      "Clos Saint-Denis",
      "Clos de Tart",
      "Clos des Lambrays",
      "Chambolle-Musigny",
      "Musigny",
      "Bonnes-Mares",
      "Vougeot",
      "Clos de Vougeot",
      "Flagey-Échezeaux",
      "Échezeaux",
      "Grands-Échezeaux",
      "Vosne-Romanée",
      "Romanée-Conti",
      "La Romanée",
      "Romanée-Saint-Vivant",
      "Richebourg",
      "La Tâche",
      "La Grande Rue",
      "Nuits-Saint-Georges",
      "Côte de Nuits-Villages",
    ],
    "Côte de Beaune": [
      "Ladoix",
      "Aloxe-Corton",
      "Corton",
      "Corton-Charlemagne",
      "Pernand-Vergelesses",
      "Savigny-lès-Beaune",
      "Chorey-lès-Beaune",
      "Beaune",
      "Pommard",
      "Volnay",
      "Monthélie",
      "Auxey-Duresses",
      "Saint-Romain",
      "Meursault",
      "Puligny-Montrachet",
      "Montrachet",
      "Chevalier-Montrachet",
      "Bâtard-Montrachet",
      "Bienvenues-Bâtard-Montrachet",
      "Criots-Bâtard-Montrachet",
      "Chassagne-Montrachet",
      "Saint-Aubin",
      "Santenay",
      "Maranges",
      "Côte de Beaune-Villages",
    ],
    "Côte Chalonnaise": ["Bouzeron", "Rully", "Mercurey", "Givry", "Montagny"],
    Mâconnais: ["Mâcon", "Mâcon-Villages", "Pouilly-Fuissé", "Saint-Véran", "Viré-Clessé", "Pouilly-Vinzelles"],
  },
  Rhone: {
    "Northern Rhône": [
      "Côte-Rôtie",
      "Condrieu",
      "Château-Grillet",
      "Saint-Joseph",
      "Hermitage",
      "Crozes-Hermitage",
      "Cornas",
      "Saint-Péray",
    ],
    "Southern Rhône": [
      "Châteauneuf-du-Pape",
      "Gigondas",
      "Vacqueyras",
      "Rasteau",
      "Cairanne",
      "Vinsobres",
      "Beaumes de Venise",
      "Muscat de Beaumes de Venise",
      "Lirac",
      "Tavel",
    ],
  },
  "South Australia": {
    Barossa: ["Barossa", "Barossa Valley", "Eden Valley", "High Eden"],
    "Adelaide Hills": ["Adelaide Hills", "Piccadilly Valley", "Lenswood"],
    "Limestone Coast": ["Limestone Coast", "Coonawarra", "Wrattonbully", "Padthaway", "Mount Benson", "Robe"],
    Fleurieu: ["Fleurieu", "McLaren Vale", "Langhorne Creek", "Currency Creek", "Kangaroo Island"],
  },
};

/** What a few big regions and their areas are also called, mapped to the name above. */
const REGION_ALIASES: Record<string, string> = { Bourgogne: "Burgundy", Rhône: "Rhone" };
const COUNTRY_OF: Record<string, string> = {
  Bordeaux: "France",
  Burgundy: "France",
  Rhone: "France",
  Champagne: "France",
  Alsace: "France",
  Loire: "France",
  Beaujolais: "France",
  Provence: "France",
  Languedoc: "France",
  Tuscany: "Italy",
  Piedmont: "Italy",
  Veneto: "Italy",
  Sicily: "Italy",
  Rioja: "Spain",
  "Castilla y Leon": "Spain",
  Catalunya: "Spain",
  Douro: "Portugal",
  Mosel: "Germany",
  Rheingau: "Germany",
  Pfalz: "Germany",
  "South Australia": "Australia",
  Victoria: "Australia",
  "Western Australia": "Australia",
  Marlborough: "New Zealand",
  Mendoza: "Argentina",
};

interface Known {
  name: string;
  /** Its 大区 ("" when we do not know one). */
  area: string;
  region: string;
  country: string;
}

const known = new Map<string, Known>();
/** 大区 → its big region and country. */
const areas = new Map<string, Known>();
const addArea = (area: string, region: string, country: string) => {
  if (area && !areas.has(nameKey(area))) areas.set(nameKey(area), { name: area, area, region, country });
};
for (const [region, inside] of Object.entries(AREAS)) {
  for (const [area, names] of Object.entries(inside)) {
    addArea(area, region, COUNTRY_OF[region]!);
    for (const n of names) known.set(nameKey(n), { name: n, area, region, country: COUNTRY_OF[region]! });
  }
}
for (const [, area, states] of AVAS) if (!states.includes(",")) addArea(area, STATE_NAMES[states] ?? "", "USA");

/** One way to write the USA, so the same country is not listed twice. */
const USA = new Set(["usa", "us", "united states", "united states of america", "america", "美国", "美國"]);
export const normalCountry = (c: string) => (USA.has(c.trim().toLowerCase()) ? "USA" : c.trim());

/** An appellation we know, with its 大区, big region and country. */
export function appellationOf(name: string | null | undefined): Known | null {
  if (!name?.trim()) return null;
  const ava = avaOf(name);
  if (ava) return { name: ava.name, area: ava.area, region: ava.state, country: "USA" };
  return known.get(nameKey(name)) ?? null;
}

/** A 大区 we know (Napa Valley, Sonoma County, Médoc), with its big region and country. */
export const areaNamed = (name: string | null | undefined) =>
  name?.trim() ? (areas.get(nameKey(name)) ?? null) : null;

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && nameKey(a) === nameKey(b);

const STATE_CODE = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [nameKey(name), code]));

/** Everything we know, as [appellation, 大区, big region]. */
const ALL: readonly (readonly [string, string, string])[] = [
  ...AVAS.map(([n, area, states]) => [n, area, states.includes(",") ? "" : (STATE_NAMES[states] ?? "")] as const),
  ...[...known.values()].map((k) => [k.name, k.area, k.region] as const),
];

/**
 * The 子产区 to suggest: inside the 大区 if it is one we know, else inside the 产区 (California: its
 * AVAs, across-state ones too), else all of them.
 */
export function appellationsIn(region: string | null | undefined, area?: string | null): string[] {
  if (area && areaNamed(area)) {
    const inArea = ALL.filter((a) => sameName(a[1], area)).map((a) => a[0]);
    if (inArea.length) return inArea;
  }
  if (region?.trim()) {
    const state = STATE_CODE.get(nameKey(region));
    const r = REGION_ALIASES[region.trim()] ?? region;
    const inRegion = state
      ? AVAS.filter((a) => a[2].split(",").includes(state)).map((a) => a[0])
      : ALL.filter((a) => sameName(a[2], r)).map((a) => a[0]);
    if (inRegion.length) return inRegion;
  }
  return ALL.map((a) => a[0]);
}

/** The 大区 to suggest for a 产区 (California: Napa Valley, Sonoma County…), or all of them. */
export function areasIn(region: string | null | undefined): string[] {
  const r = region?.trim() ? (REGION_ALIASES[region.trim()] ?? region) : null;
  const all = [...areas.values()];
  const inRegion = r ? all.filter((a) => sameName(a.region, r)) : [];
  return (inRegion.length ? inRegion : all).map((a) => a.name).sort((a, b) => a.localeCompare(b));
}

/** The 产区 to suggest: the big regions above, then the American states. */
export const REGION_NAMES: readonly string[] = [
  ...Object.keys(COUNTRY_OF),
  ...[...new Set(AVAS.flatMap((a) => (a[2].includes(",") ? [] : [STATE_NAMES[a[2]] ?? ""])))].filter(Boolean).sort(),
];

/** The country of a big region we know (Bordeaux: France, California: USA), or null. */
export function countryOfRegion(region: string | null | undefined): string | null {
  if (!region?.trim()) return null;
  const r = REGION_ALIASES[region.trim()] ?? region.trim();
  if (COUNTRY_OF[r]) return COUNTRY_OF[r]!;
  return STATE_CODE.has(nameKey(r)) ? "USA" : null;
}

/** Every appellation the 子产区 field can suggest. */
export const APPELLATION_NAMES: readonly string[] = ALL.map((a) => a[0]);

export interface PlaceFields {
  country: string | null;
  region: string | null;
  area?: string | null;
  appellation: string | null;
}

/**
 * Puts each place at its own level. A 大区 typed as the 产区 (Napa Valley, Médoc) moves to the 大区, and an
 * appellation typed there (Oakville) to the 子产区, when those are empty or agree; the 产区 then becomes the
 * big region above (California, Bordeaux). Empty levels are filled from the appellation when we know it.
 * Nothing typed is dropped.
 */
export function tidyPlace<T extends PlaceFields>(p: T): T & { area: string | null } {
  let country = p.country?.trim() ? normalCountry(p.country) : null;
  let region = p.region?.trim() || null;
  let area = p.area?.trim() || null;
  let appellation = p.appellation?.trim() || null;
  region = region && REGION_ALIASES[region] ? REGION_ALIASES[region]! : region;

  const regionAsArea = areaNamed(region);
  const regionAsApp = appellationOf(region);
  const app = appellationOf(appellation);
  if (regionAsArea?.region && !sameName(regionAsArea.region, region)) {
    // "Napa Valley" or "Sonoma County" typed as the 产区.
    if (!area || sameName(area, region)) {
      if (!appellation || !app || sameName(app.area, region) || sameName(appellation, region)) {
        area = regionAsArea.name;
        region = regionAsArea.region;
      }
    }
  } else if (regionAsApp?.region && !sameName(regionAsApp.region, region)) {
    // "Oakville" typed as the 产区.
    if (!appellation || sameName(appellation, region)) {
      appellation = regionAsApp.name;
      region = regionAsApp.region;
    }
  }
  const a = appellationOf(appellation);
  if (a) {
    if (!area && a.area && (!region || sameName(region, a.region))) area = a.area;
    if (!region && a.region) region = a.region;
    if (!country && a.country) country = a.country;
  }
  const ar = areaNamed(area);
  if (ar) {
    if (!region && ar.region) region = ar.region;
    if (!country && ar.country) country = ar.country;
  }
  if (!country) country = countryOfRegion(region);
  return { ...p, country, region, area, appellation };
}

/** 产区, 大区 and 子产区, each once: [California, Napa Valley, Oakville]. */
export function placePath(p: { region: string | null; area?: string | null; appellation: string | null }): string[] {
  const out: string[] = [];
  for (const x of [p.region, p.area || areaOf(p.appellation), p.appellation]) {
    if (x?.trim() && !out.some((y) => sameName(y, x))) out.push(x.trim());
  }
  return out;
}

/** The 大区 of an appellation (Napa Valley for Oakville), or null. */
export const areaOf = (appellation: string | null | undefined) => appellationOf(appellation)?.area || null;
