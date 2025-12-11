const LOCAL_STORAGE_KEY = 'stacker_user_scores';

function getStorageKey(username) {
    return `${LOCAL_STORAGE_KEY}_${username}`;
}

export function saveUserScore(username, scoreData) {
    if (!username) return null;
    const key = getStorageKey(username);
    const scores = getUserScores(username);
    
    const newScore = {
        ...scoreData,
        tempId: `local_${Date.now()}_${Math.random()}`
    };
    scores.push(newScore);
    
    try {
        localStorage.setItem(key, JSON.stringify(scores));
        return newScore.tempId;
    } catch (e) {
        console.error("Failed to save score to local storage:", e);
        return null;
    }
}

export function getUserScores(username) {
    if (!username) return [];
    const key = getStorageKey(username);
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("Failed to get scores from local storage:", e);
        return [];
    }
}

export function removeUserScore(username, tempId) {
    if (!username) return;
    const key = getStorageKey(username);
    let scores = getUserScores(username);
    scores = scores.filter(s => s.tempId !== tempId);
    try {
        localStorage.setItem(key, JSON.stringify(scores));
    } catch (e) {
        console.error("Failed to remove score from local storage:", e);
    }
}

export function updateUserScore(username, tempId, updates) {
    if (!username) return;
    const key = getStorageKey(username);
    let scores = getUserScores(username);
    const scoreIndex = scores.findIndex(s => s.tempId === tempId);
    if (scoreIndex > -1) {
        scores[scoreIndex] = { ...scores[scoreIndex], ...updates };
        try {
            localStorage.setItem(key, JSON.stringify(scores));
        } catch(e) {
            console.error("Failed to update score in local storage:", e);
        }
    }
}