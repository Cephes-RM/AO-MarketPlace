import { players } from "../packages/db/prisma/players";
import { writeFileSync } from "fs";
import { join } from "path";

function generateMarkdownTable() {
  const header = "| ID | Name | Guild |\n|----|------|---------|";
  const rows = players
    .map((player) => `| ${player.playerId} | ${player.name} | ${player.guildName || "N/A"} |`)
    .join("\n");
  
  const content = `# Seeded Players

${header}
${rows}
`;

  const outputPath = join(__dirname, "..", "docs", "seeded-players.md");
  writeFileSync(outputPath, content);
  console.log(`Generated seeded players documentation at ${outputPath}`);
}

generateMarkdownTable();
