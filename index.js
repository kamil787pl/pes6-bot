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
  ],
});

// Pliki danych
const ELO_FILE = "elo.json";
const MATCH_FILE = "matches.json";

// Kanał z wynikami
const WYNIKI_CHANNEL_ID = "1418222553524211752";

// Drużyny
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
const pendingChallenges = {}; // key: playerA_playerB, value: {status, type, teamA, teamB}
const pendingResults = {}; // key: playerA_playerB, value: {scoreA, scoreB}

// Logowanie
client.once("clientReady", () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// Komendy
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const args = message.content.split(" ");

  // !ping
  if (message.content === "!ping") return message.channel.send("🏓 Pong!");

  // !wyzwanie
  if (args[0] === "!wyzwanie" && message.mentions.users.size === 1) {
    const now = Date.now();
    const userId = message.author.id;
    if (cooldowns[userId] && now - cooldowns[userId] < 5000) {
      return message.channel.send(
        "⏳ Odczekaj chwilę zanim wyzwiesz kolejnego gracza."
      );
    }
    cooldowns[userId] = now;

    const userB = message.mentions.users.first();
    const type = args[2] ? args[2].toLowerCase() : "mix";

    // Losowanie drużyn
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

    const teamA =
      sameLevelTeams[Math.floor(Math.random() * sameLevelTeams.length)];
    const teamB =
      sameLevelTeams[Math.floor(Math.random() * sameLevelTeams.length)];

    const key = `${message.author.id}_${userB.id}`;
    pendingChallenges[key] = { status: "pending", type, teamA, teamB };

    // Powiadomienie gracza B
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${key}`)
        .setLabel("✅ Akceptuj wyzwanie")
        .setStyle(ButtonStyle.Success)
    );

    try {
      await userB.send({
        content: `🎯 <@${message.author.id}> rzucił Ci wyzwanie!\nDrużyny:\n<@${message.author.id}> — ${teamA.name}\n<@${userB.id}> — ${teamB.name}\nKliknij aby zaakceptować.`,
        components: [row],
      });
      message.channel.send(`✅ Wyzwanie wysłane do <@${userB.id}>`);
    } catch (err) {
      message.channel.send("❌ Nie udało się wysłać DM do gracza.");
    }
  }

  // DM: wpisywanie wyniku
  if (!message.guild) {
    // Szukamy wyzwań gdzie autor wiadomości jest playerA
    const pendingKey = Object.keys(pendingChallenges).find(
      (k) =>
        pendingChallenges[k].status === "accepted" &&
        k.startsWith(message.author.id)
    );
    if (!pendingKey) return;

    const match = message.content.match(/^(\d+):(\d+)$/);
    if (!match)
      return message.channel.send("⚠️ Użyj formatu bramkiA:bramkiB np. 2:1");

    const [scoreA, scoreB] = [parseInt(match[1]), parseInt(match[2])];
    pendingResults[pendingKey] = { scoreA, scoreB };

    const playerBId = pendingKey.split("_")[1];
    const playerBUser = await client.users.fetch(playerBId);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_${pendingKey}`)
        .setLabel("✅ Zatwierdź wynik")
        .setStyle(ButtonStyle.Success)
    );

    try {
      await playerBUser.send({
        content: `📢 <@${message.author.id}> wpisał wynik: ${scoreA}:${scoreB}. Potwierdź wynik.`,
        components: [row],
      });
      return message.channel.send(
        "✅ Wynik wpisany. Czekaj na zatwierdzenie przez przeciwnika."
      );
    } catch {
      return message.channel.send(
        "❌ Nie udało się wysłać wiadomości do gracza B."
      );
    }
  }
});

// InteractionCreate dla przycisków
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, key] = interaction.customId.split("_");

  // Akceptacja wyzwania
  if (action === "accept") {
    if (
      !pendingChallenges[key] ||
      pendingChallenges[key].status !== "pending"
    ) {
      return interaction.reply({
        content: "❌ Wyzwanie już zaakceptowane lub nie istnieje.",
        ephemeral: true,
      });
    }
    if (interaction.user.id !== key.split("_")[1]) {
      return interaction.reply({
        content: "❌ Nie możesz akceptować tego wyzwania.",
        ephemeral: true,
      });
    }

    pendingChallenges[key].status = "accepted";
    interaction.update({
      content: "✅ Wyzwanie zaakceptowane! Gracz A wpisuje teraz wynik w DM.",
      components: [],
    });

    const playerAId = key.split("_")[0];
    const playerA = await client.users.fetch(playerAId);
    const { teamA, teamB } = pendingChallenges[key];
    playerA.send(
      `🎯 Wyzwanie zaakceptowane przez <@${interaction.user.id}>!\nDrużyny:\n<@${playerAId}> — ${teamA.name}\n<@${interaction.user.id}> — ${teamB.name}\nWpisz wynik w formacie bramkiA:bramkiB np. 3:1`
    );
    return;
  }

  // Potwierdzenie wyniku
  if (action === "confirm") {
    if (!pendingResults[key])
      return interaction.reply({
        content: "❌ Brak wyniku do zatwierdzenia.",
        ephemeral: true,
      });

    const { scoreA, scoreB } = pendingResults[key];
    const [playerA, playerB] = key.split("_");

    if (interaction.user.id !== playerB) {
      return interaction.reply({
        content: "❌ Nie możesz zatwierdzać wyniku za kogoś innego!",
        ephemeral: true,
      });
    }

    const diff = updateElo(playerA, playerB, scoreA, scoreB);
    matches.push({
      playerA,
      playerB,
      scoreA,
      scoreB,
      date: new Date().toISOString(),
    });
    fs.writeFileSync(MATCH_FILE, JSON.stringify(matches, null, 2));

    delete pendingChallenges[key];
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

// Uruchomienie bota
require("dotenv").config();
client.login(process.env.DISCORD_TOKEN);
