import { emptyLayout, type Layout } from "./scenario";

export interface OfficialScenario {
  slug: string;
  name: string;
  layout: Layout;
}

const make = (
  slug: string,
  name: string,
  end: string,
  islands: string[],
  kraken: string[],
  storms: number[],
): OfficialScenario => ({
  slug,
  name,
  layout: { ...emptyLayout(), start: "D1", end, islands, kraken, storms },
});

/** The six layouts printed in the base game's scenario book. */
export const OFFICIAL_SCENARIOS: OfficialScenario[] = [
  make("learning", "Learning scenario", "D11", ["D3", "A8", "G8", "A10", "G10"], ["A4", "G6", "D7"], [5]),
  make(
    "scenario-1",
    "Scenario 1",
    "D17",
    ["D3", "G6", "C10", "G10", "G12", "A16", "G16"],
    ["G4", "A6", "C8", "C12", "A14", "F15"],
    [5, 12],
  ),
  make(
    "scenario-2",
    "Scenario 2",
    "D19",
    ["D3", "G8", "A10", "E10", "B11", "A12", "D15", "A18", "G18"],
    ["G4", "A6", "D7", "E12", "A16", "F17"],
    [5, 14],
  ),
  make(
    "scenario-3",
    "Scenario 3",
    "D21",
    ["D3", "G6", "G8", "A10", "E10", "B11", "A12", "D15", "C18", "A20", "G20"],
    ["G4", "A6", "D7", "E12", "A16", "G16", "F19"],
    [5, 14],
  ),
  make(
    "scenario-4",
    "Scenario 4",
    "D23",
    ["D3", "E6", "C10", "G10", "G12", "A14", "B15", "A16", "D17", "D19", "A22", "G22"],
    ["A4", "C8", "E10", "D13", "G14", "A20", "F21"],
    [9, 18],
  ),
  make(
    "scenario-5",
    "Scenario 5",
    "D25",
    ["D3", "E6", "C10", "G10", "G12", "A14", "B15", "A16", "D17", "D19", "C22"],
    ["A4", "C8", "E10", "D13", "G14", "A20", "G20", "F23"],
    [9, 18],
  ),
];
