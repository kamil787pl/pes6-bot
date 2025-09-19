const { EmbedBuilder } = require("discord.js");
const { elo, matches } = require("../state/data");

module.exports = {
  name: "profil",
  description: "Pokazuje profil gracza",
  execute: async (message, args) => {
    const target = message.mentions.users.first() || message.author;
    const userMatches = matches.filter(
      (m) => m.playerA === target.id || m.playerB === target.id
    );
    const total = userMatches.length;
    let wins = 0,
      draws = 0,
      losses = 0;

    for (const m of userMatches) {
      const my = m.playerA === target.id ? m.scoreA : m.scoreB;
      const opp = m.playerA === target.id ? m.scoreB : m.scoreA;
      if (my > opp) wins++;
      else if (my === opp) draws++;
      else losses++;
    }

    const last5 =
      userMatches
        .slice(-5)
        .map((m) => {
          const my = m.playerA === target.id ? m.scoreA : m.scoreB;
          const opp = m.playerA === target.id ? m.scoreB : m.scoreA;
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
  },
};
