const badWords = [
    "abuse", "anal", "ass", "asshole", "bastard", "bitch", "cock", "cunt", "damn", "dick", "dildo", "dyke", "fag", "faggot", "fuck", "fucc", "fucker", "fucking", "gay", "goddamn", "hell", "homo", "jerk", "jizz", "knob", "kunt", "lesbian", "nigger", "piss", "pussy", "queer", "rape", "scum", "sex", "shit", "slut", "spastic", "tit", "tits", "turd", "twat", "vagina", "wank", "wanker", "whore", "wtf"
];

exports.containsProfanity = (text) => {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return badWords.some(word => {
        // Match whole words only to avoid false positives (e.g., "ass" in "bass")
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        return regex.test(lowerText);
    });
};
