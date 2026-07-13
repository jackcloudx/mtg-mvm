#!/usr/bin/env python3
"""
build_card_pool.py

Downloads Scryfall's "Default Cards" bulk data (every printing of every
Magic card) and distills it into data/card-pool.json: a local database of
every card legal for MTG MVM The League (earliest printing on or before
Exodus, June 1998), tagged so future queries never need to hit Scryfall's
website again.

Run this from the repo root:
    python3 build_card_pool.py

Requires: requests (pip install requests --break-system-packages)
"""

import gzip
import json
import sys
from datetime import date
from pathlib import Path

import requests

USER_AGENT = "MTG-MVM-League/1.0 (local card pool builder)"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

# The league allows Alpha through Exodus. Exodus released 1998-06-01.
CUTOFF_DATE = date(1998, 6, 1)

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

POWER_NINE = {
    "Black Lotus",
    "Ancestral Recall",
    "Time Walk",
    "Timetwister",
    "Mox Pearl",
    "Mox Sapphire",
    "Mox Jet",
    "Mox Ruby",
    "Mox Emerald",
}

OUTPUT_PATH = Path("data/card-pool.json")


def get_bulk_data_url() -> str:
    """Query Scryfall's bulk-data index and return the current download URL
    for the Default Cards export (every printing of every card)."""
    print("Querying Scryfall bulk-data index...")
    resp = requests.get("https://api.scryfall.com/bulk-data", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    entries = resp.json()["data"]

    for entry in entries:
        if entry["type"] == "default_cards":
            # Prefer the newer JSONL export; fall back to the legacy JSON
            # array if jsonl_download_uri isn't present yet on this account.
            url = entry.get("jsonl_download_uri") or entry["download_uri"]
            print(f"Found Default Cards export, updated {entry['updated_at']}")
            print(f"Size: {entry['size'] / 1_000_000:.1f} MB compressed")
            return url

    raise RuntimeError("Could not find 'default_cards' in bulk-data index")


def download_bulk_file(url: str, dest: Path) -> None:
    """Stream the bulk file to disk. It's large (several hundred MB
    uncompressed), so we don't hold it all in memory during download."""
    print(f"Downloading {url} ...")
    with requests.get(url, headers=HEADERS, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            downloaded = 0
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                print(f"\r  {downloaded / 1_000_000:.1f} MB", end="", flush=True)
    print("\nDownload complete.")


def iter_cards(path: Path):
    """Yield card objects one at a time from either a gzipped JSONL file
    (one JSON object per line) or a gzipped JSON array, auto-detecting
    which format we got."""
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as f:
        first_char = f.read(1)
        f.seek(0)
        if first_char == "[":
            # Legacy: one big JSON array
            for card in json.load(f):
                yield card
        else:
            # JSONL: one object per line
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)


def build_card_pool(raw_path: Path) -> list[dict]:
    """Group every printing by oracle_id, keep the card only if its
    earliest printing released on or before the cutoff date, and emit one
    clean record per card."""
    print("Processing card data (this may take a minute)...")
    earliest: dict[str, dict] = {}

    count = 0
    for card in iter_cards(raw_path):
        count += 1
        if count % 50000 == 0:
            print(f"\r  scanned {count} printings", end="", flush=True)

        oracle_id = card.get("oracle_id")
        if not oracle_id:
            continue  # skip tokens, art cards, etc. with no oracle_id

        released = card.get("released_at")
        if not released:
            continue

        try:
            released_date = date.fromisoformat(released)
        except ValueError:
            continue

        if card.get("set_name") in EXCLUDED_SETS:
            continue

        existing = earliest.get(oracle_id)
        if existing is None or released_date < existing["_released_date"]:
            entry = dict(card)
            entry["_released_date"] = released_date
            earliest[oracle_id] = entry

    print(f"\r  scanned {count} printings total")
    print(f"Found {len(earliest)} unique cards with a valid earliest printing")

    pool = []
    for oracle_id, card in earliest.items():
        if card["_released_date"] > CUTOFF_DATE:
            continue  # didn't exist yet by Exodus

        name = card.get("name", "")
        # image_uris lives at the top level for single-faced cards; for
        # double-faced cards it's on card_faces[0]. Prefer the same printing.
        image_uris = card.get("image_uris") or {}
        if not image_uris:
            faces = card.get("card_faces") or []
            if faces:
                image_uris = faces[0].get("image_uris") or {}
        pool.append({
            "name": name,
            "mana_cost": card.get("mana_cost", ""),
            "cmc": card.get("cmc"),
            "type_line": card.get("type_line", ""),
            "oracle_text": card.get("oracle_text", ""),
            "power": card.get("power"),
            "toughness": card.get("toughness"),
            "colors": card.get("colors", []),
            "color_identity": card.get("color_identity", []),
            "earliest_set": card.get("set_name", ""),
            "earliest_set_code": card.get("set", ""),
            "earliest_release_date": card["_released_date"].isoformat(),
            "power_nine": name in POWER_NINE,
            "image_url": image_uris.get("normal", ""),
        })

    pool.sort(key=lambda c: (c["earliest_release_date"], c["name"]))
    print(f"Final legal card pool: {len(pool)} cards (Alpha through Exodus)")
    return pool


def main():
    raw_path = Path("scryfall-default-cards.jsonl.gz")

    if not raw_path.exists():
        url = get_bulk_data_url()
        download_bulk_file(url, raw_path)
    else:
        print(f"Using existing download: {raw_path}")

    pool = build_card_pool(raw_path)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(pool, f, indent=2)

    print(f"\nWrote {len(pool)} cards to {OUTPUT_PATH}")
    print("\nCleanup: you can delete scryfall-default-cards.jsonl.gz now if you want to save disk space.")
    print("Re-run this script any time to refresh the pool (e.g., if Scryfall corrects a card's earliest-printing date).")


if __name__ == "__main__":
    main()
