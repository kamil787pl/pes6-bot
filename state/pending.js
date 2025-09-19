// state/pending.js
const pendingChallenges = {}; // key: playerA_playerB, value: {status: "pending"|"accepted", type}
const pendingResults = {}; // key: playerA_playerB, value: {scoreA, scoreB}

module.exports = {
  pendingChallenges,
  pendingResults,
};
