const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const axios = require('axios');

// --- Render Web Service Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Bot Server Status</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc;">
        <h1 style="color: #22c55e;">🚀 Telegram Bot Server is Live!</h1>
        <p>Render Web Service is healthy and handling requests.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`[SERVER] Express web server listening on port ${PORT}`);
});

// --- Constants & Configs ---
const BOT_TOKEN = process.env.BOT_TOKEN || "8847939563:AAEk9QnrcNFKHcneDL18QP8L0xidngbpKKY";
const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 8890310029;
const IGNORE_SSL = true;
const WIN_LOSE_CHECK_INTERVAL = 2;
const MAX_RESULT_WAIT_TIME = 60;
const MAX_BALANCE_RETRIES = 10;
const BALANCE_RETRY_DELAY = 5;
const BALANCE_API_TIMEOUT = 20000;
const BET_API_TIMEOUT = 30000;
const MAX_BET_RETRIES = 5;
const BET_RETRY_DELAY = 5;
const MAX_CONSECUTIVE_ERRORS = 10;
const MESSAGE_RATE_LIMIT_SECONDS = 10;
const MAX_TELEGRAM_RETRIES = 3;
const TELEGRAM_RETRY_DELAY = 2000;
const DEFAULT_BS_ORDER = "BSBBSBSSSB";
const SNIPER_NOTIFICATIONS = true;
const SNIPER_MAX_HITS = 2;
const SNIPER_MAX_LOSSES = 4;

const DEFAULT_DIGIT_MAPPING = {
  '0': 'B', '1': 'B', '2': 'S', '3': 'S', '4': 'B',
  '5': 'S', '6': 'S', '7': 'B', '8': 'B', '9': 'S',
  'DEFAULT': 'B'
};

const logging = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} -${msg}`),
  warning: (msg) => console.log(`[WARN] ${new Date().toISOString()} -${msg}`),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} -${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} -${msg}`)
};

// Global memory state
const userState = {};
const userTemp = {};
const userSessions = {};
const userPendingBets = {};
const userWaitingForResult = {};
const userSkippedBets = {};
const userShouldSkipNext = {};
const userBalanceWarnings = {};
const userSkipResultWait = {};
const userAllResults = {};
const userStopInitiated = {};
const userSLSkipWaitingForWin = {};
const userPlatforms = {};
const userCredentials = {};
let userSettings = {};
let userGameInfo = {};
let userStats = {};
let userLastResults = {};
let userManualBet = {};
let userManualBets = {}; 

let allowedsixlotteryIds = new Set();
const activeUsers = new Set();
let adminSet = new Set(); 

const PLATFORMS = {
  "6LOTTERY": {
    name: "6LOTTERY",
    baseUrl: "https://6lotteryapi.com/api/webapi/",
    color: "🔴"
  },
  "777BIGWIN": {
    name: "777BIGWIN",
    baseUrl: "https://api.bigwinqaz.com/api/webapi/",
    color: "🟢"
  },
  "CKLOTTERY": {
    name: "CKLOTTERY",
    baseUrl: "https://ckygjf6r.com/api/webapi/",
    color: "🔵"
  }
};

const COLORS = {
  GREEN: { name: 'Green', id: 11, numbers: [1, 3, 7, 9] },
  VIOLET: { name: 'Violet', id: 12, numbers: [0, 5] },
  RED: { name: 'Red', id: 10, numbers: [2, 4, 6, 8] }
};

const EMOJI = {
  WIN: '💚',
  LOSS: '💔',
  RESULT: '📋',
  SKIP: '⏭️',
  BET: '🤹‍♂️️',
  BETWRAGER: '🤹‍♂️',
  BALANCE: '🛍',
  PROFIT: '🧾',
  LOSS_ICON: '♦️',
  START: '▶️',
  STOP: '⏸️',
  SETTINGS: '🛠',
  STATS: '🔖',
  LOGIN: '🖲',
  LOGOUT: '🕹',
  BACK: '🔙',
  MENU: '🔖',
  GAME: '🎮',
  STRATEGY: '🧬',
  RISK: '🩰',
  TARGET: '🎯',
  LAYER: '📥',
  MODE: '🎛',
  INFO: '📑',
  ADMIN: '🏂',
  USER: '🎭',
  ADD: '➕',
  REMOVE: '➖',
  BROADCAST: '🎙',
  CHECK: '🔍',
  ENABLE: '⛓️',
  DISABLE: '⛓',
  WARNING: '❗️',
  ERROR: '🚫',
  LOADING: '🎞',
  SUCCESS: '📟',
  WAIT: '🔜',
  VIRTUAL: '🖥',
  REAL: '💵',
  TREND: '🧲',
  ALTERNATE: '🔁',
  PATTERN: '🎶',
  COLOR: '🖼',
  GREEN: '🟢',
  VIOLET: '🟣',
  RED: '🔴',
  MARTINGALE: '📹',
  ANTI_MARTINGALE: '🎥',
  DALEMBERT: '📽',
  CUSTOM: '📠',
  TIME: '⌛️',
  RESULTSBS: '📊'
};

const STYLE = {
  SEPARATOR: '─'.repeat(15),
  BOLD: (text) => `*${text}*`,
  CODE: (text) => `\`${text}\``,
  HEADER: (text) => `🔥 *${text}* 🔥`,
  SUBHEADER: (text) => `📌 *${text}*`,
  SECTION: (text) => `📁 *${text}*`,
  ITEM: (text) => `├─ ${text}`,
  LAST_ITEM: (text) => `└─ ${text}`,
  INFO: (text) => `ℹ️ ${text}`
};

function loadAdmins() {
  try {
    if (fs.existsSync('admins.json')) {
      const data = JSON.parse(fs.readFileSync('admins.json', 'utf8'));
      adminSet = new Set(data.admin_ids || []);
    } else {
      adminSet = new Set();
    }
    adminSet.add(ADMIN_ID);
    saveAdmins();
    logging.info(`Loaded ${adminSet.size} admins (including owner)`);
  } catch (error) {
    logging.error(`Error loading admins: ${error}`);
    adminSet = new Set([ADMIN_ID]);
  }
}

function saveAdmins() {
  try {
    fs.writeFileSync('admins.json', JSON.stringify({ admin_ids: Array.from(adminSet) }, null, 4));
    logging.info(`Saved ${adminSet.size} admins`);
  } catch (error) {
    logging.error(`Error saving admins: ${error}`);
  }
}

function isAdmin(userId) {
  return userId === ADMIN_ID || adminSet.has(userId);
}

function saveUserSettings() {
  try {
    const settingsData = {
      userSettings: userSettings,
      userGameInfo: userGameInfo,
      userStats: userStats,
      userLastResults: userLastResults
    };
    fs.writeFileSync('user_settings.json', JSON.stringify(settingsData, null, 4));
    logging.info("User settings saved to file");
  } catch (error) {
    logging.error(`Error saving user settings: ${error}`);
  }
}

function loadUserSettings() {
  try {
    if (fs.existsSync('user_settings.json')) {
      const data = JSON.parse(fs.readFileSync('user_settings.json', 'utf8'));
      Object.assign(userSettings, data.userSettings || {});
      Object.assign(userGameInfo, data.userGameInfo || {});
      Object.assign(userStats, data.stats || {});
      if (data.userLastResults && Array.isArray(data.userLastResults)) {
        userLastResults.length = 0;
        data.userLastResults.forEach(item => userLastResults.push(item));
      }
      logging.info("User settings loaded from file");
    } else {
      logging.info("user_settings.json not found. Starting with empty settings");
    }
  } catch (error) {
    logging.error(`Error loading user settings: ${error}`);
  }
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ 
      rejectUnauthorized: false,
      keepAlive: true,
      keepAliveMsecs: 1000
    });
    
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Connection': 'Keep-Alive',
        'Ar-Origin': 'https://6win598.com',
        'Origin': 'https://6win598.com',
        'Referer': 'https://6win598.com/',
      },
      timeout: 12000
    };
    
    const requestOptions = {
      ...defaultOptions,
      ...options,
      agent
    };
    
    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ data: jsonData });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => { reject(error); });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

function loadAllowedUsers() {
  try {
    if (fs.existsSync('users_6lottery.json')) {
      const data = JSON.parse(fs.readFileSync('users_6lottery.json', 'utf8'));
      allowedsixlotteryIds = new Set(data.allowed_ids || []);
      logging.info(`Loaded ${allowedsixlotteryIds.size} users`);
    } else {
      logging.warning("users_6lottery.json not found. Starting new");
      allowedsixlotteryIds = new Set();
    }
  } catch (error) {
    logging.error(`Error loading users_6lottery.json: ${error}`);
    allowedsixlotteryIds = new Set();
  }
}

function saveAllowedUsers() {
  try {
    fs.writeFileSync('users_6lottery.json', JSON.stringify({ 
      allowed_ids: Array.from(allowedsixlotteryIds) 
    }, null, 4));
    logging.info(`Saved ${allowedsixlotteryIds.size} users`);
  } catch (error) {
    logging.error(`Error saving user list: ${error}`);
  }
}

function normalizeText(text) {
  return text.normalize('NFKC').trim();
}

function signMd5(data) {
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== "signature" && key !== "timestamp") {
      filtered[key] = value;
    }
  }
  const sorted = Object.keys(filtered).sort().reduce((acc, key) => {
    acc[key] = filtered[key];
    return acc;
  }, {});
  const jsonStr = JSON.stringify(sorted).replace(/\s+/g, '');
  return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

function computeUnitAmount(amt) {
  if (amt <= 0) return 1;
  const amtStr = String(amt);
  const trailingZeros = amtStr.length - amtStr.replace(/0+$/, '').length;
  if (trailingZeros >= 4) return 10000;
  if (trailingZeros === 3) return 1000;
  if (trailingZeros === 2) return 100;
  if (trailingZeros === 1) return 10;
  return Math.pow(10, amtStr.length - 1);
}

function getSelectMap(gameType, betType) {
  if (betType === 'COLOR') {
    return { "G": 11, "V": 12, "R": 10 };
  } else {
    return { "B": 13, "S": 14 };
  }
}

function numberToBS(num) {
  return num >= 5 ? 'B' : 'S';
}

function numberToColor(num) {
  if (COLORS.GREEN.numbers.includes(num)) return 'G';
  if (COLORS.VIOLET.numbers.includes(num)) return 'V';
  if (COLORS.RED.numbers.includes(num)) return 'R';
  return 'G';
}

function getColorName(colorCode) {
  switch(colorCode) {
    case 'G': return COLORS.GREEN.name;
    case 'V': return COLORS.VIOLET.name;
    case 'R': return COLORS.RED.name;
    default: return 'Unknown';
  }
}

function getValidDalembertBetAmount(unitSize, currentUnits, balance, minBet) {
  let amount = unitSize * currentUnits;
  while (amount > balance && currentUnits > 1) {
    currentUnits--;
    amount = unitSize * currentUnits;
  }
  if (amount > balance) amount = balance;
  if (amount < minBet) amount = minBet;
  return { amount, adjustedUnits: currentUnits };
}

function computeBetDetails(desiredAmount) {
  if (desiredAmount <= 0) return { unitAmount: 0, betCount: 0, actualAmount: 0 };
  const unitAmount = computeUnitAmount(desiredAmount);
  const betCount = Math.max(1, Math.floor(desiredAmount / unitAmount));
  const actualAmount = unitAmount * betCount;
  return { unitAmount, betCount, actualAmount };
}

function calculateBetAmount(settings, currentBalance) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const betSizes = settings.bet_sizes || [100];
  const minBetSize = Math.min(...betSizes);
  
  if (bettingStrategy === "D'Alembert") {
    if (betSizes.length > 1) {
      throw new Error("D'Alembert strategy requires only ONE Bet_Wrager");
    }
    const unitSize = betSizes[0];
    let units = settings.dalembert_units || 1;
    const { amount: validAmount, adjustedUnits } = getValidDalembertBetAmount(unitSize, units, currentBalance, minBetSize);
    
    if (adjustedUnits !== units) {
      settings.dalembert_units = adjustedUnits;
      units = adjustedUnits;
    }
    return validAmount;
  } else if (bettingStrategy === "Custom") {
    const customIndex = settings.custom_index || 0;
    const adjustedIndex = Math.min(customIndex, betSizes.length - 1);
    return betSizes[adjustedIndex];
  } else {
    const martinIndex = settings.martin_index || 0;
    const adjustedIndex = Math.min(martinIndex, betSizes.length - 1);
    return betSizes[adjustedIndex];
  }
}

function updateBettingStrategy(settings, isWin, betAmount) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const betSizes = settings.bet_sizes || [100];
  
  if (bettingStrategy === "Martingale") {
    if (isWin) {
      settings.martin_index = 0;
    } else {
      settings.martin_index = Math.min((settings.martin_index || 0) + 1, betSizes.length - 1);
    }
  } else if (bettingStrategy === "Anti-Martingale") {
    if (isWin) {
      settings.martin_index = Math.min((settings.martin_index || 0) + 1, betSizes.length - 1);
    } else {
      settings.martin_index = 0;
    }
  } else if (bettingStrategy === "D'Alembert") {
    if (isWin) {
      settings.dalembert_units = Math.max(1, (settings.dalembert_units || 1) - 1);
    } else {
      settings.dalembert_units = (settings.dalembert_units || 1) + 1;
    }
  } else if (bettingStrategy === "Custom") {
    let actualIndex = 0;
    for (let i = 0; i < betSizes.length; i++) {
      if (betSizes[i] === betAmount) {
        actualIndex = i;
        break;
      }
    }
    if (isWin) {
      settings.custom_index = actualIndex > 0 ? actualIndex - 1 : 0;
    } else {
      settings.custom_index = actualIndex < betSizes.length - 1 ? actualIndex + 1 : betSizes.length - 1;
    }
  }
}

function generateSignature(data) {
  const f = {};
  const exclude = ["signature", "track", "xosoBettingData"];
  Object.keys(data).sort().forEach(function(k) {
    const v = data[k];
    if (v !== null && v !== '' && !exclude.includes(k)) {
      f[k] = v === 0 ? 0 : v;
    }
  });
  const jstr = JSON.stringify(f);
  return crypto.createHash('md5').update(jstr).digest('hex').toUpperCase();
}

async function loginRequest(phone, password, baseUrl = PLATFORMS["CKLOTTERY"].baseUrl) {
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  const loginData = {
    username: "95" + phone,
    pwd: password,
    phonetype: 1,
    logintype: "mobile",
    packId: "",
    deviceId: "5dcab3e06db88a206975e91ea6ac7c87",
    language: 7,
    random: crypto.randomBytes(16).toString('hex'),
  };
  
  const signature = generateSignature(loginData);
  loginData.signature = signature;
  loginData.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await axios.post(
      baseUrl + "Login",
      loginData,
      {
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "Ar-Origin": "https://6win598.com",
          "Origin": "https://6win598.com",
          "Referer": "https://6win598.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
        },
        timeout: 15000,
      }
    );
    
    const res = response.data;
    if (res.code === 0 && res.data) {
      const tokenHeader = res.data.tokenHeader || "Bearer ";
      const token = res.data.token || "";
      
      const session = {
        post: async (endpoint, data) => {
          const url = baseUrl + endpoint;
          const options = {
            method: 'POST',
            headers: {
              "Authorization": `${tokenHeader}${token}`,
              "Content-Type": "application/json; charset=UTF-8",
              "Ar-Origin": "https://6win598.com",
              "Origin": "https://6win598.com",
              "Referer": "https://6win598.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0"
            },
            body: data
          };
          return makeRequest(url, options);
        }
      };
      return { response: res, session };
    }
    return { response: res, session: null };
  } catch (error) {
    logging.error(`Login error: ${error.message}`);
    return { response: { error: error.message }, session: null };
  }
}

async function getUserInfo(session, userId) {
  const body = {
    "language": 7,
    "random": "4fc9f8f8d6764a5f934d4c6a468644e0"
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post("GetUserInfo", body);
    const res = response.data;
    if (res.code === 0 && res.data) {
      const info = {
        "user_id": res.data.userId,
        "username": res.data.userName,
        "nickname": res.data.nickName,
        "balance": res.data.amount,
        "photo": res.data.userPhoto,
        "login_date": res.data.userLoginDate,
        "withdraw_count": res.data.withdrawCount,
        "is_allow_withdraw": res.data.isAllowWithdraw === 1
      };
      userGameInfo[userId] = info;
      return info;
    }
    return null;
  } catch (error) {
    logging.error(`Get user info error: ${error.message}`);
    return null;
  }
}

async function getBalance(session, userId) {
  const body = {
    "language": 7,
    "random": "71ebd56cff7d4679971c482807c33f6f"
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post("GetBalance", body);
    const res = response.data;
    if (res.code === 0 && res.data) {
      const data = res.data;
      const amount = data.Amount || data.amount || data.balance;
      if (amount !== undefined && amount !== null) {
        const balance = parseFloat(amount);
        if (userGameInfo[userId]) userGameInfo[userId].balance = balance;
        if (!userStats[userId]) userStats[userId] = { start_balance: balance, profit: 0.0 };
        return balance;
      }
    }
    return null;
  } catch (error) {
    logging.error(`Balance check error for user ${userId}: ${error.message}`);
    return null;
  }
}

async function getGameIssueRequest(session, gameType) {
  let typeId, endpoint;
  if (gameType === "TRX") {
    typeId = 13;
    endpoint = "GetTrxGameIssue";
  } else if (gameType === "WINGO_30S") {
    typeId = 30;
    endpoint = "GetGameIssue";
  } else if (gameType === "WINGO_3MIN") {
    typeId = 2;
    endpoint = "GetGameIssue";
  } else if (gameType === "WINGO_5MIN") {
    typeId = 3;
    endpoint = "GetGameIssue";
  } else {
    typeId = 1;
    endpoint = "GetGameIssue";
  }
  
  const body = {
    "typeId": typeId,
    "language": 7,
    "random": "7d76f361dc5d4d8c98098ae3d48ef7af"
  };
  body.signature = signMd5(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  
  const maxRetries = 3;
  const retryDelay = 2000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await session.post(endpoint, body);
      if (response.data && response.data.code === 0) return response.data;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        return { error: error.message };
      }
    }
  }
  return { error: "Failed after retries" };
}

async function placeBetRequest(session, issueNumber, selectType, unitAmount, betCount, gameType, userId) {
  let typeId, endpoint;
  if (gameType === "TRX") {
    typeId = 13;
    endpoint = "GameTrxBetting";
  } else if (gameType === "WINGO_30S") {
    typeId = 30;
    endpoint = "GameBetting";
  } else if (gameType === "WINGO_3MIN") {
    typeId = 2;
    endpoint = "GameBetting";
  } else if (gameType === "WINGO_5MIN") {
    typeId = 3;
    endpoint = "GameBetting";
  } else {
    typeId = 1;
    endpoint = "GameBetting";
  }
  
  const settings = userSettings[userId] || {};
  const betType = settings.bet_type || "BS";
  const actualGameType = betType === "COLOR" ? 0 : 2;
  
  if (!selectType || isNaN(selectType)) {
    return { error: "Invalid bet selection type" };
  }
  
  const betBody = {
    "typeId": typeId,
    "issuenumber": issueNumber,
    "language": 7,
    "gameType": actualGameType,
    "amount": unitAmount,
    "betCount": betCount,
    "selectType": parseInt(selectType),
    "random": "f9ec46840a374a65bb2abad44dfc4dc3"
  };
  betBody.signature = generateSignature(betBody).toUpperCase();
  betBody.timestamp = Math.floor(Date.now() / 1000);
  
  for (let attempt = 0; attempt < MAX_BET_RETRIES; attempt++) {
    try {
      const response = await session.post(endpoint, betBody);
      return response.data;
    } catch (error) {
      if (attempt < MAX_BET_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, BET_RETRY_DELAY * 1000));
        continue;
      }
      return { error: error.message };
    }
  }
  return { error: "Failed after retries" };
}

async function getWingoGameResults(session, gameType = "WINGO") {
  let typeId = 1;
  if (gameType === "WINGO_30S") typeId = 30;
  else if (gameType === "WINGO_3MIN") typeId = 2;
  else if (gameType === "WINGO_5MIN") typeId = 3;
  
  const body = {
    "pageSize": 10,
    "pageNo": 1,
    "typeId": typeId,
    "language": 7,
    "random": "4ad5325e389745a882f4189ed6550e70"
  };
  
  if (gameType === "WINGO_30S") {
    body.signature = "5483D466A138F08B6704354BAA7E7FB3";
    body.timestamp = 1761247150;
  } else {
    body.signature = generateSignature(body).toUpperCase();
    body.timestamp = Math.floor(Date.now() / 1000);
  }
  
  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    return response.data;
  } catch (error) {
    return { error: error.message };
  }
}

async function getOldestHistory(session, gameType = "TRX") {
  let typeId = 1;
  if (gameType === "TRX") typeId = 13;
  else if (gameType === "WINGO_30S") typeId = 30;
  else if (gameType === "WINGO_3MIN") typeId = 2;
  else if (gameType === "WINGO_5MIN") typeId = 3;

  const body = {
    "pageSize": 100,
    "pageNo": 1,
    "typeId": typeId,
    "language": 7,
    "random": "4ad5325e389745a882f4189ed6550e70"
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);

  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    return response.data?.data?.list || null;
  } catch (error) {
    return null;
  }
}

async function getGameResults40(session, gameType = "TRX") {
  let typeId = 1;
  if (gameType === "TRX") typeId = 13;
  else if (gameType === "WINGO_30S") typeId = 30;
  else if (gameType === "WINGO_3MIN") typeId = 2;
  else if (gameType === "WINGO_5MIN") typeId = 3;

  const body = {
    "pageSize": 40,
    "pageNo": 1,
    "typeId": typeId,
    "language": 7,
    "random": crypto.randomBytes(16).toString('hex')
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);

  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    return response.data?.data?.list || null;
  } catch (error) {
    return null;
  }
}

async function getTrxPublicResults() {
  const url = `https://draw.ar-lottery01.com/TrxWinGo/TrxWinGo_1M/GetHistoryIssuePage.json?ts=${Date.now()}`;
  try {
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Referer': 'https://ar-lottery01.com/',
        'Origin': 'https://ar-lottery01.com'
      },
      timeout: 10000
    });
    return response.data?.data?.list || null;
  } catch (error) {
    return null;
  }
}

async function getNextPeriodTimeLeft(session, gameType) {
  try {
    const issueRes = await getGameIssueRequest(session, gameType);
    if (!issueRes || issueRes.code !== 0 || !issueRes.data) return "N/A";
    const data = issueRes.data;
    if (data.remainTime !== undefined && data.remainTime !== null) {
      const secs = parseInt(data.remainTime) || 0;
      if (secs > 0) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    }
    return "N/A";
  } catch (e) {
    return "N/A";
  }
}

function formatManualResultsPage(results, page, timeLeftStr) {
  const start = (page - 1) * 10;
  const end = start + 10;
  const pageResults = results.slice(start, end);

  let msg = `${EMOJI.RESULTSBS} *Game Results (Page ${page}/4)*\n`;
  msg += `⏳ *Next Draw In: ${timeLeftStr}*\n`;
  msg += `${STYLE.SEPARATOR}\n`;

  pageResults.forEach(r => {
    const num = parseInt(r.number) % 10;
    const bs = num >= 5 ? 'B' : 'S';
    const color = numberToColor(num);
    const colorEmoji = color === 'G' ? '🟢' : color === 'R' ? '🔴' : '🟣';
    const period = String(r.issueNumber || '').slice(-10);
    msg += `${colorEmoji} \`${period}\` → *${num}* (${bs})\n`;
  });
  return msg;
}

function makeManualResPageKeyboard(currentPage) {
  const buttons = [];
  const row = [];
  if (currentPage > 1) row.push(Markup.button.callback("◀️ Prev", `manual_res_page_${currentPage - 1}`));
  row.push(Markup.button.callback(`${currentPage} / 4`, `manual_res_page_none`));
  if (currentPage < 4) row.push(Markup.button.callback("Next ▶️", `manual_res_page_${currentPage + 1}`));
  buttons.push(row);
  return Markup.inlineKeyboard(buttons);
}

async function sendMessageWithRetry(ctx, text, replyMarkup = null) {
  for (let attempt = 0; attempt < MAX_TELEGRAM_RETRIES; attempt++) {
    try {
      const options = { parse_mode: 'Markdown' };
      if (replyMarkup) options.reply_markup = replyMarkup.reply_markup || replyMarkup;
      await ctx.reply(text, options);
      return true;
    } catch (error) {
      if (attempt < MAX_TELEGRAM_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, TELEGRAM_RETRY_DELAY));
        continue;
      }
      try {
        const plainText = text.replace(/[*_`]/g, '');
        await ctx.reply(plainText, replyMarkup);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
  return false;
}

function ensureUserStatsInitialized(userId) {
  if (!userStats[userId]) {
    const settings = userSettings[userId] || {};
    userStats[userId] = {
      start_balance: 0,
      profit: 0,
      virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0
    };
  }
}

function safeGetUserStats(userId) {
  ensureUserStatsInitialized(userId);
  return userStats[userId];
}

async function checkProfitAndStopLoss(userId, bot) {
  const settings = userSettings[userId] || {};
  const targetProfit = settings.target_profit;
  const stopLossLimit = settings.stop_loss;

  if (["CYBER_SNIPER", "COLOR_SNIPER"].includes(settings.strategy)) return false;
  if (!targetProfit && !stopLossLimit) return false;
  
  let currentProfit = settings.virtual_mode 
    ? ((userStats[userId]?.virtual_balance || 0) - (userStats[userId]?.initial_balance || 0))
    : (userStats[userId]?.profit || 0);

  const session = userSessions[userId];
  const balance = settings.virtual_mode ? userStats[userId]?.virtual_balance : await getBalance(session, parseInt(userId));

  if (targetProfit && currentProfit >= targetProfit) {
    settings.running = false;
    delete userWaitingForResult[userId];
    const balanceLabel = settings.virtual_mode ? 'Virtual Balance' : 'Balance';
    const msg = `🎯 🔥 TARGET ACHIEVED 🔥\n${STYLE.SEPARATOR}\n` +
                `${STYLE.ITEM(`Target: ${targetProfit} Ks`)}\n` +
                `${STYLE.ITEM(`Profit: +${currentProfit.toFixed(2)} Ks`)}\n` +
                `${STYLE.LAST_ITEM(`${balanceLabel}: ${balance?.toFixed(2) || '0.00'} Ks`)}`;
    
    await bot.telegram.sendMessage(userId, msg, {
      reply_markup: Markup.inlineKeyboard([Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)]).reply_markup
    });
    return true;
  }
  
  if (stopLossLimit && currentProfit <= -stopLossLimit) {
    settings.running = false;
    delete userWaitingForResult[userId];
    const balanceLabel = settings.virtual_mode ? 'Virtual Balance' : 'Balance';
    const msg = `⏸️️ 🔥 STOP LOSS HIT 🔥\n${STYLE.SEPARATOR}\n` +
                `${STYLE.ITEM(`Limit: ${stopLossLimit} Ks`)}\n` +
                `${STYLE.ITEM(`Loss: ${Math.abs(currentProfit).toFixed(2)} Ks`)}\n` +
                `${STYLE.LAST_ITEM(`${balanceLabel}: ${balance?.toFixed(2) || '0.00'} Ks`)}`;
    
    await bot.telegram.sendMessage(userId, msg, {
      reply_markup: Markup.inlineKeyboard([Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)]).reply_markup
    });
    return true;
  }
  return false;
}

// Strategy helper functions
function getCyberSniperPrediction(userId) {
  const state = userSettings[userId].cyber_sniper_state || { active: false, direction: null, sequence: [], step: 0 };
  const lastNumbers = userLastResults[userId] || [];
  const lastNumStr = lastNumbers.length > 0 ? lastNumbers[lastNumbers.length - 1] : null;

  if (!state.active && lastNumStr) {
    if (lastNumStr === "0") {
      state.active = true; state.direction = "B"; state.sequence = ["B"]; state.step = 0;
    } else if (lastNumStr === "9") {
      state.active = true; state.direction = "S"; state.sequence = ["S"]; state.step = 0;
    }
  }
  userSettings[userId].cyber_sniper_state = state;
  return state.active ? { choice: state.direction, shouldSkip: false } : { choice: 'B', shouldSkip: true };
}

function getQuantumCalcPrediction(userId) {
  if (!userAllResults[userId] || userAllResults[userId].length < 5) return 'B';
  const latest5 = userAllResults[userId].slice(-5);
  const sumLatest = latest5.map(r => r === 'B' ? 7 : 2).reduce((a, b) => a + b, 0);
  const diff = Math.abs(sumLatest - 20);
  return (diff % 10 >= 5) ? 'S' : 'B';
}

function getTimeWarpPrediction(userId) {
  const pos = userSettings[userId].time_warp_pos || 8;
  if (!userAllResults[userId] || userAllResults[userId].length < pos) return 'B';
  return userAllResults[userId][userAllResults[userId].length - pos];
}

function getColorSniperPrediction(userId) {
  const state = userSettings[userId].color_sniper_state || { active: false, step: 0 };
  const lastNumbers = userLastResults[userId] || [];
  const lastNumStr = lastNumbers.length > 0 ? lastNumbers[lastNumbers.length - 1] : null;

  if (!state.active && lastNumStr && ["1", "7"].includes(lastNumStr)) {
    state.active = true; state.step = 0;
  }
  userSettings[userId].color_sniper_state = state;
  return state.active ? { choice: 'R', shouldSkip: false } : { choice: 'R', shouldSkip: true };
}

function getOpPatternPrediction(userId) {
  const OP_PATTERN_TRX = "BSBSBBSSBBBSSSBSBS";
  let patternIndex = userSettings[userId].op_pattern_index || 0;
  const betType = OP_PATTERN_TRX[patternIndex % OP_PATTERN_TRX.length];
  userSettings[userId].op_pattern_index = (patternIndex + 1) % OP_PATTERN_TRX.length;
  return { choice: betType, shouldSkip: false };
}

function getCustomDigitPrediction(userId) {
  const mapping = userSettings[userId]?.digit_mapping || DEFAULT_DIGIT_MAPPING;
  const lastResults = userLastResults[userId] || [];
  if (lastResults.length === 0) return { choice: mapping['DEFAULT'] || 'B', shouldSkip: false };
  const lastDigit = lastResults[lastResults.length - 1].toString().slice(-1);
  return { choice: mapping[lastDigit] || 'B', shouldSkip: false };
}

function getShinePrediction(userId) {
  return { choice: Math.random() < 0.5 ? 'B' : 'S', shouldSkip: false };
}

async function getOldestResultPrediction(userId, session, gameType) {
  const history = await getOldestHistory(session, gameType);
  if (!history || history.length < 100) return { choice: 'B', shouldSkip: false };
  const oldestBS = parseInt(history[99].number || "0") >= 5 ? "B" : "S";
  return { choice: oldestBS === "B" ? "S" : "B", shouldSkip: false };
}

function getAlinkarPrediction(userId) {
  const ALINKAR_PATTERN = "BBSSBSBSBBSS";
  let patternIndex = userSettings[userId].alinkar_index || 0;
  const prediction = ALINKAR_PATTERN[patternIndex % ALINKAR_PATTERN.length];
  userSettings[userId].alinkar_index = (patternIndex + 1) % ALINKAR_PATTERN.length;
  return { choice: prediction, shouldSkip: false };
}

function getTrendFollowPrediction(userId) {
  const settings = userSettings[userId] || {};
  if (settings.bet_type === "COLOR") {
    return { choice: settings.color_trend_state?.last_result || 'G', shouldSkip: false };
  }
  return { choice: settings.trend_state?.last_result || 'B', shouldSkip: false };
}

function getAlternatePrediction(userId) {
  const settings = userSettings[userId] || {};
  const last = settings.alternate_state?.last_result;
  return { choice: last === 'B' ? 'S' : 'B', shouldSkip: false };
}

function getBsOrderPrediction(userId) {
  const settings = userSettings[userId] || {};
  const pattern = settings.pattern || DEFAULT_BS_ORDER;
  let idx = settings.pattern_index || 0;
  const choice = pattern[idx % pattern.length];
  settings.pattern_index = (idx + 1) % pattern.length;
  return { choice, shouldSkip: false };
}

async function getPotatoGraPrediction(userId, session, gameType) {
  const history = (gameType === "TRX") ? await getTrxPublicResults() : await getGameResults40(session, gameType);
  if (!history || history.length < 5) return { choice: 'B', shouldSkip: true };
  const pattern = history.slice(0, 5).map(r => parseInt(r.number || "0") % 10 >= 5 ? "B" : "S").join('');
  if (pattern === 'BBBBS') return { choice: 'S', shouldSkip: false };
  if (pattern === 'SSSSB') return { choice: 'B', shouldSkip: false };
  return { choice: 'B', shouldSkip: true };
}

// Background result monitoring worker
async function winLoseChecker(bot) {
  logging.info("Win/lose background checker active");
  while (true) {
    try {
      for (const [userId, session] of Object.entries(userSessions)) {
        if (!session) continue;
        const settings = userSettings[userId] || {};
        ensureUserStatsInitialized(userId);
        const gameType = settings.game_type || "TRX";
        const betType = settings.bet_type || "BS";

        let data = [];
        if (gameType.startsWith("WINGO")) {
          const res = await getWingoGameResults(session, gameType);
          data = res?.data?.list || [];
        } else {
          const issueRes = await getGameIssueRequest(session, gameType);
          data = issueRes?.data?.settled ? [issueRes.data.settled] : [];
        }

        if (userPendingBets[userId]) {
          for (const [period, betInfo] of Object.entries(userPendingBets[userId])) {
            const settled = data.find(item => item.issueNumber === period);
            if (settled && settled.number) {
              const [betChoice, amount, isVirtual] = betInfo;
              const number = parseInt(settled.number) % 10;
              const bigSmall = number >= 5 ? "B" : "S";
              const color = numberToColor(number);
              const isWin = (betType === "COLOR") ? (betChoice === color) : (betChoice === bigSmall);

              if (!userLastResults[userId]) userLastResults[userId] = [];
              userLastResults[userId].push(number.toString());
              if (userLastResults[userId].length > 10) userLastResults[userId].shift();

              if (!userAllResults[userId]) userAllResults[userId] = [];
              userAllResults[userId].push(bigSmall);
              if (userAllResults[userId].length > 20) userAllResults[userId].shift();

              updateBettingStrategy(settings, isWin, amount);

              if (isVirtual) {
                userStats[userId].virtual_balance += isWin ? (amount * 0.96) : -amount;
              } else {
                userStats[userId].profit += isWin ? (amount * 0.96) : -amount;
              }

              const winAmount = amount * 0.96;
              const msg = isWin 
                ? `${EMOJI.WIN} ${STYLE.BOLD('VICTORY')} +${winAmount.toFixed(2)} Ks\n${STYLE.SEPARATOR}\nIssue:${period}\nResult: ${number} (${bigSmall})`
                : `${EMOJI.LOSS} ${STYLE.BOLD('LOSS')} -${amount} Ks\n${STYLE.SEPARATOR}\nIssue:${period}\nResult: ${number} (${bigSmall})`;

              try {
                await bot.telegram.sendMessage(userId, msg, { parse_mode: 'Markdown' });
              } catch (e) {}

              delete userPendingBets[userId][period];
              if (Object.keys(userPendingBets[userId]).length === 0) delete userPendingBets[userId];
              userWaitingForResult[userId] = false;

              await checkProfitAndStopLoss(userId, bot);
            }
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, WIN_LOSE_CHECK_INTERVAL * 1000));
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Betting Worker
async function bettingWorker(userId, ctx, bot) {
  const settings = userSettings[userId] || {};
  let session = userSessions[userId];
  ensureUserStatsInitialized(userId);

  if (!settings || !session) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please login first`, makeMainKeyboard(false, isAdmin(userId)));
    settings.running = false;
    return;
  }
  
  settings.running = true;
  await sendMessageWithRetry(ctx, `${EMOJI.START} *Bot betting sequence initiated!*`);

  while (settings.running) {
    if (userWaitingForResult[userId] || userSkipResultWait[userId]) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    const currentBalance = settings.virtual_mode 
      ? userStats[userId].virtual_balance 
      : await getBalance(session, parseInt(userId));

    const betSizes = settings.bet_sizes || [100];
    if (currentBalance < Math.min(...betSizes)) {
      await sendMessageWithRetry(ctx, `${EMOJI.WARNING} Low balance. Auto-stopping.`);
      settings.running = false;
      break;
    }

    const issueRes = await getGameIssueRequest(session, settings.game_type || "TRX");
    const currentIssue = issueRes?.data?.issueNumber || issueRes?.data?.predraw?.issueNumber;

    if (!currentIssue || currentIssue === settings.last_issue) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    let prediction = { choice: 'B', shouldSkip: false };
    if (settings.strategy === "TREND_FOLLOW") prediction = getTrendFollowPrediction(userId);
    else if (settings.strategy === "ALTERNATE") prediction = getAlternatePrediction(userId);
    else if (settings.strategy === "BS_ORDER") prediction = getBsOrderPrediction(userId);
    else if (settings.strategy === "CYBER_SNIPER") prediction = getCyberSniperPrediction(userId);
    else if (settings.strategy === "POTATO_GRA") prediction = await getPotatoGraPrediction(userId, session, settings.game_type);

    if (prediction.shouldSkip) {
      await sendMessageWithRetry(ctx, `${EMOJI.SKIP} Skipping Issue: \`${currentIssue}\``);
      settings.last_issue = currentIssue;
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }

    const betAmount = calculateBetAmount(settings, currentBalance);
    const { unitAmount, betCount, actualAmount } = computeBetDetails(betAmount);
    const selectType = getSelectMap(settings.game_type, settings.bet_type || "BS")[prediction.choice];

    if (!settings.virtual_mode) {
      await placeBetRequest(session, currentIssue, selectType, unitAmount, betCount, settings.game_type || "TRX", parseInt(userId));
    }

    if (!userPendingBets[userId]) userPendingBets[userId] = {};
    userPendingBets[userId][currentIssue] = [prediction.choice, actualAmount, settings.virtual_mode];
    userWaitingForResult[userId] = true;
    settings.last_issue = currentIssue;

    await sendMessageWithRetry(ctx, `🎯 Placed Bet: *${prediction.choice}* (${actualAmount} Ks) on Issue \`${currentIssue}\``);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Telegram Keyboards
function makePlatformKeyboard() {
  return Markup.keyboard([
    [`${PLATFORMS["6LOTTERY"].color} ${PLATFORMS["6LOTTERY"].name}`,
    `${PLATFORMS["777BIGWIN"].color} ${PLATFORMS["777BIGWIN"].name}`,
    `${PLATFORMS["CKLOTTERY"].color} ${PLATFORMS["CKLOTTERY"].name}`]
  ]).resize().oneTime(false);
}

function makeMainKeyboard(loggedIn = false, isAdminUser = false) {
  if (!loggedIn) return Markup.keyboard([[`${EMOJI.LOGIN} Login`]]).resize().oneTime(false);
  let keyboard = [
    [`${EMOJI.START} Activate`, `${EMOJI.STOP} Deactivate`],
    [`${EMOJI.BETWRAGER} Bet_Wrager`, `${EMOJI.GAME} Game Mode`],
    [`${EMOJI.TARGET} Game Type`, `${EMOJI.COLOR} Bet Type`, `${EMOJI.STRATEGY} Strategy`], 
    [`${EMOJI.SETTINGS} Betting Settings`, `${EMOJI.RISK} Risk Management`],
    [`${EMOJI.BET} Manual Bet`, `${EMOJI.INFO} Account Info`, `${EMOJI.LOGOUT} Re-Login`] 
  ];
  if (isAdminUser) keyboard.push([`${EMOJI.ADMIN} Admin Panel`]);
  return Markup.keyboard(keyboard).resize().oneTime(false);
}

function makeRiskManagementSubmenu() {
  return Markup.keyboard([
    [`${EMOJI.TARGET} Profit Target`, `${EMOJI.STOP} Stop Loss`],
    [`${EMOJI.LAYER} Entry Layer`, `${EMOJI.WARNING} Bet SL`],
    [`${EMOJI.BACK} Back`]
  ]).resize().oneTime(false);
}

function makeAdminPanelKeyboard(userId) {
  return Markup.keyboard([
    [`${EMOJI.ADD} Add User`, `${EMOJI.REMOVE} Remove User`],
    [`${EMOJI.STATS} User Stats`, `${EMOJI.MENU} Allowed IDs`],
    [`${EMOJI.BROADCAST} Broadcast`],
    [`${EMOJI.MENU} Main Menu`]
  ]).resize().oneTime(false);
}

function makeStrategyKeyboard(userId = null) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.TREND} TREND_FOLLOW`, "strategy:TREND_FOLLOW"), Markup.button.callback(`${EMOJI.ALTERNATE} ALTERNATE`, "strategy:ALTERNATE")],
    [Markup.button.callback(`${EMOJI.PATTERN} BS ORDER`, "strategy:BS_ORDER"), Markup.button.callback(`🤖 CYBER_SNIPER`, "strategy:CYBER_SNIPER")],
    [Markup.button.callback(`🥔 POTATO GRA`, "strategy:POTATO_GRA"), Markup.button.callback(`✨ SHINE`, "strategy:SHINE")]
  ]);
}

function makeBettingStrategyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.MARTINGALE} Martingale`, "betting_strategy:Martingale")],
    [Markup.button.callback(`${EMOJI.ANTI_MARTINGALE} Anti-Martingale`, "betting_strategy:Anti-Martingale")],
    [Markup.button.callback(`${EMOJI.DALEMBERT} D'Alembert`, "betting_strategy:D'Alembert")]
  ]);
}

function makeGameTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.GAME} WINGO 1min`, "game_type:WINGO")],
    [Markup.button.callback(`${EMOJI.GAME} TRX 1min`, "game_type:TRX")]
  ]);
}

// Telegram Event Listeners
async function main() {
  loadAdmins();
  loadAllowedUsers();
  loadUserSettings();

  const bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    activeUsers.add(userId);
    const loggedIn = !!userSessions[userId];
    await ctx.reply(`🔥 *WELCOME TO AUTO BET BOT* 🔥\nYour ID: \`${userId}\``, {
      parse_mode: 'Markdown',
      reply_markup: makeMainKeyboard(loggedIn, isAdmin(userId)).reply_markup
    });
  });

  bot.on('callback_query', async (ctx) => {
    await ctx.answerCbQuery();
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (data.startsWith("strategy:")) {
      const strat = data.split(":")[1];
      if (!userSettings[userId]) userSettings[userId] = {};
      userSettings[userId].strategy = strat;
      await ctx.reply(`✅ Strategy set to: *${strat}*`, { parse_mode: 'Markdown' });
    } else if (data.startsWith("betting_strategy:")) {
      const bstrat = data.split(":")[1];
      if (!userSettings[userId]) userSettings[userId] = {};
      userSettings[userId].betting_strategy = bstrat;
      await ctx.reply(`✅ Mode set to: *${bstrat}*`, { parse_mode: 'Markdown' });
    } else if (data.startsWith("game_type:")) {
      const gtype = data.split(":")[1];
      if (!userSettings[userId]) userSettings[userId] = {};
      userSettings[userId].game_type = gtype;
      await ctx.reply(`✅ Game Type set to: *${gtype}*`, { parse_mode: 'Markdown' });
    }
  });

  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    if (text === `${EMOJI.LOGIN} Login` || text === `${EMOJI.LOGOUT} Re-Login`) {
      await ctx.reply("Select Platform:", makePlatformKeyboard());
      return;
    }

    for (const [key, p] of Object.entries(PLATFORMS)) {
      if (text === `${p.color}${p.name}`) {
        userState[userId] = { state: "LOGIN_INPUT", platform: key };
        await ctx.reply(`Send phone and password in two lines:\n\`09123456789\`\n\`mypassword\``, { parse_mode: 'Markdown' });
        return;
      }
    }

    if (userState[userId]?.state === "LOGIN_INPUT") {
      const lines = text.split('\n').map(l => l.trim());
      if (lines.length >= 2) {
        await ctx.reply("Logging in...");
        const pKey = userState[userId].platform;
        const { session } = await loginRequest(lines[0], lines[1], PLATFORMS[pKey].baseUrl);
        if (session) {
          userSessions[userId] = session;
          if (!userSettings[userId]) userSettings[userId] = { platform: pKey };
          delete userState[userId];
          await ctx.reply("✅ Login Successful!", makeMainKeyboard(true, isAdmin(userId)));
        } else {
          await ctx.reply("❌ Login Failed. Check credentials.");
        }
      }
      return;
    }

    if (text === `${EMOJI.START} Activate`) {
      bettingWorker(userId, ctx, bot);
      return;
    }

    if (text === `${EMOJI.STOP} Deactivate`) {
      if (userSettings[userId]) userSettings[userId].running = false;
      await ctx.reply("⏸️ Bot Deactivated.");
      return;
    }

    if (text === `${EMOJI.STRATEGY} Strategy`) {
      await ctx.reply("Select Strategy:", makeStrategyKeyboard(userId));
      return;
    }

    if (text === `${EMOJI.SETTINGS} Betting Settings`) {
      await ctx.reply("Select Betting Strategy:", makeBettingStrategyKeyboard());
      return;
    }

    if (text === `${EMOJI.TARGET} Game Type`) {
      await ctx.reply("Select Game Type:", makeGameTypeKeyboard());
      return;
    }
  });

  winLoseChecker(bot).catch(err => logging.error(`Checker error: ${err.message}`));

  bot.launch().then(() => logging.info("Telegraf Bot Launched")).catch(err => logging.error(err.message));
}

main();
