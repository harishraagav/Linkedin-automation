// postgen.js

// NOTE: Using v1 for standard stability. Change back to v1beta if required by an older setup.
const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent";


// Equivalent to build_post_prompt in Python
function buildPostPrompt(query) {
    // This function returns your exact, highly-structured prompt string,
    // ensuring the TOPIC is correctly injected.
    return `
TOPIC(PROMPT):${query}
# **Role:** You are a world-class LinkedIn Content Strategist, Digital Psychologist, and Professional Storytelling Expert with over 100 years of cumulative industry experience.  
Your specialty is creating highly structured, data-driven, psychologically compelling, and algorithm-optimized LinkedIn posts that deliver measurable engagement, follower growth, and authority positioning.

# **Objective:** Create a viral, actionable, emotionally engaging, and authentic LinkedIn post that aligns with the “Latin Pro” style formula.  
The post must establish credibility, provoke meaningful interaction, provide high-value takeaways, and be designed for maximal readability and shareability.

# **Context:** The target audience consists of ambitious professionals, young entrepreneurs, mid-career leaders, and personal development seekers who are hungry for real, applicable advice, growth hacks, and unique insights.  
The user wants to position themselves as an authority in their domain while driving high engagement and valuable connections.

# **Instructions:** ## "Instruction 1 – Craft an Irresistible Hook"  
👉 Begin with a bold, shocking, or counterintuitive statement, or a powerful statistic that challenges conventional thinking.  
🧱 It must be one sentence, designed to capture attention in the first 3 seconds of scrolling.

## "Instruction 2 – Share a Micro-Personal Insight or Observational Story"  
📖 Write 2–4 sentences presenting a personal challenge, struggle, or direct observation that emotionally connects with the audience.  
🎯 Tone: Authentic, vulnerable, non-salesy, relatable, and human.

## "Instruction 3 – Myth-Busting Insight"  
⚡ Select a widely believed but incorrect assumption related to the topic.  
🔧 Deliver a clear contradiction backed by your experience or research insight.

## "Instruction 4 – Present an Actionable Framework or 3-Step Strategy"  
✅ Create a crisp, numbered 3-step strategy that provides real value.  
💡 Use emojis (✅, 🚀, 💡) to highlight each step and enhance readability.  
📊 Each step should be actionable, concise (max 20 words), and practical.

## "Instruction 5 – Deliver a Powerful Takeaway Insight"  
✨ Craft a single, memorable sentence that conveys a deep insight or core truth related to the topic.  
⚡ Example style: “Clarity beats effort every time.”

## "Instruction 6 – Write a Thought-Provoking Engagement Question"  
❓ End the post with an open-ended question designed to provoke reflection, personal sharing, or debate.  
🧠 Make it highly relevant, stimulating, and easy to respond to.

## "Instruction 7 – Include Hashtags and Visual Guidance"  
📌 Add 3–5 carefully selected high-impact hashtags (e.g., #Leadership #GrowthMindset #CareerTips).  
🖼️ Add a note: “Consider attaching a branded image summarizing the framework or key insight.”

## "Instruction 8 – Formatting Rules"  
📝 Use generous line breaks for clarity and visual appeal.  
🚀 Limit total word count to 150–200 words.  
✅ Apply minimal but meaningful emojis.  
📏 Avoid large paragraphs—keep sentences short and scannable.  
📚 Bold the first hook line.


NOTE: i just need the linked in post. no other extras. dont write like here's your linked in profile anol. just the post and no extra suggestions

---

# **Expected Output:** A fully structured LinkedIn post in Markdown format following the "Latin Pro" style, including:  
- A bold hook  
- Micro-story or insight  
- Myth-busting perspective  
- 3 actionable steps  
- A powerful takeaway sentence  
- An engagement question  
- Proper hashtags and formatting ready for direct posting.
    `.replace("TOPIC(PROMPT):" + query, "TOPIC(PROMPT):" + query);
}

// Main function exposed to app.js
export async function generatePost(topic, geminiApiKey) {
    const prompt = buildPostPrompt(topic);

    try {
        const requestBody = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            // Use a moderate temperature to allow for creativity, 
            // but keep it structured since the prompt is highly detailed.
        };

        // CRITICAL FIX: Ensure full absolute URL with API key as a query parameter
        const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            // FIX: Safely read and parse error response if fetch failed
            const errorText = await response.text();
            console.error("Gemini API Error Response:", errorText);

            let errorMessage = `Gemini API HTTP Error: ${response.status}`;
            
            // Attempt safe JSON parsing for detailed error message
            try {
                const errorData = JSON.parse(errorText); 
                errorMessage += ` - ${errorData.error.message || 'Unknown reason'}`;
            } catch {
                errorMessage += ` - Raw response text: ${errorText.substring(0, 100)}`;
            }

            // Throw the error for the app.js handler to catch and display
            throw new Error(errorMessage); 
        }

        const data = await response.json();
        
        // Ensure the response data has the expected structure
        if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content || !data.candidates[0].content.parts[0].text) {
             throw new Error("Received an unexpected or empty response structure from the Gemini API.");
        }

        const postText = data.candidates[0].content.parts[0].text;
        
        return postText;

    } catch (e) {
        console.error("Full Post Generation Error:", e);
        // Return a structured error object for app.js
        return { error: e.message };
    }
}