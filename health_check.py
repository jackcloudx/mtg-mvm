#!/usr/bin/env python3
"""
health_check.py

Run from the repo root:
    python3 health_check.py

Reads data/season9.json, data/history.json, and data/card-pool.json.
No network calls.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent

def load(path):
    with open(ROOT / path) as f:
        return json.load(f)

try:
    S9     = load("data/season9.json")
    HIST   = load("data/history.json")
    POOL   = load("data/card-pool.json")
    CUSTOM = load("data/custom-cards.json")
except FileNotFoundError as e:
    sys.exit("FATAL: could not load data file -- " + str(e))

POOL_NAMES   = {c["name"] for c in POOL}
CUSTOM_NAMES = {c["name"] for c in CUSTOM}
ALL_TIME   = HIST["all_time_teams"]
SEASONS    = HIST["seasons"]
H2H        = HIST.get("head_to_head", {})

# ---------------------------------------------------------------------------
# Excluded sets (must match build_card_pool.py exactly)
# ---------------------------------------------------------------------------

EXCLUDED_SETS = {
    "Pro Tour Collector Set",
    "Multiverse Gift Box",
    "Judge Gift Cards 1998",
    "Dragon Con",
    "Celebration Cards",
    "Exodus Promos",
    "Stronghold Promos",
    "Tempest Promos",
    "Media and Collaboration Promos",
    "HarperPrism Book Promos",
    "Astral Cards",
    "Portal",
    "Vanguard Series",
    "World Championship Decks 1997",
}

# ---------------------------------------------------------------------------
# Franchise aliases -- mirrors FRANCHISE_ALIASES in history.html.
# Maps canonical all_time_teams key -> list of historical game-log names
# (name, season, optional minWeek/maxWeek/playoffs).
# Used to resolve old names in game records and H2H keys.
# ---------------------------------------------------------------------------

FRANCHISE_ALIASES = {
    "Extinction": [
        {"name": "Glop Artists",   "season": 6, "maxWeek": 8},
    ],
    "Trick or Treat Freaks": [
        {"name": "The Anti-Dopes", "season": 6, "maxWeek": 8},
        {"name": "Mist Monsters",  "season": 6, "playoffs": True},
        {"name": "Mist Monsters",  "season": 7, "playoffs": True},
    ],
    "Overdrawn": [
        {"name": "Over Grenade",   "season": 8, "maxWeek": 15},
    ],
    "Hand Grenade": [
        {"name": "Over Grenade",   "season": 8, "minWeek": 16},
        {"name": "Over Grenade",   "season": 8, "playoffs": True},
    ],
    "The Circus": [
        {"name": "Smashed Circus", "season": 8, "maxWeek": 9},
    ],
    "Smashed Potatoes": [
        {"name": "Smashed Circus", "season": 8, "minWeek": 10},
        {"name": "Smashed Circus", "season": 8, "playoffs": True},
    ],
}

# All historical alias names (flat set, any season/week)
ALL_ALIAS_NAMES = {al["name"] for aliases in FRANCHISE_ALIASES.values() for al in aliases}

# ---------------------------------------------------------------------------
# Known-incomplete boss placeholders (WARN not FAIL)
# ---------------------------------------------------------------------------

PLACEHOLDER_BOSSES = {"White Boss", "Artifact Boss"}

# Boss decks are not subject to card-pool rules (house rules)
BOSS_DECKS = {d["name"] for d in S9.get("bossDecks", [])}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"

results = []

def report(status, check, detail=""):
    tag  = "[" + status + "]"
    line = "{:<7} {}".format(tag, check)
    if detail:
        line += "\n        " + detail
    results.append((status, line))
    print(line)

def section(title):
    print("\n" + "-" * 60)
    print("  " + title)
    print("-" * 60)

# ---------------------------------------------------------------------------
# Build the full set of valid game-record names:
#   - all_time_teams canonical keys
#   - mashupLabel values from season_records
#   - franchise alias names
# ---------------------------------------------------------------------------

valid_names = set(ALL_TIME.keys())
for entry in ALL_TIME.values():
    for sr in entry.get("season_records", []):
        label = sr.get("mashupLabel")
        if label:
            valid_names.add(label)
valid_names |= ALL_ALIAS_NAMES

# ---------------------------------------------------------------------------
# Check 1 -- Roster count (60 cards per deck)
# ---------------------------------------------------------------------------

section("1. Roster count (60 cards per deck)")

roster_issues = []
for team in S9.get("teams", []):
    n = len(team.get("roster", []))
    if n != 60:
        roster_issues.append((FAIL, team["name"] + ": " + str(n) + " cards"))

for deck in S9.get("bossDecks", []):
    n    = len(deck.get("roster", []))
    name = deck["name"]
    if n == 0 and name in PLACEHOLDER_BOSSES:
        report(WARN, "Roster count -- " + name, "0 cards (known placeholder)")
    elif n != 60:
        roster_issues.append((FAIL, name + ": " + str(n) + " cards (boss deck)"))

if not roster_issues:
    report(PASS, "Roster count -- all non-placeholder decks have exactly 60 cards")
else:
    for status, msg in roster_issues:
        report(status, "Roster count -- " + msg)

# ---------------------------------------------------------------------------
# Check 2 -- Card legality (every roster card exists in card-pool.json)
# ---------------------------------------------------------------------------

section("2. Card legality (roster cards vs card-pool.json)")

team_illegal  = []
boss_nonpool  = []

for team in S9.get("teams", []):
    seen = set()
    for card in team.get("roster", []):
        if card not in POOL_NAMES and card not in CUSTOM_NAMES and card not in seen:
            team_illegal.append(team["name"] + ': "' + card + '"')
            seen.add(card)

for deck in S9.get("bossDecks", []):
    seen = set()
    for card in deck.get("roster", []):
        if card not in POOL_NAMES and card not in CUSTOM_NAMES and card not in seen:
            boss_nonpool.append(deck["name"] + ': "' + card + '"')
            seen.add(card)

if not team_illegal and not boss_nonpool:
    report(PASS, "Card legality -- all roster cards found in card-pool.json or custom-cards.json")
else:
    for item in team_illegal:
        report(FAIL, "Card legality -- unknown card in player deck: " + item)
    for item in boss_nonpool:
        report(WARN, "Card legality -- non-pool card in boss deck (house rules expected): " + item)

# ---------------------------------------------------------------------------
# Check 3 -- Career totals reconciliation
# ---------------------------------------------------------------------------

section("3. Career totals reconciliation (all_time_teams)")

total_mismatches = []
for team, entry in ALL_TIME.items():
    sumw = sum(sr.get("w", 0) for sr in entry.get("season_records", []))
    suml = sum(sr.get("l", 0) for sr in entry.get("season_records", []))
    topw = entry.get("total_w", 0)
    topl = entry.get("total_l", 0)
    if sumw != topw or suml != topl:
        total_mismatches.append(
            team + ": top-level " + str(topw) + "W-" + str(topl) + "L"
            + " vs season_records sum " + str(sumw) + "W-" + str(suml) + "L"
        )

if not total_mismatches:
    report(PASS, "Career totals -- all top-level W/L match season_records sums")
else:
    for m in total_mismatches:
        report(FAIL, "Career totals -- mismatch: " + m)

# ---------------------------------------------------------------------------
# Check 4 -- Team name integrity (winner/loser resolve to known names)
# ---------------------------------------------------------------------------

section("4. Team name integrity (winner/loser in game records)")

unknown_names = defaultdict(set)

for sk, sv in SEASONS.items():
    ctx = "S" + sk
    for g in sv.get("games", []):
        for field in ("winner", "loser"):
            name = g.get(field)
            if name and name not in valid_names:
                unknown_names[name].add(ctx)
    for ps in sv.get("playoff_series", []):
        for g in ps.get("games", []):
            for field in ("winner", "loser"):
                name = g.get(field)
                if name and name not in valid_names:
                    unknown_names[name].add(ctx)

if not unknown_names:
    report(PASS, "Team name integrity -- all winner/loser names resolve to known franchises, mashup labels, or aliases")
else:
    for name, contexts in sorted(unknown_names.items()):
        report(FAIL, 'Team name integrity -- unresolved: "' + name + '" in ' + ", ".join(sorted(contexts)))

# ---------------------------------------------------------------------------
# Check 5 -- head_to_head key integrity
# ---------------------------------------------------------------------------

section("5. head_to_head key integrity")

h2h_unknown = []
for key in H2H:
    parts = key.split("|")
    if len(parts) != 2:
        h2h_unknown.append('malformed key "' + key + '" (expected exactly one |)')
        continue
    for part in parts:
        if part not in valid_names:
            h2h_unknown.append('"' + part + '" in key "' + key + '" is not a known franchise, mashup label, or alias')

if not h2h_unknown:
    report(PASS, "head_to_head integrity -- all " + str(len(H2H)) + " keys resolve to known names")
else:
    for item in h2h_unknown:
        report(FAIL, "head_to_head -- " + item)

# ---------------------------------------------------------------------------
# Check 6 -- Standings reconciliation (w/l vs actual game counts)
# ---------------------------------------------------------------------------

section("6. Standings reconciliation (standings w/l vs counted games)")

standings_mismatches = []

for sk, sv in SEASONS.items():
    season_num  = int(sk)
    reg_games   = [g for g in sv.get("games", []) if g.get("match_type") == "Regular Season"]

    # Count raw wins/losses by the name appearing in the game record
    raw_wins  = defaultdict(int)
    raw_losses = defaultdict(int)
    for g in reg_games:
        raw_wins[g["winner"]]   += 1
        raw_losses[g["loser"]] += 1

    # Build two resolution maps for this season:
    #   a) game_name -> canonical: alias names + canonical names -> canonical
    #   b) canonical -> {game names}: all names a canonical team played under
    #   c) mashup_label -> {canonical names}: for mashup-label standings entries
    game_to_canon   = {}  # any game name -> canonical franchise name
    canon_to_games  = defaultdict(set)  # canonical -> set of game names
    label_to_canons = defaultdict(set)  # mashupLabel -> set of canonicals

    for canon, entry in ALL_TIME.items():
        canon_to_games[canon].add(canon)
        game_to_canon[canon] = canon
        for sr in entry.get("season_records", []):
            if sr.get("season") == season_num:
                label = sr.get("mashupLabel")
                if label:
                    game_to_canon[label]    = canon
                    canon_to_games[canon].add(label)
                    label_to_canons[label].add(canon)

    # Add franchise aliases for this season
    for canon, aliases in FRANCHISE_ALIASES.items():
        for al in aliases:
            if al["season"] == season_num and not al.get("playoffs"):
                aname = al["name"]
                game_to_canon[aname] = canon
                canon_to_games[canon].add(aname)

    def count_for_standings_entry(entry_name):
        """Return (wins, losses) for a standings entry, resolving aliases and mashups."""
        if entry_name in label_to_canons:
            # Standings entry is a mashup label: sum all constituent franchises
            canons = label_to_canons[entry_name]
            game_names = set()
            for c in canons:
                game_names |= canon_to_games[c]
            w = sum(raw_wins[n]   for n in game_names)
            l = sum(raw_losses[n] for n in game_names)
        else:
            # Standings entry is a canonical name (or historical alias)
            resolved = game_to_canon.get(entry_name, entry_name)
            game_names = canon_to_games.get(resolved, {resolved})
            w = sum(raw_wins[n]   for n in game_names)
            l = sum(raw_losses[n] for n in game_names)
        return w, l

    for entry in sv.get("standings", []):
        team = entry["team"]
        sw, sl = entry.get("w", 0), entry.get("l", 0)
        cw, cl = count_for_standings_entry(team)
        if sw != cw or sl != cl:
            standings_mismatches.append(
                "S" + sk + " " + team + ": standings " + str(sw) + "W-" + str(sl) + "L"
                + " vs counted " + str(cw) + "W-" + str(cl) + "L"
            )

if not standings_mismatches:
    report(PASS, "Standings reconciliation -- all seasons' standings match counted regular-season game results")
else:
    for m in standings_mismatches:
        report(FAIL, "Standings reconciliation -- " + m)

# ---------------------------------------------------------------------------
# Check 7 -- Roster duplicate sanity (>20 copies of one card)
# ---------------------------------------------------------------------------

section("7. Roster duplicate sanity (>20 copies of one card)")

dup_warnings = []
all_decks = list(S9.get("teams", [])) + list(S9.get("bossDecks", []))
for deck in all_decks:
    counts = defaultdict(int)
    for card in deck.get("roster", []):
        counts[card] += 1
    for card, cnt in counts.items():
        if cnt > 20:
            dup_warnings.append(
                deck["name"] + ': "' + card + '" appears ' + str(cnt) + "x -- review manually"
            )

if not dup_warnings:
    report(PASS, "Roster duplicates -- no card appears more than 20 times in any roster")
else:
    for w in dup_warnings:
        report(WARN, "Roster duplicates -- " + w)

# ---------------------------------------------------------------------------
# Check 8 -- Card pool exclusion integrity
# ---------------------------------------------------------------------------

section("8. Card pool exclusion integrity (no excluded sets in card-pool.json)")

pool_violations = []
for card in POOL:
    es = card.get("earliest_set", "")
    if es in EXCLUDED_SETS:
        pool_violations.append('"' + card["name"] + '" has earliest_set="' + es + '"')

if not pool_violations:
    report(PASS, "Card pool exclusions -- no cards from any of the " + str(len(EXCLUDED_SETS)) + " excluded sets")
else:
    for v in pool_violations:
        report(FAIL, "Card pool exclusion -- " + v)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print("\n" + "=" * 60)
fails  = sum(1 for s, _ in results if s == FAIL)
warns  = sum(1 for s, _ in results if s == WARN)
passes = sum(1 for s, _ in results if s == PASS)
print("  SUMMARY: " + str(passes) + " passed, " + str(warns) + " warned, " + str(fails) + " failed")
print("=" * 60 + "\n")

sys.exit(1 if fails else 0)
