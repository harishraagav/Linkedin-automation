// ideagen.js
// --- NEWS API & GEMINI CALLS ---
const NEWS_API_ENDPOINT = "https://newsapi.org/v2/everything";
// Using the faster Flash model for structured output generation
const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent"; 
const GEMINI_TIMEOUT_MS = 50000; // 20 seconds timeout for Gemini call
const NEWS_API_TIMEOUT_MS = 15000; // 15 seconds timeout for NewsAPI call

/**
 * Searches recent tech articles using NewsAPI with a timeout.
 */
async function searchRecentTechArticles(newsApiKey, query, fromDaysAgo = 10, pageSize = 10) {
    const fromDate = new Date(Date.now() - fromDaysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const url = new URL(NEWS_API_ENDPOINT);
    url.search = new URLSearchParams({
        q: query,
        language: 'en',
        pageSize: pageSize,
        sortBy: 'publishedAt',
        apiKey: newsApiKey,
        from: fromDate,
    }).toString();

    const fetchPromise = fetch(url);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('NewsAPI request timed out after 15 seconds.')), NEWS_API_TIMEOUT_MS)
    );

    try {
        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`NewsAPI HTTP error! Status: ${response.status}. Body: ${errorBody.substring(0, 50)}...`);
        }
        
        const data = await response.json();
        return data.articles || [];
    } catch (e) {
        throw e; // Re-throw any timeout or network errors
    }
}

/**
 * Compresses article list into bullet points for the model context.
 */
function compactArticleList(articles, maxLenEach = 240) {
    return articles.map(a => {
        const title = (a.title || "").trim();
        const url = a.url || "";
        let desc = (a.description || a.content || "").replace(/\n/g, " ").trim();
        if (desc.length > maxLenEach) {
            desc = desc.substring(0, maxLenEach - 3).trim() + "...";
        }
        return `${title} (${url}) — ${desc}`;
    });
}

/**
 * Builds the strict JSON prompt for the Gemini model.
 */
function buildPrompt(bullets) {
    const systemInstruction = (
        "You are a creative LinkedIn content strategist specialized in tech/AI/IoT/robotics. " +
        "Your SOLE output must be a valid JSON array of EXACTLY 10 objects, based on the user's request. " +
        "DO NOT add any conversational prose, preambles, or explanations outside the JSON block."
    );
    
    let userRequest = (
        "Given the following recent articles (each is a one-line bullet: title (url) — short summary),\n" +
        "produce EXACTLY 10 LinkedIn post *ideas* suitable for technology professionals. " +
        "Each array item must be an object with the keys:\n" +
        '  - "title": a short catchy headline (<= 10 words),\n' +
        '  - "description": 2 short sentences (good for a LinkedIn post body),\n' +
        '  - "detailed_description": a paragraph (3-4 sentences) providing a detailed, professional description of the topic.\n' +
        '  - "hashtags": an array of 2-4 relevant hashtags (strings).\n\n' +
        "If you cannot produce 10 distinct ideas, return {\"error\":\"INSUFFICIENT_CONTEXT\"} as JSON.\n\n" +
        "Here are the articles:\n"
    );
    
    userRequest += bullets.map(b => `- ${b}`).join('\n');
    userRequest += "\n\nNow return the JSON array of 10 items only.\n";
    
    return systemInstruction + "\n\n" + userRequest; 
}

/**
 * Extracts and parses JSON from the model's raw text output.
 */
function extractJsonFromText(text) {
    text = text.trim();
    let match = text.match(/\[.*\]/s); 
    if (!match) {
        match = text.match(/\{.*\}\s*$/s); 
    }
    if (!match) {
        throw new Error("No JSON array or object found in model output.");
    }
    
    let candidate = match[0];
    if (candidate.startsWith("```json")) {
        candidate = candidate.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    
    return JSON.parse(candidate);
}

/**
 * Main function exposed to app.js for idea generation.
 */
export async function generateIdeas(newsApiKey, geminiApiKey) {
    try {
        const articles = await searchRecentTechArticles(newsApiKey, "AI OR technology OR innovation");
        if (articles.length === 0) {
            return { error: "No articles found in the last 10 days." };
        }
        
        const bullets = compactArticleList(articles);
        const prompt = buildPrompt(bullets);
        
        // --- Gemini API Call Setup ---
        const requestBody = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        };

        const fetchPromise = fetch(`${GEMINI_API_ENDPOINT}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API request timed out after 20 seconds.')), GEMINI_TIMEOUT_MS)
        );

        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error Response:", errorText);
            
            let errorMessage = `Gemini API HTTP Error: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage += ` - ${errorData.error.message || 'Unknown reason'}`;
            } catch {
                errorMessage += ` - Raw text: ${errorText.substring(0, 100)}`;
            }

            return { error: errorMessage };
        }
        
        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        
        const ideas = extractJsonFromText(rawText);
        
        if (ideas.error) {
            return { error: ideas.error };
        }
        
        return ideas;

    } catch (e) {
        console.error("Full Idea Generation Error:", e);
        if (e.message.includes('timed out') || e.message.includes('NewsAPI HTTP error')) {
            return { error: e.message + " Check your API key or network connection and try again." };
        }
        return { error: e.message };
    }
}
