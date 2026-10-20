import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

YEAR = 2026
LEAGUE_ID = "74575"
BASE_URL = f"https://api.myfantasyleague.com/{YEAR}/export"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "current_2026.json"


def as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def get_export(export_type, **extra):
    include_league = extra.pop("include_league", True)
    params = {
        "TYPE": export_type,
        "JSON": "1",
    }
    if include_league:
        params["L"] = LEAGUE_ID
    params.update(extra)

    api_key = os.environ.get("MFL_APIKEY")
    if api_key:
        params["APIKEY"] = api_key

    url = BASE_URL + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "GreatDynastiesStatisticalHub/1.0"},
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8-sig"))

    if not isinstance(payload, dict):
        raise ValueError(f"MFL returned unexpected data for {export_type}")

    return payload


def unwrap(payload, key):
    value = payload.get(key, {})
    return value if isinstance(value, dict) else {}


def main():
    print("Р—Р°РіСЂСѓР¶Р°СЋ РґР°РЅРЅС‹Рµ MFL Р·Р° СЃРµР·РѕРЅ 2026...")

    league_data = unwrap(get_export("league"), "league")
    franchises_raw = as_list(league_data.get("franchises", {}).get("franchise"))
    divisions_raw = as_list(league_data.get("divisions", {}).get("division"))

    if not franchises_raw:
        raise ValueError("MFL РЅРµ РІРµСЂРЅСѓР» СЃРїРёСЃРѕРє С„СЂР°РЅС€РёР· РёР· TYPE=league")

    franchises = {}
    for item in franchises_raw:
        franchise_id = str(item.get("id", ""))
        if not franchise_id:
            continue

        if franchise_id.isdigit() and 71 <= int(franchise_id) <= 84:
            continue

        franchises[franchise_id] = {
            "id": franchise_id,
            "name": item.get("name") or item.get("fname") or franchise_id,
            "divisionId": str(item.get("division", "")),
            "logo": item.get("logo") or "",
            "icon": item.get("icon") or "",
            "weekly": {},
            "roster": {
                "ROSTER": [],
                "INJURED_RESERVE": [],
                "TAXI_SQUAD": [],
            },
        }

    if not franchises:
        raise ValueError("РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°Р·РѕР±СЂР°С‚СЊ С„СЂР°РЅС€РёР·С‹ MFL")

    divisions = []
    for item in divisions_raw:
        divisions.append({
            "id": str(item.get("id", "")),
            "name": item.get("name") or str(item.get("id", "")),
        })

    print(f"Р¤СЂР°РЅС€РёР· РЅР°Р№РґРµРЅРѕ: {len(franchises)}")
    print("Р—Р°РіСЂСѓР¶Р°СЋ СЂРµР·СѓР»СЊС‚Р°С‚С‹ СЂРµРіСѓР»СЏСЂРЅРѕРіРѕ СЃРµР·РѕРЅР°...")

    results_payload = get_export("weeklyResults", W="YTD")
    results_root = unwrap(results_payload, "allWeeklyResults")
    weeks = as_list(results_root.get("weeklyResults"))

    for week_data in weeks:
        try:
            week = int(week_data.get("week", 0))
        except (TypeError, ValueError):
            continue

        if week < 1 or week > 14:
            continue

        matchups = as_list(week_data.get("matchup"))
        for matchup in matchups:
            regular = str(matchup.get("regularSeason", ""))
            if regular not in ("1", "True", "true"):
                continue

            matchup_franchises = as_list(matchup.get("franchise"))
            for result in matchup_franchises:
                franchise_id = str(result.get("id", ""))
                franchise = franchises.get(franchise_id)
                if franchise is None:
                    continue

                raw_result = str(result.get("result", "")).upper()
                score_value = result.get("score")
                try:
                    pf = float(score_value) if score_value not in (None, "") else None
                except (TypeError, ValueError):
                    pf = None

                if pf is None:
                    continue

                franchise["weekly"][str(week)] = {
                    "week": week,
                    "result": raw_result if raw_result in ("W", "L", "T") else None,
                    "pf": pf,
                }

    print("Р—Р°РіСЂСѓР¶Р°СЋ СЃРѕСЃС‚Р°РІС‹ Рё РґР°РЅРЅС‹Рµ РёРіСЂРѕРєРѕРІ...")
    rosters_payload = get_export("rosters")
    rosters_root = unwrap(rosters_payload, "rosters")
    roster_franchises = as_list(rosters_root.get("franchise"))

    players_payload = get_export("players")
    players_root = unwrap(players_payload, "players")
    players_raw = as_list(players_root.get("player"))
    players = {
        str(player.get("id")): player
        for player in players_raw
        if player.get("id") is not None
    }

    scores_payload = get_export("playerScores", W="YTD")
    scores_root = unwrap(scores_payload, "playerScores")
    scores_raw = as_list(scores_root.get("playerScore"))

    player_scores = {}
    for item in scores_raw:
        player_id = item.get("id")
        if player_id is None:
            continue
        score_value = item.get("score")
        try:
            score = float(score_value) if score_value not in (None, "") else None
        except (TypeError, ValueError):
            score = None
        player_scores[str(player_id)] = score

    bye_payload = get_export("nflByeWeeks", include_league=False)
    bye_root = unwrap(bye_payload, "nflByeWeeks")
    bye_raw = as_list(bye_root.get("team"))

    bye_weeks = {}
    for item in bye_raw:
        team_id = str(item.get("id", "")).upper()
        bye_value = item.get("bye_week")
        if not team_id or bye_value in (None, ""):
            continue
        try:
            bye_weeks[team_id] = int(bye_value)
        except (TypeError, ValueError):
            continue

    allowed_statuses = {"ROSTER", "INJURED_RESERVE", "TAXI_SQUAD"}

    for roster_entry in roster_franchises:
        franchise_id = str(roster_entry.get("id", ""))
        franchise = franchises.get(franchise_id)
        if franchise is None:
            continue

        for player_entry in as_list(roster_entry.get("player")):
            player_id = str(player_entry.get("id", ""))
            status = str(player_entry.get("status", "ROSTER")).upper()

            if status not in allowed_statuses:
                continue

            player = players.get(player_id, {})
            team = str(player.get("team") or "").upper()

            franchise["roster"][status].append({
                "id": player_id,
                "name": player.get("name") or player_id,
                "position": player.get("position") or "",
                "team": player.get("team") or "",
                "status": status,
                "ytdPoints": player_scores.get(player_id),
                "byeWeek": bye_weeks.get(team),
            })
    output_franchises = []
    for franchise in franchises.values():
        weekly = [
            franchise["weekly"][str(week)]
            for week in range(1, 15)
            if str(week) in franchise["weekly"]
        ]

        wins = sum(row["result"] == "W" for row in weekly)
        losses = sum(row["result"] == "L" for row in weekly)
        ties = sum(row["result"] == "T" for row in weekly)
        pf_values = [row["pf"] for row in weekly if row["pf"] is not None]

        franchise["weekly"] = weekly
        franchise["record"] = {
            "wins": wins,
            "losses": losses,
            "ties": ties,
        }
        franchise["pf"] = round(sum(pf_values), 2)
        franchise["gamesPlayed"] = len(weekly)
        output_franchises.append(franchise)

    output_franchises.sort(key=lambda item: item["name"].casefold())

    if not any(franchise["weekly"] for franchise in output_franchises):
        raise ValueError(
            "РќРµС‚ СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ РЅРµРґРµР»СЊ 1вЂ“14. РЎС‚Р°СЂС‹Р№ JSON СЃРѕС…СЂР°РЅС‘РЅ."
        )

    data = {
        "season": YEAR,
        "leagueId": LEAGUE_ID,
        "seasonType": "regular",
        "weeks": list(range(1, 15)),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "divisions": divisions,
        "franchises": output_franchises,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(OUTPUT)

    print(f"Р“РѕС‚РѕРІРѕ: {OUTPUT}")
    print(f"Р¤СЂР°РЅС€РёР·: {len(output_franchises)}")
    print(
        "Р¤СЂР°РЅС€РёР· СЃ СЂРµР·СѓР»СЊС‚Р°С‚Р°РјРё: "
        f"{sum(bool(item['weekly']) for item in output_franchises)}"
    )
    print(
        "Р РµР·СѓР»СЊС‚Р°С‚РѕРІ РјР°С‚С‡РµР№ Р·Р°РіСЂСѓР¶РµРЅРѕ: "
        f"{sum(len(item['weekly']) for item in output_franchises)}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"РћРЁРР‘РљРђ: {error}", file=sys.stderr)
        sys.exit(1)
