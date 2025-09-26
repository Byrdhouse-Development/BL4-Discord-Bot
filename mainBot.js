import { Client, GatewayIntentBits } from 'discord.js';
// 1. Install 'dotenv' package (npm install dotenv) and import it to load environment variables from .env file
import 'dotenv/config'; 

// --- CONFIGURATION START ---

// 2. Load configuration from environment variables (either .env file or hosting environment)
// Use process.env for secure access to environment variables.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || "https://api.example.com/latest-code";

// Convert interval to number, defaulting to 60 seconds if not set
const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_MS, 10) || 60000;

// This state prevents the bot from spamming the channel every minute with the same code.
let lastKnownCodeId = null;

// --- CONFIGURATION END ---


// Initialize the Discord Client
// We only need the GUILDS intent to interact with channels.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Simulates fetching the latest code from an external API.
 * YOU MUST MODIFY THIS FUNCTION to correctly fetch and parse the data
 * from the actual website/API you are targeting.
 *
 * @returns {Promise<string | null>} The unique identifier of the latest code, or null if fetch fails.
 */
async function fetchLatestCode() {
    try {
        console.log(`[Monitor] Fetching data from: ${EXTERNAL_API_URL}`);
        
        // --- EXPONENTIAL BACKOFF IMPLEMENTATION ---
        const MAX_RETRIES = 5;
        let response;
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                // This makes an HTTP GET request to the external URL
                response = await fetch(EXTERNAL_API_URL);
                if (response.ok) {
                    break; // Success! Exit loop
                }
            } catch (networkError) {
                // If network failed, wait and retry
                if (attempt < MAX_RETRIES - 1) {
                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s...
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw networkError; // Re-throw if last retry fails
                }
            }
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error after ${MAX_RETRIES} retries! Status: ${response.status}`);
        }
        
        // Assuming the API returns JSON data like: { id: "NEWCODE-123", title: "New 10% Off", content: "..." }
        const data = await response.json();

        // The key part: Extract a UNIQUE identifier for the latest code.
        const currentCodeId = data.id; // Adjust 'data.id' based on your actual API response structure

        return currentCodeId;

    } catch (error) {
        console.error(`[Monitor Error] Failed to fetch external code:`, error.message);
        return null; // Return null on failure
    }
}

/**
 * Checks if a new code is available and notifies Discord if one is found.
 */
async function checkNewCode() {
    // Input validation for critical environment variables
    if (!DISCORD_BOT_TOKEN || !TARGET_CHANNEL_ID) {
        console.error("CRITICAL ERROR: Discord Token or Channel ID is missing. Check your .env file.");
        return;
    }

    const currentCodeId = await fetchLatestCode();

    if (!currentCodeId) {
        console.log('[Monitor] No valid code ID received. Skipping check.');
        return;
    }

    // 1. Initial Run Check: If this is the first time running, just set the ID and exit.
    if (lastKnownCodeId === null) {
        lastKnownCodeId = currentCodeId;
        console.log(`[Monitor] Initial check complete. Set lastKnownCodeId to: ${lastKnownCodeId}`);
        return;
    }

    // 2. New Code Check: Compare the current ID with the last known ID.
    if (currentCodeId !== lastKnownCodeId) {
        console.log(`[Monitor] 🚨 NEW CODE DETECTED! Previous: ${lastKnownCodeId} -> New: ${currentCodeId}`);
        
        // Update the state
        lastKnownCodeId = currentCodeId;

        // Find the target channel
        const channel = client.channels.cache.get(TARGET_CHANNEL_ID);

        if (channel) {
            try {
                // Send the notification message
                await channel.send(
                    `🎉 **New Code Alert!** A new code has been detected on the external site. ` +
                    `The new identifier is: \`${currentCodeId}\`. Check the source immediately! ` +
                    `\nExternal URL: ${EXTERNAL_API_URL}` // Include URL for convenience
                );
                console.log(`[Discord] Notification sent successfully to channel ${TARGET_CHANNEL_ID}.`);
            } catch (discordError) {
                console.error(`[Discord Error] Could not send message to channel (check bot permissions and channel ID):`, discordError.message);
            }
        } else {
            console.error(`[Discord Error] Channel with ID ${TARGET_CHANNEL_ID} not found in the cache. Check the ID and ensure the bot is in the server.`);
        }
    } else {
        console.log(`[Monitor] Code ID is the same: ${currentCodeId}. No notification needed.`);
    }
}

/**
 * Starts the periodic monitoring process.
 */
function startCodeMonitor() {
    console.log(`[Monitor] Starting code monitor every ${POLLING_INTERVAL_MS / 1000} seconds...`);
    // Run the check immediately, then start the interval
    checkNewCode(); 
    setInterval(checkNewCode, POLLING_INTERVAL_MS);
}

// Event listener for when the bot is fully ready and connected to Discord
client.on('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    startCodeMonitor();
});

// Event listener for any errors
client.on('error', error => {
    console.error('A Discord client error occurred:', error);
});

// Log in to Discord using your bot token
if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN)
        .catch(error => {
            console.error('Failed to log in to Discord. Check your token and internet connection.', error.message);
        });
} else {
    console.error('FATAL: DISCORD_BOT_TOKEN is not defined. Cannot start client.');
}
