// ideagen.js
// --- GEMINI API CALLS ---
// Using gemini-2.5-flash for speed and complex output generation (JSON)
// FIX: Using the V1 endpoint that correctly supports `systemInstruction` and `tools`
const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent"; 
// Set a reasonable timeout for the combined search/generation task
const GEMINI_TIMEOUT_MS = 30000; 

// The functions related to NewsAPI are removed.

// Modified buildPrompt to instruct the model to perform the search internally.
function buildPrompt() {
    const systemInstruction = (
        "You are a creative LinkedIn content strategist specialized in technology, AI, and innovation. " +
        "Your goal is to find recent, relevant news articles (published in the last 10 days) on technology, AI, or innovation, and then " +
        "generate 10 LinkedIn post ideas based ONLY on the search results you find. " +
        "Your SOLE output must be a valid JSON array of EXACTLY 10 objects. " +
        "DO NOT add any conversational prose, preambles, or explanations outside the JSON block."
    );
    
    let userRequest = (
        "First, use the search tool to find recent (last 10 days) news articles on 'AI OR technology OR innovation' in English. " +
        "Second, based on the content of these articles, produce EXACTLY 10 unique LinkedIn post *ideas* suitable for technology professionals. " +
        "Each array item must be an object with the keys:\n" +
        '  - "title": a short catchy headline (<= 10 words),\n' +
        '  - "description": 2 short sentences (good for a LinkedIn post body),\n' +
        '  - "detailed_description": a paragraph (3-4 sentences) providing a detailed, professional description of the topic.\n' +
        '  - "hashtags": an array of 2-4 relevant hashtags (strings).\n\n' +
        "If you cannot produce 10 distinct ideas from the search context, return {\"error\":\"INSUFFICIENT_CONTEXT\"} as JSON.\n\n" +
        "Now return the JSON array of 10 items only."
    );
    
    return { systemInstruction, userRequest }; 
}

// Function remains the same for JSON extraction
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

// Main function exposed to app.js
// Now only takes the Gemini API key
export async function generateIdeas(geminiApiKey) {
    try {
        const { systemInstruction, userRequest } = buildPrompt();
        
        // --- Gemini API Call Setup ---
        const requestBody = {
            contents: [{ parts: [{ text: userRequest }] }],
            // FIX: systemInstruction and tools must be direct properties of the payload
            systemInstruction: systemInstruction,
            tools: [{ "google_search": {} }],
        };

        const fetchPromise = fetch(`${GEMINI_API_ENDPOINT}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Idea Generation timed out after 30 seconds. Try again.')), GEMINI_TIMEOUT_MS)
        );

        // Race the fetch call against the timeout
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
        
        // --- JSON Extraction ---
        const ideas = extractJsonFromText(rawText);
        
        if (ideas.error) {
            return { error: ideas.error };
        }
        
        return ideas;

    } catch (e) {
        console.error("Full Idea Generation Error:", e);
        if (e.message.includes('timed out')) {
            return { error: e.message };
        }
        return { error: e.message };
    }
}
