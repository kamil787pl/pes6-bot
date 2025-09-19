const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Pliki danych
const ELO_FILE = "elo.json";
const MATCH_FILE = "matches.json";

// Drużyny i ich rating
const CLUB_TEAMS = [
  { name: "Real Madrid", rating: 5 },
  { name: "Barcelona", rating: 5 },
  { name: "Manchester United", rating: 4 },
  { name: "Bayern Monachium", rating: 5 },
  { name: "Juventus", rating: 4 },
  { name: "Chelsea", rating: 4 },
  { name: "PSG", rating: 5 },
];

const NATIONAL_TEAMS = [
  { name: "Polska", rating: 3 },
  { name: "Niemcy", rating: 5 },
  { name: "Francja", rating: 5 },
  { name: "Brazylia", rating: 5 },
  { name: "Argentyna", rating: 5 },
  { name: "Hiszpania", rating: 5 },
  { name: "Włochy", rating: 4 },
];

// Wczytaj dane lub utwórz puste
let elo = fs.existsSync(ELO_FILE) ? JSON.parse(fs.readFileSync(ELO_FILE)) : {};
let matches = fs.existsSync(MATCH_FILE)
  ? JSON.parse(fs.readFileSync(MATCH_FILE))
  : [];

// Funkcja aktualizacji ELO
function updateElo(playerA, playerB, scoreA, scoreB) {
  const K = 30;
  if (!elo[playerA]) elo[playerA] = 1000;
  if (!elo[playerB]) elo[playerB] = 1000;

  const expectedA = 1 / (1 + Math.pow(10, (elo[playerB] - elo[playerA]) / 400));
  const expectedB = 1 / (1 + Math.pow(10, (elo[playerA] - elo[playerB]) / 400));
  const resultA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
  const resultB = 1 - resultA;

  const oldA = elo[playerA];
  const oldB = elo[playerB];

  elo[playerA] = Math.round(elo[playerA] + K * (resultA - expectedA));
  elo[playerB] = Math.round(elo[playerB] + K * (resultB - expectedB));

  fs.writeFileSync(ELO_FILE, JSON.stringify(elo, null, 2));

  return { a: elo[playerA] - oldA, b: elo[playerB] - oldB };
}

// Cooldowns dla komend
const cooldowns = {};

// Logowanie
client.once("ready", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// Komendy
client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  const args = message.content.split(" ");

  // !ping
  if (message.content === "!ping") {
    message.channel.send("🏓 Pong!");
  }

  // !wyzwanie @gracz [klub/repr]
  if (args[0] === "!wyzwanie" && message.mentions.users.size === 1) {
    const now = Date.now();
    const userId = message.author.id;
    if (cooldowns[userId] && now - cooldowns[userId] < 5000) {
      return message.channel.send(
        "⏳ Odczekaj chwilę zanim wyzwiesz kolejnego gracza."
      );
    }
    cooldowns[userId] = now;

    const user = message.mentions.users.first();
    const type = args[2] ? args[2].toLowerCase() : "mix";
    let pool =
      type === "klub"
        ? CLUB_TEAMS
        : type === "repr"
        ? NATIONAL_TEAMS
        : [...CLUB_TEAMS, ...NATIONAL_TEAMS];

    const availableRatings = [...new Set(pool.map((t) => t.rating))];
    const chosenRating =
      availableRatings[Math.floor(Math.random() * availableRatings.length)];
    const sameLevelTeams = pool.filter((t) => t.rating === chosenRating);

    const team1 =
      sameLevelTeams[Math.floor(Math.random() * sameLevelTeams.length)];
    const team2 =
      sameLevelTeams[Math.floor(Math.random() * sameLevelTeams.length)];

    const embed = new EmbedBuilder()
      .setTitle("🎲 Nowe wyzwanie!")
      .setDescription(
        `**${message.author.username}** (${team1.name}) vs **${user.username}** (${team2.name})\n⭐ Poziom siły: ${chosenRating}`
      )
      .setColor(0x00aeff);

    message.channel.send({ embeds: [embed] });
  }

  // !wynik @gracz 3:1 lub !wynik 3:1 (CPU)
  if (args[0] === "!wynik" && args[2]) {
    const opponent = message.mentions.users.first() || { id: "cpu", username: "CPU" };
    const [scoreA, scoreB] = args[2].split(":").map((n) => parseInt(n));
    if (isNaN(scoreA) || isNaN(scoreB))
      return message.channel.send("⚠️ Użycie: !wynik @gracz 3:1");

    const diff = updateElo(message.author.id, opponent.id, scoreA, scoreB);

    const matchRecord = {
      playerA: message.author.id,
      playerB: opponent.id,
      scoreA,
      scoreB,
      date: new Date().toISOString(),
    };
    matches.push(matchRecord);
    fs.writeFileSync(MATCH_FILE, JSON.stringify(matches, null, 2));

    const embed = new EmbedBuilder()
      .setTitle("✅ Wynik meczu zapisany")
      .setDescription(`**${message.author.username} ${scoreA}:${scoreB} ${opponent.username}**`)
      .addFields(
        { name: message.author.username, value: `ELO: ${elo[message.author.id]} (${diff.a > 0 ? "+" : ""}${diff.a})`, inline: true },
        { name: opponent.username, value: `ELO: ${elo[opponent.id]} (${diff.b > 0 ? "+" : ""}${diff.b})`, inline: true }
      )
      .setColor(0x57f287);

    message.channel.send({ embeds: [embed] });

    const wynikiChannel = message.guild.channels.cache.find(c => c.name === "wyniki");
    if (wynikiChannel) {
      wynikiChannel.send(`📢 ${message.author.username} ${scoreA}:${scoreB} ${opponent.username} — (${elo[message.author.id]} / ${elo[opponent.id]})`);
    }
  }

  // !ranking
  if (args[0] === "!ranking") {
    const ranking = Object.entries(elo)
      .sort((a, b) => b[1] - a[1])
      .map(([id, points], i) => `${i + 1}. <@${id}> — ${points} ELO`)
      .join("\n");
    const embed = new EmbedBuilder()
      .setTitle("🏆 Ranking ELO")
      .setDescription(ranking || "Brak graczy")
      .setColor(0xffd700);
    message.channel.send({ embeds: [embed] });
  }

  // !historia
  if (args[0] === "!historia") {
    const last5 = matches
      .slice(-5)
      .reverse()
      .map(
        (m) =>
          `<@${m.playerA}> ${m.scoreA}:${m.scoreB} <@${m.playerB}> (${new Date(m.date).toLocaleDateString()})`
      )
      .join("\n");
    const embed = new EmbedBuilder()
      .setTitle("📜 Ostatnie mecze")
      .setDescription(last5 || "Brak meczów")
      .setColor(0x7289da);
    message.channel.send({ embeds: [embed] });
  }

  // !profil [@gracz]
  if (args[0] === "!profil") {
    const target = message.mentions.users.first() || message.author;
    const userMatches = matches.filter(
      (m) => m.playerA === target.id || m.playerB === target.id
    );
    const total = userMatches.length;
    let wins = 0,
      draws = 0,
      losses = 0;
    for (const m of userMatches) {
      let my = m.playerA === target.id ? m.scoreA : m.scoreB;
      let opp = m.playerA === target.id ? m.scoreB : m.scoreA;
      if (my > opp) wins++;
      else if (my === opp) draws++;
      else losses++;
    }
    const last5 =
      userMatches
        .slice(-5)
        .map((m) => {
          let my = m.playerA === target.id ? m.scoreA : m.scoreB;
          let opp = m.playerA === target.id ? m.scoreB : m.scoreA;
          return my > opp ? "W" : my === opp ? "R" : "P";
        })
        .join(" ") || "brak";

    const embed = new EmbedBuilder()
      .setTitle(`📋 Profil gracza — ${target.username}`)
      .setColor(0x00aeff)
      .addFields(
        { name: "ELO", value: `${elo[target.id] || 1000}`, inline: true },
        { name: "Rozegrane mecze", value: `${total}`, inline: true },
        {
          name: "Bilans",
          value: `✅ ${wins} 🤝 ${draws} ❌ ${losses}`,
          inline: true,
        },
        { name: "Passa (ostatnie 5)", value: last5 }
      );
    message.channel.send({ embeds: [embed] });
  }
});

// Uruchomienie bota
client.login(process.env
