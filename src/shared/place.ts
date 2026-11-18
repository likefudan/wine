import { avaOf } from "./ava";
import { nameKey } from "./model";

/**
 * Where a wine comes from, in the same levels everywhere (the levels LWIN uses):
 *
 *   country   国家     France       USA
 *   region    产区     Bordeaux     California     (the big region; for the USA and Australia, the state)
 *   (between)          Médoc        Napa Valley    (not stored: worked out from the appellation)
 *   appellation 子产区  Pauillac     Oakville       (the most precise place on the label)
 *
 * Only country, region and appellation are stored. The level between them is looked up, so picking
 * Oakville shows Napa Valley without anyone typing it.
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
  "South Australia": "Australia",
};

interface Known {
  name: string;
  /** The area between region and appellation ("" when there is none). */
  area: string;
  region: string;
  country: string;
}

const known = new Map<string, Known>();
const areas = new Map<string, Known>();
for (const [region, inside] of Object.entries(AREAS)) {
  for (const [area, names] of Object.entries(inside)) {
    areas.set(nameKey(area), { name: area, area: "", region, country: COUNTRY_OF[region]! });
    for (const n of names)
      known.set(nameKey(n), { name: n, area: n === area ? "" : area, region, country: COUNTRY_OF[region]! });
  }
}

/** Every appellation the 子产区 field can suggest: American AVAs and the ones above. */
export const APPELLATION_NAMES: readonly string[] = [...known.values()].map((k) => k.name);

/** One way to write the USA, so the same country is not listed twice. */
const USA = new Set(["usa", "us", "united states", "united states of america", "america", "美国", "美國"]);
export const normalCountry = (c: string) => (USA.has(c.trim().toLowerCase()) ? "USA" : c.trim());

/** An appellation we know, with the area it sits in, its big region and country. */
export function appellationOf(name: string | null | undefined): Known | null {
  if (!name?.trim()) return null;
  const ava = avaOf(name);
  if (ava) return { name: ava.name, area: ava.parent, region: ava.state, country: "USA" };
  return known.get(nameKey(name)) ?? null;
}

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && nameKey(a) === nameKey(b);

export interface PlaceFields {
  country: string | null;
  region: string | null;
  appellation: string | null;
}

/**
 * Puts each place in its own level: an appellation or area typed as the 产区 (Napa Valley, Oakville,
 * Médoc) moves down to the 子产区 when that is empty, and the 产区 becomes the big region above it
 * (California, Bordeaux). Empty levels are filled from the appellation when we know it. Nothing typed
 * is dropped: a 产区 only moves aside when the 子产区 is inside it, or empty.
 */
export function tidyPlace(p: PlaceFields): PlaceFields {
  let country = p.country?.trim() ? normalCountry(p.country) : null;
  let region = p.region?.trim() || null;
  let appellation = p.appellation?.trim() || null;
  region = region && REGION_ALIASES[region] ? REGION_ALIASES[region]! : region;

  const asRegion = region ? (appellationOf(region) ?? areas.get(nameKey(region)) ?? null) : null;
  if (asRegion?.region && !sameName(asRegion.region, region)) {
    const app = appellationOf(appellation);
    if (!appellation) {
      appellation = asRegion.name;
      region = asRegion.region;
    } else if (sameName(appellation, region) || (app && sameName(app.area, region))) {
      // Oakville under "Napa Valley": Napa Valley is still shown, as the area of Oakville.
      region = asRegion.region;
    }
  }
  const app = appellationOf(appellation);
  if (app) {
    if (!region && app.region) region = app.region;
    if (!country && app.country) country = app.country;
  }
  if (!country && region && COUNTRY_OF[region]) country = COUNTRY_OF[region]!;
  return { country, region, appellation };
}

/** The 产区, the area between (if any) and the 子产区, each once: [California, Napa Valley, Oakville]. */
export function placePath(p: { region: string | null; appellation: string | null }): string[] {
  const app = appellationOf(p.appellation);
  const out: string[] = [];
  for (const x of [p.region, app?.area, p.appellation]) {
    if (x?.trim() && !out.some((y) => sameName(y, x))) out.push(x.trim());
  }
  return out;
}

/** The area between 产区 and 子产区 (Napa Valley for Oakville), or null. */
export const areaOf = (appellation: string | null | undefined) => appellationOf(appellation)?.area || null;
