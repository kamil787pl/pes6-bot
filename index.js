const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL"],
});

// --- KONFIGURACJA ---
const SERVER_ID = "496777968408854530";
const WYNIKI_CHANNEL_ID = "1418222553524211752";

// --- PLIKI DANYCH ---
const ELO_FILE = "elo.json";
const MATCH_FILE = "matches.json";

// --- DRUŻYNY I ICH RATING ---
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

// --- WCZYTAJ DANE ---
let elo = fs.existsSync(ELO_FILE) ? JSON.parse(fs.readFileSync(ELO_FILE)) : {};
let matches = fs.existsSync(MATCH_FILE)
  ? JSON.parse(fs.readFileSync(MATCH_FILE))
  : [];

// --- FUNKCJA ELO ---
function updateElo(playerA, playerB, scoreA, scoreB) {
  const K = 30;
  if (!elo[playerA]) elo[playerA] = 1000;
  if (!elo[playerB]) elo[playerB] = 1000;

  const expectedA = 1 / (1 + Math.pow(10, (elo[playerB] - elo[playerA]) / 400));
  const resultA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
  const resultB = 1 - resultA;

  const oldA = elo[playerA];
  const oldB = elo[playerB];

  elo[playerA] = Math.round(elo[playerA] + K * (resultA - expectedA));
  elo[playerB] = Math.round(elo[playerB] + K * (resultB - expectedB));

  fs.writeFileSync(ELO_FILE, JSON.stringify(elo, null, 2));

  return { a: elo[playerA] - oldA, b: elo[playerB] - oldB };
}

// --- COOLDOWNS ---
const cooldowns = {};

// --- PENDING RESULTS ---
const pendingResults = {}; // { "playerA_playerB": { scoreA, scoreB } }

// --- LOGOWANIE ---
client.once("ready", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// --- KOMENDY ---
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const args = message.content.split(" ");

  // !ping
  if (message.content === "!ping") return message.channel.send("🏓 Pong!");

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

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${message.author.id}_${user.id}`)
        .setLabel("✅ Akceptuj")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_${message.author.id}_${user.id}`)
        .setLabel("❌ Odrzuć")
        .setStyle(ButtonStyle.Danger)
    );

    message.channel.send({ embeds: [embed], components: [row] });
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
});

// --- OBSŁUGA PRZYCISKÓW ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, playerA, playerB, scoreA, scoreB] =
    interaction.customId.split("_");

  if (
    (action === "accept" || action === "decline") &&
    interaction.user.id !== playerB
  ) {
    return interaction.reply({
      content: "Nie możesz akceptować/odrzucać wyzwania za kogoś innego!",
      ephemeral: true,
    });
  }

  if (action === "accept") {
    await interaction.update({
      content: `🎮 Wyzwanie zaakceptowane przez <@${playerB}>!`,
      components: [],
    });
    const userA = await client.users.fetch(playerA);
    userA.send("Wpisz wynik meczu w formacie: Twoje_bramki:Przeciwnika_bramki");

    // Tworzymy pendingResults
    pendingResults[`${playerA}_${playerB}`] = { scoreA: null, scoreB: null };
  }

  if (action === "decline") {
    await interaction.update({
      content: `❌ Wyzwanie odrzucone przez <@${playerB}>!`,
      components: [],
    });
  }

  if (action === "confirm") {
    const key = `${playerA}_${playerB}`;
    const { scoreA, scoreB } = pendingResults[key];
    if (scoreA === null || scoreB === null)
      return interaction.reply({
        content: "Błąd: brak wyniku.",
        ephemeral: true,
      });

    const diff = updateElo(playerA, playerB, scoreA, scoreB);
    const matchRecord = {
      playerA,
      playerB,
      scoreA,
      scoreB,
      date: new Date().toISOString(),
    };
    matches.push(matchRecord);
    fs.writeFileSync(MATCH_FILE, JSON.stringify(matches, null, 2));
    delete pendingResults[key];

    await interaction.update({
      content: `✅ Wynik zatwierdzony: <@${playerA}> ${scoreA}:${scoreB} <@${playerB}>`,
      components: [],
    });

    const wynikiChannel = await client.channels.fetch(WYNIKI_CHANNEL_ID);
    if (wynikiChannel) {
      wynikiChannel.send(
        `📢 <@${playerA}> ${scoreA}:${scoreB} <@${playerB}> — (${elo[playerA]} / ${elo[playerB]})`
      );
    }
  }
});

// --- DM: wpisywanie wyniku ---
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild) return;

  const match = message.content.match(/^(\d+):(\d+)$/);
  if (!match) return;

  const pendingKey = Object.keys(pendingResults).find((k) =>
    k.startsWith(message.author.id)
  );
  if (!pendingKey)
    return message.channel.send("Nie znaleziono gracza do zatwierdzenia.");

  pendingResults[pendingKey] = {
    scoreA: parseInt(match[1]),
    scoreB: parseInt(match[2]),
  };

  const playerBId = pendingKey.split("_")[1];
  const playerB = await client.users.fetch(playerBId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_${pendingKey}_${match[1]}_${match[2]}`)
      .setLabel("✅ Zatwierdź wynik")
      .setStyle(ButtonStyle.Success)
  );

  playerB.send({
    content: `📢 <@${message.author.id}> wpisał wynik: ${match[1]}:${match[2]}. Potwierdź wynik.`,
    components: [row],
  });
});

// --- URUCHOMIENIE ---
require("dotenv").config();
client.login(process.env.DISCORD_TOKEN);
