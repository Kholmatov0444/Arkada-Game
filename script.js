const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    buildStars();
});

/* =========================================================
   YANDEX GAMES SDK
   Обязательно для публикации: инициализация SDK + сигнал
   готовности через LoadingAPI.ready(), иначе Яндекс Игры
   считают, что SDK не встроен (п. 1.1 требований платформы).
   Всё обёрнуто в try/catch, чтобы игра спокойно работала
   и локально, и на других площадках без SDK.
========================================================= */
let ysdk = null;
let restartsSinceAd = 0;

function initYandexSDK() {
    if (typeof YaGames === "undefined") {
        // SDK недоступен (локальный запуск / другая площадка) — просто продолжаем
        finishLoading();
        return;
    }
    YaGames.init().then((sdk) => {
        ysdk = sdk;
        try {
            // Пытаемся подхватить язык игрока из окружения Яндекса
            const envLang = sdk.environment && sdk.environment.i18n && sdk.environment.i18n.lang;
            if (envLang === "en" || envLang === "ru") {
                gameSettings.lang = envLang;
            }
        } catch (e) {}
        finishLoading();
    }).catch(() => {
        finishLoading();
    });
}

function finishLoading() {
    try {
        if (ysdk && ysdk.features && ysdk.features.LoadingAPI) {
            ysdk.features.LoadingAPI.ready();
        }
    } catch (e) {}
    const loadingBar = document.getElementById("loadingBar");
    if (loadingBar) loadingBar.style.width = "100%";
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.classList.add("hidden");
            setTimeout(() => loadingScreen.remove(), 550);
        }, 250);
    }
}

function safeGameplayStart() {
    try {
        if (ysdk && ysdk.features && ysdk.features.GameplayAPI) {
            ysdk.features.GameplayAPI.start();
        }
    } catch (e) {}
}

function safeGameplayStop() {
    try {
        if (ysdk && ysdk.features && ysdk.features.GameplayAPI) {
            ysdk.features.GameplayAPI.stop();
        }
    } catch (e) {}
}

function maybeShowInterstitialAd(callback) {
    restartsSinceAd++;
    if (!ysdk || !ysdk.adv || restartsSinceAd < 3) {
        if (callback) callback();
        return;
    }
    restartsSinceAd = 0;
    try {
        ysdk.adv.showFullscreenAdv({
            callbacks: {
                onClose: () => { if (callback) callback(); },
                onError: () => { if (callback) callback(); }
            }
        });
    } catch (e) {
        if (callback) callback();
    }
}

/* =========================================================
   ЗВУК
========================================================= */
let audioCtx = null;
let musicInterval = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playTone(freq1, freq2, duration, type, gainStart) {
    if (!gameSettings.soundEnabled || !audioCtx) return;
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq1, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq2, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(gainStart, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playStepSound() { playTone(120, 40, 0.08, 'triangle', 0.15); }
function playCoinSound() { playTone(600, 1200, 0.15, 'sine', 0.2); }
function playExplosionSound() { playTone(150, 30, 0.4, 'sawtooth', 0.4); }

function playPurchaseSound() {
    if (!gameSettings.soundEnabled || !audioCtx) return;
    [523, 659, 784].forEach((f, i) => {
        setTimeout(() => playTone(f, f, 0.16, 'sine', 0.18), i * 70);
    });
}

function playGameStartSound() {
    if (!gameSettings.soundEnabled || !audioCtx) return;
    playTone(220, 660, 0.25, 'square', 0.12);
}

function startMusic() {
    if (musicInterval) clearInterval(musicInterval);
    const notes = [220, 246.94, 261.63, 293.66, 329.63];
    musicInterval = setInterval(() => {
        if (!gameSettings.soundEnabled || isPaused || !audioCtx) return;
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = 'sine';
        let note = notes[Math.floor(Math.random() * notes.length)];
        osc.frequency.setValueAtTime(note, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }, 400);
}

function stopMusic() {
    if (musicInterval) clearInterval(musicInterval);
}

/* =========================================================
   ПЕРСОНАЖИ
========================================================= */
const charactersData = [
    { id: 'default', name: 'Обычный парень', price: 0, type: 'classic', color1: '#ff4b2b', color2: '#ff416c', trailColor: '#ff4b2b', coinMultiplier: 1 },
    { id: 'sporty', name: 'Спортсмен в кепке', price: 40, type: 'cap', color1: '#3b82f6', color2: '#1d4ed8', trailColor: '#3b82f6', coinMultiplier: 1 },
    { id: 'neon', name: 'Неоновый панк', price: 120, type: 'punk', color1: '#00f2fe', color2: '#4facfe', trailColor: '#00f2fe', coinMultiplier: 2 },
    { id: 'emerald', name: 'Лесной ниндзя', price: 250, type: 'hood', color1: '#0ba360', color2: '#3cba92', trailColor: '#0ba360', coinMultiplier: 2 },
    { id: 'cyber', name: 'Кибер-робот', price: 500, type: 'robot', color1: '#71717a', color2: '#27272a', trailColor: '#00f2fe', coinMultiplier: 3 },
    { id: 'golden', name: 'Золотой магнат', price: 1000, type: 'tophat', color1: '#f7971e', color2: '#ffd200', trailColor: '#ffd700', coinMultiplier: 3 },
    { id: 'wizard', name: 'Старый волшебник', price: 2000, type: 'wizard', color1: '#4338ca', color2: '#312e81', trailColor: '#a78bfa', coinMultiplier: 4 },
    { id: 'devil', name: 'Огненный демон', price: 3500, type: 'horns', color1: '#dc2626', color2: '#991b1b', trailColor: '#ef4444', coinMultiplier: 4 },
    { id: 'galaxy', name: 'Космический ас', price: 5500, type: 'helmet', color1: '#2b5876', color2: '#4e4376', trailColor: '#8b5cf6', coinMultiplier: 5 },
    { id: 'king', name: '👑 Король арены', price: 8000, type: 'crown', color1: '#ca8a04', color2: '#a16207', trailColor: '#facc15', coinMultiplier: 6 },
    { id: 'matrix', name: 'Неуловимый Хакер', price: 12000, type: 'glasses', color1: '#166534', color2: '#14532d', trailColor: '#22c55e', coinMultiplier: 8 },
    { id: 'legend', name: '⚡ Золотой Титан', price: 20000, type: 'titan', color1: '#facc15', color2: '#ca8a04', trailColor: '#ffffff', coinMultiplier: 10 }
];

function getRarity(price) {
    if (price === 0) return 'free';
    if (price <= 300) return 'common';
    if (price <= 1500) return 'rare';
    if (price <= 6000) return 'epic';
    return 'legendary';
}

const rarityLabels = {
    ru: { free: 'Бесплатно', common: 'Обычный', rare: 'Редкий', epic: 'Особый', legendary: 'Легендарный' },
    en: { free: 'Free', common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }
};

let playerName = localStorage.getItem('game_player_name') || "";
let playerCoins = parseInt(localStorage.getItem('game_coins')) || 0;
let highScore = parseInt(localStorage.getItem('game_highscore')) || 0;
let ownedCharacters = JSON.parse(localStorage.getItem('game_owned')) || ['default'];
let selectedCharId = localStorage.getItem('game_selected') || 'default';

let reviveCount = 0;
const revivePrices = [20, 40];

let gameSettings = {
    lang: "ru",
    soundEnabled: true,
    difficulty: "normal"
};

const translations = {
    ru: {
        settings: "Настройки",
        shop: "🏪 Магазин",
        lang: "Язык:",
        sound: "Звуки и музыка:",
        soundOn: "🔊 Включено",
        soundOff: "🔇 Выключено",
        diff: "Уровень сложности:",
        apply: "Начать игру",
        totalCoins: "Монет: ",
        record: "Рекорд: ",
        reviveBtnText: "Продолжить за",
        select: "Выбрать",
        selected: "Выбран",
        buy: "Купить за",
        dailyTitle: "🎁 Ежедневный бонус!",
        dailyText: "Вы зашли в игру сегодня! Получите награду:",
        claimDaily: "Забрать бонус!",
        gameOverTitle: "💥 Игра окончена!",
        newRecord: "🏆 Новый рекорд!",
        scoreLabel: "Счёт:",
        recordLabel: "Рекорд:",
        coinsLabel: "Монет получено:",
        playAgain: "🔄 Играть снова",
        shopFromGameOver: "🏪 Магазин"
    },
    en: {
        settings: "Settings",
        shop: "🏪 Shop",
        lang: "Language:",
        sound: "Sound & Music:",
        soundOn: "🔊 Enabled",
        soundOff: "🔇 Disabled",
        diff: "Difficulty:",
        apply: "Start Game",
        totalCoins: "Coins: ",
        record: "Best: ",
        reviveBtnText: "Continue for",
        select: "Select",
        selected: "Selected",
        buy: "Buy for",
        dailyTitle: "🎁 Daily Bonus!",
        dailyText: "Welcome back today! Claim your reward:",
        claimDaily: "Claim Bonus!",
        gameOverTitle: "💥 Game Over!",
        newRecord: "🏆 New record!",
        scoreLabel: "Score:",
        recordLabel: "Best:",
        coinsLabel: "Coins earned:",
        playAgain: "🔄 Play again",
        shopFromGameOver: "🏪 Shop"
    }
};

const player = {
    x: canvas.width / 2 - 35,
    y: canvas.height - 150,
    width: 70,
    height: 100,
    speed: 9,
    dx: 0,
    animFrame: 0,
    isBlinking: false,
    stepTimer: 0
};

setInterval(() => {
    player.isBlinking = true;
    setTimeout(() => { player.isBlinking = false; }, 150);
}, 5000);

let items = [];
let particles = [];
let stars = [];
let score = 0;
let isPaused = true;

/* =========================================================
   ФОН: мерцающие звёзды для более "профессионального" вида
========================================================= */
function buildStars() {
    stars = [];
    let count = Math.floor((canvas.width * canvas.height) / 9000);
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.6 + 0.4,
            phase: Math.random() * Math.PI * 2,
            speed: 0.01 + Math.random() * 0.02
        });
    }
}
buildStars();

function drawStars() {
    for (let s of stars) {
        s.phase += s.speed;
        let alpha = 0.35 + Math.sin(s.phase) * 0.35;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
}

/* =========================================================
   АВТОРИЗАЦИЯ (локальное имя игрока)
========================================================= */
function createAuthModal() {
    let existing = document.getElementById("authModal");
    if (existing) existing.remove();

    if (playerName) return;

    let modal = document.createElement("div");
    modal.id = "authModal";
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(4, 3, 16, 0.85); display: flex; justify-content: center;
        align-items: center; z-index: 10000; font-family: 'Segoe UI', Arial, sans-serif;
        backdrop-filter: blur(8px);
    `;

    modal.innerHTML = `
        <div style="background: #140f33; border: 1.5px solid rgba(139,107,255,0.3); padding: 30px; border-radius: 20px; text-align: center; color: #fff; width: 350px; max-width: 90vw; box-shadow: 0 20px 50px rgba(0,0,0,0.55), 0 0 40px rgba(139,107,255,0.15); box-sizing: border-box;">
            <div style="font-size:40px; margin-bottom: 6px;">🪙</div>
            <h2 style="margin-bottom: 15px; color: #ffd54a;">Добро пожаловать!</h2>
            <p style="margin-bottom: 20px; color: #a29bd6; font-size: 14px;">Введите ваше имя, чтобы начать игру и сохранять прогресс:</p>
            <input id="playerNameInput" type="text" placeholder="Ваше имя..." style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #3d3573; background: #0f0c29; color: #fff; font-size: 16px; margin-bottom: 20px; outline: none; box-sizing: border-box;">
            <button id="saveAuthBtn" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #ff5940, #ff3d78); border: none; border-radius: 10px; color: #fff; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 6px 18px rgba(255,61,120,0.35);">Начать игру</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("saveAuthBtn").addEventListener("click", submitAuth);
    document.getElementById("playerNameInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitAuth();
    });

    function submitAuth() {
        let inputVal = document.getElementById("playerNameInput").value.trim();
        if (inputVal.length < 2) {
            alert("Имя должно содержать хотя бы 2 символа!");
            return;
        }
        playerName = inputVal;
        localStorage.setItem('game_player_name', playerName);
        modal.remove();

        initAudio();
        isPaused = false;
        safeGameplayStart();
        playGameStartSound();
        if (gameSettings.soundEnabled) startMusic();
        checkDailyBonus();
    }
}

function checkDailyBonus() {
    const lastLogin = localStorage.getItem('game_last_login');
    const today = new Date().toDateString();

    if (lastLogin !== today) {
        document.getElementById("dailyModal").style.display = "flex";
        isPaused = true;
        safeGameplayStop();
    }
}

document.getElementById("claimDailyBtn").addEventListener("click", () => {
    playerCoins += 50;
    localStorage.setItem('game_coins', playerCoins);
    localStorage.setItem('game_last_login', new Date().toDateString());
    document.getElementById("dailyModal").style.display = "none";
    isPaused = false;
    safeGameplayStart();
    if (gameSettings.soundEnabled) startMusic();
});

/* =========================================================
   ВОЗРОЖДЕНИЕ
========================================================= */
const reviveModal = document.getElementById("reviveModal");
const reviveBtn = document.getElementById("reviveBtn");
const giveUpBtn = document.getElementById("giveUpBtn");

/* =========================================================
   ЭКРАН ПРОИГРЫША
========================================================= */
const gameOverModal = document.getElementById("gameOverModal");
const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverShopBtn = document.getElementById("gameOverShopBtn");

function triggerGameOver() {
    isPaused = true;
    stopMusic();
    safeGameplayStop();
    playExplosionSound();

    if (reviveCount < revivePrices.length && playerCoins >= revivePrices[reviveCount]) {
        let currentPrice = revivePrices[reviveCount];
        let t = translations[gameSettings.lang];
        document.getElementById("reviveCostDisplay").textContent = `${t.reviveBtnText} 💰 ${currentPrice}`;
        reviveModal.style.display = "flex";
    } else {
        showGameOverScreen();
    }
}

function showGameOverScreen() {
    let t = translations[gameSettings.lang];
    let isNewRecord = score > highScore;
    if (isNewRecord) {
        highScore = score;
        localStorage.setItem('game_highscore', highScore);
    }

    document.getElementById("gameOverTitle").textContent = t.gameOverTitle;
    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalRecord").textContent = highScore;
    document.getElementById("finalCoins").textContent = "+" + score;
    document.getElementById("newRecordBadge").style.display = isNewRecord ? "block" : "none";
    document.getElementById("newRecordBadge").textContent = t.newRecord;
    playAgainBtn.textContent = t.playAgain;
    gameOverShopBtn.textContent = t.shopFromGameOver;

    gameOverModal.style.display = "flex";
}

playAgainBtn.addEventListener("click", () => {
    gameOverModal.style.display = "none";
    maybeShowInterstitialAd(() => {
        score = 0;
        reviveCount = 0;
        spawnItems();
        isPaused = false;
        safeGameplayStart();
        playGameStartSound();
        if (gameSettings.soundEnabled) startMusic();
    });
});

gameOverShopBtn.addEventListener("click", () => {
    gameOverModal.style.display = "none";
    score = 0;
    reviveCount = 0;
    spawnItems();
    renderShop();
    shopModal.style.display = "flex";
});

reviveBtn.addEventListener("click", () => {
    let currentPrice = revivePrices[reviveCount];
    if (playerCoins >= currentPrice) {
        playerCoins -= currentPrice;
        localStorage.setItem('game_coins', playerCoins);
        reviveCount++;
        reviveModal.style.display = "none";
        items = [];
        isPaused = false;
        safeGameplayStart();
        if (gameSettings.soundEnabled) startMusic();
    }
});

giveUpBtn.addEventListener("click", () => {
    reviveModal.style.display = "none";
    showGameOverScreen();
});

/* =========================================================
   МАГАЗИН
========================================================= */
const shopModal = document.getElementById("shopModal");
const shopBtn = document.getElementById("shopBtn");
const closeShopBtn = document.getElementById("closeShopBtn");

shopBtn.addEventListener("click", () => {
    isPaused = true;
    stopMusic();
    safeGameplayStop();
    renderShop();
    shopModal.style.display = "flex";
});

closeShopBtn.addEventListener("click", () => {
    shopModal.style.display = "none";
    isPaused = false;
    safeGameplayStart();
    if (gameSettings.soundEnabled) startMusic();
});

function renderShop() {
    document.getElementById("playerCoins").textContent = playerCoins;
    let listContainer = document.getElementById("charactersList");
    listContainer.innerHTML = "";
    let t = translations[gameSettings.lang];
    let rl = rarityLabels[gameSettings.lang];

    charactersData.forEach(char => {
        let isOwned = ownedCharacters.includes(char.id);
        let isSelected = selectedCharId === char.id;
        let rarity = getRarity(char.price);

        let card = document.createElement("div");
        card.className = "character-card" + (isSelected ? " is-selected" : "");

        let btnHtml = "";
        if (isSelected) {
            btnHtml = `<button class="char-btn btn-selected">${t.selected}</button>`;
        } else if (isOwned) {
            btnHtml = `<button class="char-btn btn-select" onclick="selectCharacter('${char.id}')">${t.select}</button>`;
        } else {
            let canAfford = playerCoins >= char.price;
            btnHtml = `<button class="char-btn btn-buy" ${canAfford ? "" : "disabled"} onclick="buyCharacter('${char.id}', ${char.price})">${t.buy} ${char.price} 💰</button>`;
        }

        card.innerHTML = `
            <div class="character-info">
                <div class="char-preview" style="background: linear-gradient(135deg, ${char.color1}, ${char.color2});"></div>
                <div>
                    <div class="char-name-row">
                        <span class="char-name">${char.name}</span>
                        <span class="rarity-badge rarity-${rarity}">${rl[rarity]}</span>
                    </div>
                    <div class="char-price">${char.price === 0 ? rl.free : char.price + ' 💰'} · x${char.coinMultiplier}</div>
                </div>
            </div>
            ${btnHtml}
        `;
        listContainer.appendChild(card);
    });
}

window.selectCharacter = function(id) {
    selectedCharId = id;
    localStorage.setItem('game_selected', id);
    renderShop();
}

window.buyCharacter = function(id, price) {
    if (playerCoins >= price) {
        playerCoins -= price;
        ownedCharacters.push(id);
        selectedCharId = id;
        localStorage.setItem('game_coins', playerCoins);
        localStorage.setItem('game_owned', JSON.stringify(ownedCharacters));
        localStorage.setItem('game_selected', selectedCharId);
        playPurchaseSound();
        renderShop();
    } else {
        alert(gameSettings.lang === 'ru' ? "Недостаточно монет! Играйте больше, чтобы накопить." : "Not enough coins! Keep playing to earn more.");
    }
}

function getActiveCharacter() {
    return charactersData.find(c => c.id === selectedCharId) || charactersData[0];
}

/* =========================================================
   СЛОЖНОСТЬ И СПАВН ПРЕДМЕТОВ
   Постепенное усложнение внутри забега: чем выше счёт,
   тем быстрее падают предметы и тем чаще встречаются
   "быстрые" бомбы — второй тип препятствия.
========================================================= */
function getDifficultyParams() {
    switch (gameSettings.difficulty) {
        case "easy": return { coins: 4, bombs: 3, speed: 4 };
        case "normal": return { coins: 5, bombs: 5, speed: 5.5 };
        case "hard": return { coins: 6, bombs: 7, speed: 7 };
        case "impossible": return { coins: 7, bombs: 10, speed: 9 };
        default: return { coins: 5, bombs: 5, speed: 5.5 };
    }
}

function getProgression() {
    // Растёт от 0 до 3 по мере накопления счёта за текущий забег
    return Math.min(score / 220, 3);
}

function spawnItems() {
    items = [];
    let params = getDifficultyParams();
    let progression = getProgression();
    let padding = 60;
    let availableWidth = canvas.width - padding * 2;
    let speedMultiplier = 1 + progression * 0.18;
    let extraBombs = Math.floor(progression);

    for (let i = 0; i < params.coins; i++) {
        let randomX = padding + Math.random() * availableWidth;
        items.push({
            type: 'coin',
            x: randomX,
            y: -80 - Math.random() * 400,
            size: 42,
            speed: (params.speed + Math.random() * 2) * speedMultiplier,
            angle: 0
        });
    }

    let totalBombs = params.bombs + extraBombs;
    for (let i = 0; i < totalBombs; i++) {
        let randomX = padding + Math.random() * availableWidth;
        // После набора счёта появляется более быстрый и опасный тип бомбы
        let isFast = progression >= 1 && Math.random() < 0.35;
        items.push({
            type: 'bomb',
            variant: isFast ? 'fast' : 'normal',
            x: randomX,
            y: -100 - Math.random() * 500,
            size: isFast ? 38 : 48,
            speed: (params.speed + (isFast ? 3 : 1) + Math.random() * 2.5) * speedMultiplier,
            angle: 0
        });
    }
}

spawnItems();

/* =========================================================
   НАСТРОЙКИ
========================================================= */
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const langSelect = document.getElementById("langSelect");
const diffSelect = document.getElementById("diffSelect");
const toggleSoundBtn = document.getElementById("toggleSoundBtn");

settingsBtn.addEventListener("click", () => {
    isPaused = true;
    stopMusic();
    safeGameplayStop();
    settingsModal.style.display = "flex";
});

toggleSoundBtn.addEventListener("click", () => {
    initAudio();
    gameSettings.soundEnabled = !gameSettings.soundEnabled;
    let t = translations[gameSettings.lang];
    toggleSoundBtn.textContent = gameSettings.soundEnabled ? t.soundOn : t.soundOff;
    if (gameSettings.soundEnabled && !isPaused) startMusic();
    else stopMusic();
});

closeSettingsBtn.addEventListener("click", () => {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    gameSettings.lang = langSelect.value;
    gameSettings.difficulty = diffSelect.value;

    score = 0;
    reviveCount = 0;
    spawnItems();

    updateUItexts();
    settingsModal.style.display = "none";
    isPaused = false;
    safeGameplayStart();
    playGameStartSound();

    if (gameSettings.soundEnabled) {
        startMusic();
    }
});

function updateUItexts() {
    let t = translations[gameSettings.lang];
    settingsBtn.textContent = "⚙️ " + t.settings;
    shopBtn.textContent = t.shop;
    document.getElementById("modalTitle").textContent = t.settings;
    document.getElementById("langLabel").textContent = t.lang;
    document.getElementById("soundLabel").textContent = t.sound;
    document.getElementById("diffLabel").textContent = t.diff;
    closeSettingsBtn.textContent = t.apply;
    langSelect.value = gameSettings.lang;
}

/* =========================================================
   УПРАВЛЕНИЕ
========================================================= */
document.addEventListener("keydown", (e) => {
    if (isPaused) return;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "ф") player.dx = -player.speed;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "в") player.dx = player.speed;
});

document.addEventListener("keyup", (e) => {
    if (
        e.key === "ArrowLeft" || e.key === "a" || e.key === "ф" ||
        e.key === "ArrowRight" || e.key === "d" || e.key === "в"
    ) {
        player.dx = 0;
    }
});

document.addEventListener("touchmove", (e) => {
    if (isPaused) return;
    const touchX = e.touches[0].clientX;
    player.x = touchX - player.width / 2;
});

/* =========================================================
   ОБНОВЛЕНИЕ
========================================================= */
function update() {
    if (isPaused) return;

    player.x += player.dx;
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

    if (player.dx !== 0) {
        player.animFrame += 0.25;
        player.stepTimer++;
        if (player.stepTimer % 12 === 0) {
            playStepSound();
        }
    } else {
        player.animFrame = 0;
    }

    let allFallen = true;
    for (let item of items) {
        item.y += item.speed;
        item.angle += 0.05;

        if (item.y <= canvas.height) {
            allFallen = false;
        }

        if (
            player.x < item.x + item.size &&
            player.x + player.width > item.x &&
            player.y < item.y + item.size &&
            player.y + player.height > item.y
        ) {
            if (item.type === 'coin') {
                playCoinSound();
                let char = getActiveCharacter();
                let earned = 1 * char.coinMultiplier;
                score += earned;
                playerCoins += earned;
                localStorage.setItem('game_coins', playerCoins);
                item.y = canvas.height + 100;
            } else if (item.type === 'bomb') {
                triggerGameOver();
                return;
            }
        }
    }

    if (allFallen) {
        spawnItems();
    }
}

/* =========================================================
   ОТРИСОВКА ПЕРСОНАЖА
========================================================= */
function drawCharacter(pX, pY, bounce, tilt, limbSwing) {
    let char = getActiveCharacter();

    ctx.save();
    ctx.translate(pX, pY + 50);
    ctx.rotate(tilt);

    ctx.strokeStyle = "#1b263b";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(-10, 25); ctx.lineTo(-15 - limbSwing, 55); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 25); ctx.lineTo(15 + limbSwing, 55); ctx.stroke();

    let jacketGrad = ctx.createLinearGradient(-25, -15, 25, 30);
    jacketGrad.addColorStop(0, char.color1);
    jacketGrad.addColorStop(1, char.color2);
    ctx.fillStyle = jacketGrad;
    ctx.beginPath();
    ctx.roundRect(-22, -18, 44, 45, [12, 12, 8, 8]);
    ctx.fill();

    if (char.type === 'robot') {
        ctx.fillStyle = "#00f2fe";
        ctx.fillRect(-6, -4, 12, 12);
    } else if (char.type === 'titan' || char.type === 'crown') {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -18); ctx.lineTo(0, 27); ctx.stroke();
    } else {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -18); ctx.lineTo(0, 27); ctx.stroke();
    }

    ctx.strokeStyle = (char.type === 'robot') ? "#71717a" : "#ffdbac";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-22, -10); ctx.lineTo(-38 + limbSwing, 10); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22, -10); ctx.lineTo(38 - limbSwing, 10); ctx.stroke();

    ctx.fillStyle = (char.type === 'robot') ? "#52525b" : "#ffdbac";
    ctx.beginPath();
    ctx.arc(0, -45 - bounce, 20, 0, Math.PI * 2);
    ctx.fill();

    if (char.type === 'classic') {
        ctx.fillStyle = "#2b1b17";
        ctx.beginPath();
        ctx.arc(0, -50 - bounce, 20, Math.PI, Math.PI * 2);
        ctx.fill();
    } else if (char.type === 'cap') {
        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(0, -50 - bounce, 20, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-5, -68 - bounce, 28, 6);
    } else if (char.type === 'punk') {
        ctx.fillStyle = "#00f2fe";
        ctx.beginPath();
        ctx.moveTo(-4, -65 - bounce); ctx.lineTo(4, -65 - bounce); ctx.lineTo(2, -82 - bounce); ctx.lineTo(-2, -82 - bounce);
        ctx.fill();
    } else if (char.type === 'hood') {
        ctx.fillStyle = "#0ba360";
        ctx.beginPath();
        ctx.arc(0, -48 - bounce, 23, Math.PI * 0.8, Math.PI * 2.2);
        ctx.fill();
    } else if (char.type === 'robot') {
        ctx.strokeStyle = "#00f2fe";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -65 - bounce); ctx.lineTo(0, -75 - bounce); ctx.stroke();
        ctx.fillStyle = "#00f2fe";
        ctx.beginPath();
        ctx.arc(0, -77 - bounce, 4, 0, Math.PI * 2);
        ctx.fill();
    } else if (char.type === 'tophat') {
        ctx.fillStyle = "#111";
        ctx.fillRect(-14, -68 - bounce, 28, 22);
        ctx.fillRect(-22, -48 - bounce, 44, 4);
    } else if (char.type === 'wizard') {
        ctx.fillStyle = "#312e81";
        ctx.beginPath();
        ctx.moveTo(0, -90 - bounce); ctx.lineTo(-24, -55 - bounce); ctx.lineTo(24, -55 - bounce);
        ctx.fill();
    } else if (char.type === 'horns') {
        ctx.fillStyle = "#7f1d1d";
        ctx.beginPath();
        ctx.moveTo(-12, -60 - bounce); ctx.lineTo(-22, -75 - bounce); ctx.lineTo(-8, -64 - bounce);
        ctx.moveTo(12, -60 - bounce); ctx.lineTo(22, -75 - bounce); ctx.lineTo(8, -64 - bounce);
        ctx.fill();
    } else if (char.type === 'helmet') {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, -45 - bounce, 22, 0, Math.PI * 2);
        ctx.stroke();
    } else if (char.type === 'crown') {
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.moveTo(-16, -62 - bounce); ctx.lineTo(-18, -80 - bounce); ctx.lineTo(-7, -68 - bounce); ctx.lineTo(0, -82 - bounce); ctx.lineTo(7, -68 - bounce); ctx.lineTo(18, -80 - bounce); ctx.lineTo(16, -62 - bounce);
        ctx.fill();
    } else if (char.type === 'glasses') {
        ctx.fillStyle = "#111";
        ctx.fillRect(-14, -52 - bounce, 11, 7);
        ctx.fillRect(3, -52 - bounce, 11, 7);
    } else if (char.type === 'titan') {
        ctx.fillStyle = "#ca8a04";
        ctx.beginPath();
        ctx.arc(0, -50 - bounce, 22, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#facc15";
        ctx.fillRect(-3, -75 - bounce, 6, 12);
    }

    if (char.type !== 'robot' && char.type !== 'helmet' && char.type !== 'glasses') {
        if (player.isBlinking) {
            ctx.strokeStyle = "#111111";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-10, -47 - bounce); ctx.lineTo(-4, -47 - bounce);
            ctx.moveTo(4, -47 - bounce); ctx.lineTo(10, -47 - bounce);
            ctx.stroke();
        } else {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(-7, -47 - bounce, 4.5, 0, Math.PI * 2);
            ctx.arc(7, -47 - bounce, 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#111111";
            ctx.beginPath();
            ctx.arc(-6, -47 - bounce, 2, 0, Math.PI * 2);
            ctx.arc(8, -47 - bounce, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (char.type === 'robot') {
        ctx.fillStyle = "#00f2fe";
        ctx.fillRect(-12, -50 - bounce, 24, 5);
    }

    ctx.restore();
}

/* =========================================================
   ОТРИСОВКА КАДРА
========================================================= */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStars();

    if (player.dx !== 0 && !isPaused) {
        let char = getActiveCharacter();
        particles.push({
            x: player.x + player.width / 2,
            y: player.y + player.height - 10,
            alpha: 1,
            color: char.trailColor
        });
    }

    particles.forEach((p, index) => {
        p.alpha -= 0.04;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        if (p.alpha <= 0) {
            particles.splice(index, 1);
        }
    });
    ctx.globalAlpha = 1.0;

    const pX = player.x + player.width / 2;
    const pY = player.y;

    const bounce = Math.abs(Math.sin(player.animFrame)) * 8;
    const tilt = (player.dx !== 0) ? Math.sin(player.animFrame * 2) * 0.08 : 0;
    const limbSwing = Math.sin(player.animFrame * 2) * 18;

    drawCharacter(pX, pY, bounce, tilt, limbSwing);

    for (let item of items) {
        if (item.y > canvas.height + 50) continue;

        ctx.save();
        ctx.translate(item.x + item.size / 2, item.y + item.size / 2);

        if (item.type === 'coin') {
            ctx.scale(Math.cos(item.angle), 1);
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#ffd700";

            let coinGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, item.size / 2);
            coinGrad.addColorStop(0, "#fff5cc");
            coinGrad.addColorStop(0.5, "#ffd700");
            coinGrad.addColorStop(1, "#cca100");

            ctx.fillStyle = coinGrad;
            ctx.beginPath();
            ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#b38600";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, item.size / 2 - 4, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "#b38600";
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("$", 0, 1);

        } else if (item.type === 'bomb') {
            let isFast = item.variant === 'fast';
            ctx.shadowBlur = isFast ? 26 : 20;
            ctx.shadowColor = isFast ? "#ff0066" : "#ff3300";

            let bombGrad = ctx.createRadialGradient(-5, -5, 5, 0, 0, item.size / 2);
            if (isFast) {
                bombGrad.addColorStop(0, "#7a1030");
                bombGrad.addColorStop(0.7, "#3a0518");
                bombGrad.addColorStop(1, "#000000");
            } else {
                bombGrad.addColorStop(0, "#555555");
                bombGrad.addColorStop(0.7, "#222222");
                bombGrad.addColorStop(1, "#000000");
            }

            ctx.fillStyle = bombGrad;
            ctx.beginPath();
            ctx.arc(0, 4, item.size / 2 - 4, 0, Math.PI * 2);
            ctx.fill();

            if (isFast) {
                ctx.strokeStyle = "#ff3f6c";
                ctx.lineWidth = 2;
                for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * (item.size / 2 - 4), 4 + Math.sin(a) * (item.size / 2 - 4));
                    ctx.lineTo(Math.cos(a) * (item.size / 2 + 4), 4 + Math.sin(a) * (item.size / 2 + 4));
                    ctx.stroke();
                }
            }

            ctx.strokeStyle = "#b5651d";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.quadraticCurveTo(10, -25, 15, -20);
            ctx.stroke();

            ctx.fillStyle = "#ffaa00";
            ctx.beginPath();
            ctx.arc(15, -20, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    ctx.shadowBlur = 0;
    let t = translations[gameSettings.lang];

    ctx.font = "bold 24px 'Segoe UI', Arial";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.fillText(`${playerName ? playerName : 'Игрок'}: ${score}`, 25, 45);

    ctx.font = "bold 18px 'Segoe UI', Arial";
    ctx.fillStyle = "#ffd54a";
    ctx.fillText(t.totalCoins + playerCoins, 25, 75);

    ctx.fillStyle = "#c4b5fd";
    ctx.fillText(t.record + Math.max(highScore, score), 25, 100);
    ctx.shadowBlur = 0;
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

/* =========================================================
   ЗАПУСК
========================================================= */
initYandexSDK();

if (!playerName) {
    createAuthModal();
} else {
    isPaused = false;
    safeGameplayStart();
    checkDailyBonus();
    if (gameSettings.soundEnabled) startMusic();
}

updateUItexts();
loop();
