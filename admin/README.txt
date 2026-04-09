Drinking in the Sun admin tool v5

What this version does:
- Uses the latest bundled pubs.csv
- Loads and saves pubs.csv and routes.json
- Lets you upload a GPX for the selected pub
- Stores curated_route_id in the CSV row
- Saves the matching route object into routes.json
- Keeps local draft save/restore on the same device/browser

GitHub settings to use with your repo:
- Owner / org: shawn845
- Repository: DrinkingintheSun
- Branch: main
- CSV path in repo: app/public/data/pubs.csv
- Routes JSON path: app/public/data/routes.json

Important:
- Save to GitHub writes both pubs.csv and routes.json.
- Clearing a local route draft does not automatically delete an already-saved route from routes.json.
