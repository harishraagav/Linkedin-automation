// img_gen.js

/**
 * Builds a structured, high-quality, abstract prompt for the image generator.
 * This structure prevents abstract topics from yielding messy or unclear results.
 * @param {string} baseTopic The topic derived from the LinkedIn post idea.
 * @returns {string} The detailed, descriptive prompt for the image model.
 */
function promptBuilder(baseTopic) {
    // We explicitly instruct for a vector/graphic style to avoid messy photorealism
    const style = "A dynamic, isometric graphic design illustration. Sleek, professional, and futuristic aesthetic. High resolution, ultra-detailed, 8k digital art, sharp focus.";
    
    // Concrete subject framing
    const subject = `An abstract concept of "${baseTopic}".`;
    
    // Visual metaphor: Use common concepts for technology/AI/network
    const metaphor = "A network of interconnected glowing nodes, geometric shapes, and clean lines forming a secure data stream or digital brain structure.";
    
    return `${subject} ${metaphor} ${style}`;
}

/**
 * Calls the external worker to generate an image and returns the display URL and Blob data.
 * @param {string} topic The topic used to build the final prompt.
 * @param {string} workerUrl The URL of the user's deployed image generation worker.
 * @param {string} apiKey The API key for the image worker.
 * @returns {Promise<{url: string, blob: Blob}>} Object containing the local display URL and the binary Blob.
 */
export async function generateImage(topic, workerUrl, apiKey) {
    try {
        const imagePrompt = promptBuilder(topic);

        const requestBody = {
            prompt: imagePrompt,
        };

        const response = await fetch(workerUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData = {};
            try { errorData = JSON.parse(errorText); } catch {}
            
            const message = errorData.error ? errorData.error : errorText;
            throw new Error(`Worker Error: Status ${response.status} - ${message.substring(0, 100)}...`);
        }

        // Assuming the worker returns the image directly as binary data (Blob)
        const blob = await response.blob();
        
        // Check if the Blob mime type is an image (critical check)
        if (!blob.type.startsWith('image/')) {
            throw new Error(`Worker returned non-image data. MIME Type: ${blob.type}. Ensure worker returns image/jpeg or image/png.`);
        }

        // Create a temporary local URL for displaying the image
        const url = URL.createObjectURL(blob);
        
        // Return both the URL for local display and the Blob for LinkedIn upload
        return { url: url, blob: blob };

    } catch (e) {
        console.error("Full Image Generation Error:", e);
        
        // If the error is 'Failed to fetch', it's usually a network/CORS issue
        if (e.message.includes('Failed to fetch')) {
            return { error: "Network/CORS Error: Image Worker could not be reached. Check its deployment and CORS headers (Access-Control-Allow-Origin)." };
        }
        
        return { error: e.message };
    }
}
