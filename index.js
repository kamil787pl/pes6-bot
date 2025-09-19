const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");

// Konfiguracja
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

// ID kanału wyników
const WYNIKI_CHANNEL_ID = "1418222553524211752";

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

// Wczytanie danych
let elo = fs.existsSync(ELO_FILE) ? JSON.parse(fs.readFileSync(ELO_FILE)) : {};
let matches = fs.existsSync(MATCH_FILE)
  ? JSON.parse(fs.readFileSync(MATCH_FILE))
  : [];

// Funkcja ELO
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

// Cooldowns i pending
const cooldowns = {};
const pendingResults = {}; // key: playerA_playerB, value: {scoreA, scoreB}
const userPendingMap = {}; // key: userId, value: pendingKey

// Logowanie
client.once("clientReady", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// Komendy
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const args = message.content.split(" ");

  // !ping
  if (message.content === "!ping") {
    return message.channel.send("🏓 Pong!");
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

    // przygotowanie pendingResults
    const key = `${message.author.id}_${user.id}`;
    pendingResults[key] = {
      scoreA: null,
      scoreB: null,
      initiatedBy: message.author.id,
    };
    userPendingMap[message.author.id] = key;
    userPendingMap[user.id] = key;

    // Powiadom DM gracza A
    message.author.send(`🎯 Wpisz wynik w formacie bramkiA:bramkiB np. 3:1`);
  }

  // DM: wpisywanie wyniku
  if (!message.guild) {
    const pendingKey = userPendingMap[message.author.id];
    if (!pendingKey) return;
    const match = message.content.match(/^(\d+):(\d+)$/);
    if (!match)
      return message.channel.send("⚠️ Użyj formatu bramkiA:bramkiB np. 2:1");

    const [scoreA, scoreB] = [parseInt(match[1]), parseInt(match[2])];
    pendingResults[pendingKey].scoreA = scoreA;
    pendingResults[pendingKey].scoreB = scoreB;

    const [playerA, playerB] = pendingKey.split("_");
    const playerBUser = await client.users.fetch(playerB);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_${pendingKey}`)
        .setLabel("✅ Zatwierdź wynik")
        .setStyle(ButtonStyle.Success)
    );

    playerBUser.send({
      content: `📢 <@${playerA}> wpisał wynik: ${scoreA}:${scoreB}. Potwierdź wynik.`,
      components: [row],
    });
    return message.channel.send(
      "✅ Wynik zapisany. Czekaj aż przeciwnik potwierdzi."
    );
  }
});

// InteractionCreate dla przycisku
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, key] = interaction.customId.split("_");
  if (action !== "confirm") return;

  if (!pendingResults[key])
    return interaction.reply({
      content: "Błąd: brak wyniku.",
      ephemeral: true,
    });

  const { scoreA, scoreB, initiatedBy } = pendingResults[key];
  const [playerA, playerB] = key.split("_");

  if (interaction.user.id !== playerB) {
    return interaction.reply({
      content: "Nie możesz zatwierdzać wyniku za kogoś innego!",
      ephemeral: true,
    });
  }

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
  delete userPendingMap[playerA];
  delete userPendingMap[playerB];

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
});

// Uruchomienie
require("dotenv").config();
client.login(process.env.DISCORD_TOKEN);
