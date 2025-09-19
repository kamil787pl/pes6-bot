const fs = require("fs");
const MATCH_FILE = "matches.json";

let matches = fs.existsSync(MATCH_FILE)
  ? JSON.parse(fs.readFileSync(MATCH_FILE))
  : [];

function saveMatch(playerA, playerB, scoreA, scoreB) {
  const matchRecord = {
    playerA,
    playerB,
    scoreA,
    scoreB,
    date: new Date().toISOString(),
  };
  matches.push(matchRecord);
  fs.writeFileSync(MATCH_FILE, JSON.stringify(matches, null, 2));
  return matchRecord;
}

function getLastMatches(count = 5) {
  return matches.slice(-count).reverse();
}

module.exports = { saveMatch, getLastMatches };
