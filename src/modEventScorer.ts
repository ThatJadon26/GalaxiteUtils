// Chronos Scorer: Helper for scoring Chronos Solos events.
// TODO: Reload key, sort players by elimination index

import { notOnGalaxite, ChronosScores, defaultWeights, sendGXUMessage, getNickname, ChronosPlayer } from "./exports";
import { api, GameName } from "./WhereAmAPI";
const fs = require("filesystem");
const clipboard = require("clipboard");

let eventScorer = new TextModule(
    "eventscorer",
    "GXU: Event Scoring Helper",
    "Keeps track of points in games. (All parameters are stored in weights.json)",
    KeyCode.None
);
let optionUseInPubs = eventScorer.addBoolSetting(
    "pubs",
    "Use in Public Games",
    "Whether to keep track of scores in public games.",
    false
);
let optionAssumeSpectator = eventScorer.addBoolSetting(
    "assumespectator",
    "Assume Spectator",
    "Makes the logic always assume you are a spectator in games played. This allows for certain additional parameters to be utilized.",
    false
);
let optionReloadKey = eventScorer.addKeySetting(
    "reloadkey",
    "Reload Key",
    "Pressing this key will reload the current score weights.\n(This will NOT retroactively alter points in the middle of a game!)",
    KeyCode.U
)
client.getModuleManager().registerModule(eventScorer);

const weightsLocation: string = "chronosWeights.json";

/*
Key points:
- This can only work in Chronos Solos private games, unless "Use in Public Games" is enabled. Check for that on game start.
- Game starts on the title with type title and content "Go!"
- In messages with 1 player name, that player name has always died.
- In messages with 2 player names, the FIRST player was the killer, and the SECOND player was the one killed.
  - The Corruption is the exception.
- Elimination is indicated by either:
  - The character \uE436 appearing in the message
  - The player not appearing in any future messages (assume elimination via disconnect immediately after)
*/

// Initialize the scores file if it doesn't exist
let weights: ChronosScores;
if(!fs.exists(weightsLocation)) {
    resetWeightFile();
}

loadWeightFile();

// Main hooks
let active: boolean = false;
let spectator: boolean = true;

client.on("title", e => {
    if(notOnGalaxite()) return;
    if(api.serverName != "ChronosSolo") return;

    // Check for correct title contents
    if(!(e.type == "title" && e.text == "Go!")) return;

    // Check for valid use
    if(optionUseInPubs.getValue() || api.privacy == "Private") {
        gameStart();
    }
});
api.on("whereami-update", () => {
    if(active) {
        sendGXUMessage("Scores are no longer being tracked!");
        endGame();
    }
    active = false;
});

// Game start
let playersAtGameStart: string[];
// let winner: string = "";
let playerRegex: RegExp;
let playerDatabase: {[index: string]: ChronosPlayer} = {};
/**
 * Used for determing when into a game something happened. Higher means later on.
 */
let messageIndex: number = 0;
let scoresText: string = "";
function gameStart() {
    sendGXUMessage("Scores are being tracked! Make sure your nickname is not the same as anyone else's name!")
    active = true;
    messageIndex = 1;

    // Initialize
    playersAtGameStart = world.getPlayers();
    playerDatabase = {};
    let rgxCreationString = ""; // More is added later on

    playersAtGameStart.forEach((playerName, index) => {
        playerDatabase[playerName] = {
            score: getProp("basePoints"),
            eliminatedIndex: 0,
            lastAppearanceIndex: 0,
            bountyCompletions: 0,
            probableSpectator: false,
            secondsAsTimeLeader: 0
        };
        /*
        playerDatabase looks like:
        {
            "playerName": {EventPlayer},
            "playerName2": {EventPlayer2},
            ...
        }
        */

        rgxCreationString += `${index == 0 ? "" : "|"}${playerName}`; // read as "(OR) [player name]"
    });
    playerRegex = new RegExp(rgxCreationString, "gm");
    scoresText = getCurrentScores();
}

// E0AD is a special arrow symbol used before every death message
const deathMessageCheck = /\uE3AD/;
const timeLeaderTitleExtractor = /(?!Time Leader: \xA74)[a-z][\w -]+/; // This functions, but I have to get [1] and not [0]
const timeFreezeCheck = /\uE3BD Time slows down and begins to freeze! Kills no longer give time!/;
// const gameEndCheck = /(?!\uE3BD )[a-zA-Z][a-zA-Z0-9 _-]+(?= Is The Chronos Champion!)/;
const formatReplacer = /\xA7[.!4]|\[\+\d+\]/g; // Replaces both Minecraft formatting and the Chronos time on kill indicator
const timeLeaderChatExtractor = /(?:\xA74)[.+]/

// Time Leader interpreter
let lastTimeLeader: string = "";
let lastTitleTimestamp: number = 0;
client.on("title", e => {
    // Store time leader title to avoid using 2 title events. This will make sense later.
    if(
        active &&
        e.type == "actionbar"
        && e.text.includes("Time Leader: \xA74")
    ) {
        lastTimeLeader = e.text;
    }
});

// Interpret game messages
client.on("receive-chat", m => {
    if(notOnGalaxite()) return;
    if(!active) return;

    // Store the message without any of the bloat
    const message = fixNickname(m.message).replace(formatReplacer, "").trim();

    // 1. Verify that a message is a system message
    const deathMessage = deathMessageCheck.test(message);
    const timeFreeze = timeFreezeCheck.test(message);
    // const gameEnd = gameEndCheck.test(message);

    if(!(deathMessage || timeFreeze /* || gameEnd */)) return;

    // Since this message is being considered, add to the message index
    messageIndex += 1;

    // 2. Interpret the contents of the message
    // note: look for the bounty kill (\uE448), bounty shutdown (\uE44A), and elimination (\uE436) symbols
    // note: Consider the matches of playerRegex

    // Time freeze case
    if(timeFreeze) {
        const timeFreezeMatch = fixNickname(lastTimeLeader).match(playerRegex); // Get the player from the time leader title
        if(!timeFreezeMatch) return; // If there somehow is no match, stop processing
        const timeLeader = timeFreezeMatch[0];
        sendGXUMessage(`Detected time freeze: Time Leader is ${timeLeader}`);
        playerDatabase[timeLeader].score += getProp("timeLeaderAtTimeFreeze"); // The player who is in the title
    }

    // Death message case
    if(deathMessage) {
        const matches = message.match(playerRegex); // Get the players who appear in the message
        if(!matches) return;

        // Various properties
        const elimination: boolean = message.includes("\uE436"),
            bountyKill: boolean = message.includes("\uE448"),
            bountyShutdown: boolean = message.includes("\uE44A");

        if(matches.length == 1) { // One player - always a death or elimination message
            const deadPlayer = matches[0];
            playerDatabase[deadPlayer].lastAppearanceIndex = messageIndex + 0.5;

            playerDatabase[deadPlayer].score += getProp("death");
            if(elimination) {
                playerDatabase[deadPlayer].eliminatedIndex = messageIndex;
            }
        }
        else if(matches.length == 2) { // 2 players - matches[0] kills matches[1]
            const killer = matches[0];
            const deadPlayer = matches[1];
            playerDatabase[killer].lastAppearanceIndex = messageIndex + 0.5;
            playerDatabase[deadPlayer].lastAppearanceIndex = messageIndex;

            playerDatabase[killer].score += getProp("kill");
            playerDatabase[deadPlayer].score += getProp("death");
            if(bountyKill) {
                // Add bounty points. Bounty completions is set to 0 by default, so this is done first to work with 0-indexing.
                // This may cause an error if the config is changed mid-event. However, people really shouldn't do that.
                playerDatabase[killer].score += getProp("bountyCompletionKill")[playerDatabase[killer].bountyCompletions]; // ?????
                // Increment the player's bounty completions, as long as the current config allows for it.
                if(weights.bountyCompletionKill.length - 1 > playerDatabase[killer].bountyCompletions) { // -1 because zero indexed
                    playerDatabase[killer].bountyCompletions += 1;
                }
                else { // bounty completions >= length
                    playerDatabase[killer].bountyCompletions = weights.bountyCompletionKill.length;
                }

                // Handle the other player
                playerDatabase[deadPlayer].score += weights.bountyCompletionDeath;
            }
            if(bountyShutdown) {
                playerDatabase[killer].score += weights.bountyShutdownKill;
                playerDatabase[deadPlayer].score += weights.bountyShutdownDeath;
            }
            if(elimination) {
                playerDatabase[killer].score += weights.eliminationBonus;
                playerDatabase[deadPlayer].eliminatedIndex = messageIndex;
            }
        }
        else {
            sendGXUMessage("Error in Chronos Scorer: Invalid amount of players in event message");
        }
    }

    // Update score text
    scoresText = getCurrentScores();
});

// Game end
function endGame(): void {
    // Re-assign eliminations
    const databaseKVPsForElims = getEntries(playerDatabase); // 2d array. Given [n][m]: [n] is an index; [m = 0] is the player name, [m = 1] is their information
    let playerDatabaseFinal: {[index: string]: ChronosPlayer} = {}; // I don't know how to delete an entry so I'm rebuilding it from the start

    // Verify elimination timing
    databaseKVPsForElims.forEach(([playerName, playerData]) => {
        if(playerData.eliminatedIndex == 0 && playerData.lastAppearanceIndex == 0) { // Both not set - probably spectator
            playerDatabase[playerName].probableSpectator = true;
        }
        else if(playerData.eliminatedIndex == 0 && playerData.lastAppearanceIndex != 0) { // Only last appearance set - presumably disconnected after last appearance
            playerDatabase[playerName].eliminatedIndex = playerData.lastAppearanceIndex;
            playerDatabaseFinal[playerName] = playerDatabase[playerName];
        }
        else {
            playerDatabaseFinal[playerName] = playerDatabase[playerName];
        }
    });

    // Handle placement
    let databaseKVPsForPlacement = getEntries(playerDatabaseFinal);
    databaseKVPsForPlacement = sortScores(databaseKVPsForPlacement, false);
    // Note: databaseKVPsForPlacement.length is the total amount of valid players
    // -> .length - i is the amount of other players
    databaseKVPsForPlacement.forEach(([playerName, playerData], playerComparedAgainstIndex, kvp) => { // From last place to first place
        kvp.forEach(([playerNameScored, playerDataScored], playerIndexScored) => { // Give bonus points to other players
            assignPlacementScores: {
                if(playerIndexScored <= playerComparedAgainstIndex) { // if comparing to self or a lower-placed player, stop
                    break assignPlacementScores;
                }
                // Survival points
                playerDatabaseFinal[playerNameScored].score += weights.otherEliminatedPlayer;

                // Placement points
                playerDatabaseFinal[playerNameScored].score += weights.placement[
                    // placement[0] is winner, [1] is 2nd, [2] is 3rd...
                    databaseKVPsForPlacement.length - playerComparedAgainstIndex
                ] ?? 0;
            }
        });
    });

    // Send a message with the current scores
    if(eventScorer.isEnabled()) {
        sendGXUMessage("This game's standings:\n" + getCurrentScores());
    }
}

function getCurrentScores(): string {
    let formattedScores: string = "";

    sortScores(getEntries(playerDatabase), true).forEach(([playerName, playerData], i) => {
        formattedScores += `${i + 1}. ${playerName}: ${playerData.score}\n`
    });

    return(formattedScores.trim());
}

// Render

eventScorer.on("text", (p, e) => {
    if(notOnGalaxite()) return "";
    if(!eventScorer.isEnabled()) return "";
    if(!(api.serverName == "ChronosSolo")) return "";
    if(!active) return "";

    return scoresText;
});

// Reload
client.on("key-press", k => {
    if(notOnGalaxite()) return;
    if(!eventScorer.isEnabled) return;
    if(!k.isDown) return;
    if(game.isInUI()) return;

    if(k.keyCode == optionReloadKey.getValue()) {
        if(loadWeightFile()) {
            sendGXUMessage("Score config loaded!");
        }
    }
});

// Utility
const getEntries = Object.entries;

function fixNickname(text: string): string {
    return text.replace(getNickname(), game.getLocalPlayer()!.getName()); // Will always be called while there is a local player
}

function sortScores(arr: ([string, ChronosPlayer])[], sortByPoints: boolean) {
    return arr.sort(([playerName0, playerData0], [playerName1, playerData1]) => {
        // Return n < 0 if first < second, = 0 if equal, > 0 if first > second
        if(sortByPoints) {
            return -(playerData0.score - playerData1.score); // negative so highest score appears first
        }
        else {
            return(playerData0.eliminatedIndex - playerData1.eliminatedIndex);
        }
    });
}

function loadWeightFile(): boolean {
    // Read the weight file
    try {
        weights = JSON.parse(util.bufferToString(fs.read(weightsLocation))) as ChronosScores;
        return true;
    }
    catch (error) {
        weights = defaultWeights;
        resetWeightFile();
        sendGXUMessage("Error in Event Scorer: Attempted to parse invalid weight config (the file has additionally been reset). Don't add more properties!");
        return false;
    }
}

function resetWeightFile() {
    fs.write(weightsLocation, util.stringToBuffer(JSON.stringify(defaultWeights, null, 2)));
}

/**
 * Returns the supplied `weight`'s value for the key `property`, or `0` if this does not exist.
 */
export function getProp<K extends keyof ChronosScores> (property: K): ChronosScores[K] {
    return weights[property] ?? 0;
}