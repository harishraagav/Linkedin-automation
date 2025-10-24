// app.js
import { generateIdeas } from './ideagen.js';
import { generatePost } from './postgen.js';
import { generateImage } from './img_gen.js';
import { createLinkedInPost, uploadImageToLinkedIn } from './publish.js';

// --- API KEYS & CONFIG (WARNING: INSECURE FOR PUBLIC HOSTING) ---
// **REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL KEYS/TOKEN**
const GEMINI_API_KEY = "AIzaSyCUV3oFZ-k157PBTLgQ49jUwtWtBkmVAhY";
const NEWS_API_KEY = "1f53aa1c9fcb464cabb5b07ff93873ed";
const IMG_GEN_API_KEY = "12345678";
const IMG_WORKER_URL = "https://image-api.harish-u-syndicate.workers.dev/";

// --- LINKEDIN CONFIGURATION ---
const LINKEDIN_PROXY_URL = "https://linkedin-publisher-proxy.harish-u-syndicate.workers.dev";
const LINKEDIN_ACCESS_TOKEN = "AQW68q7fzofuDFFJjvebXEUQOohGqE5ahAu64CrfodR_haql7gR5pmCtE1GLc9BSzOas8ZNc1_BNGRHebb8c99dOFT3QCATwYePVQNPIbrFnGXNgbietV7Znx8saqQywZlVig9mJ1h_Cjrllq37nJmpZ2ksIYMMDrPQ7rY1kKjKLgmo7_wrKPfhwedv2wKtis6UMZQaU31piFrf82lx1NkOGjQ0dufdoV9tgrIJ_dcf-7157Z6EeKu1GYHV4hLiWa_OMKMj0GM344m7A5A5zUHTpBE_YjVR1MVz2e0X9Tl4q3Ws5NgvhT-daCqRSxFiiuaECEyOF38NWfNmkppWW4lzmUQ7pOw"; // <<< IMPORTANT: REPLACE THIS!
const AUTHOR_URN = "urn:li:person:QCTConK3aA"; // <<< NEW: Your Hardcoded URN to bypass CORS

// --------------------------------------------------------

const DOM = {
    ideasBtn: document.getElementById('generateIdeasBtn'),
    postBtn: document.getElementById('generatePostBtn'),
    publishBtn: document.getElementById('publishBtn'),
    ideasOutput: document.getElementById('ideas-output'),
    postTopicInput: document.getElementById('postTopic'),
    finalPostTextarea: document.getElementById('finalPostText'),
    ideaStatus: document.getElementById('idea-status'),
    postStatus: document.getElementById('post-status'),
    imageOutput: document.getElementById('image-output'),
};

let selectedIdea = null;
let currentImageBlob = null; // Stores the binary image data for publishing

// --- EVENT LISTENERS ---
DOM.ideasBtn.addEventListener('click', handleGenerateIdeas);
DOM.postBtn.addEventListener('click', handleGeneratePost);
DOM.publishBtn.addEventListener('click', handlePublishToLinkedIn);
DOM.postTopicInput.addEventListener('input', () => {
    // Enable post button if custom text is entered
    if (DOM.postTopicInput.value.trim().length > 5) {
        DOM.postBtn.disabled = false;
    } else if (!selectedIdea) {
        DOM.postBtn.disabled = true;
    }
    DOM.publishBtn.disabled = true; // Disable publish if topic changes
});


// --- IDEA GENERATION HANDLER ---
async function handleGenerateIdeas() {
    DOM.ideasBtn.disabled = true;
    DOM.ideaStatus.textContent = 'Fetching news and generating ideas... This may take up to 45 seconds.';
    DOM.ideasOutput.innerHTML = '<p>Loading...</p>';
    
    try {
        const ideas = await generateIdeas(NEWS_API_KEY, GEMINI_API_KEY);
        
        if (ideas.error) {
            DOM.ideaStatus.textContent = `Error: ${ideas.error}`;
            DOM.ideasOutput.innerHTML = `<p class="warning">Failed to generate ideas. ${ideas.error}</p>`;
            return;
        }

        renderIdeas(ideas);
        DOM.ideaStatus.textContent = `Successfully generated ${ideas.length} ideas. Click one to select.`;

    } catch (e) {
        DOM.ideaStatus.textContent = `Network Error: ${e.message}`;
        DOM.ideasOutput.innerHTML = `<p class="warning">An error occurred during idea generation. Check console for details.</p>`;
    } finally {
        DOM.ideasBtn.disabled = false;
    }
}

function renderIdeas(ideas) {
    DOM.ideasOutput.innerHTML = ''; // Clear previous ideas
    ideas.forEach((idea, index) => {
        const ideaDiv = document.createElement('div');
        ideaDiv.classList.add('idea-item');
        ideaDiv.innerHTML = `<h4>${index + 1}. ${idea.title}</h4><p>${idea.description}</p>`;
        ideaDiv.dataset.topic = idea.detailed_description; 
        
        ideaDiv.addEventListener('click', () => {
            selectIdea(ideaDiv);
        });
        
        DOM.ideasOutput.appendChild(ideaDiv);
    });
}

function selectIdea(element) {
    document.querySelectorAll('.idea-item').forEach(item => item.classList.remove('selected'));
    element.classList.add('selected');
    selectedIdea = element.dataset.topic; 
    
    DOM.postTopicInput.value = element.querySelector('h4').textContent.replace(/^\d+\.\s*/, '');
    DOM.postTopicInput.readOnly = false;
    DOM.postBtn.disabled = false;
    DOM.publishBtn.disabled = true;
    
    DOM.ideaStatus.textContent = `Idea selected: "${DOM.postTopicInput.value}". Ready to generate post.`;
}

// --- POST & IMAGE GENERATION HANDLER ---
async function handleGeneratePost() {
    const topic = DOM.postTopicInput.value.trim();
    if (!topic) {
        alert("Please select an idea or enter a custom topic.");
        return;
    }

    DOM.postBtn.disabled = true;
    DOM.publishBtn.disabled = true;
    DOM.postStatus.textContent = 'Generating final LinkedIn post...';
    DOM.finalPostTextarea.value = 'Generating post...';
    DOM.imageOutput.innerHTML = ''; // Clear previous image
    currentImageBlob = null; // Clear previous Blob

    try {
        // 1. Generate Post Text
        const postText = await generatePost(topic, GEMINI_API_KEY);

        if (postText.error) {
             DOM.postStatus.textContent = `Error: ${postText.error}`;
             DOM.finalPostTextarea.value = `Error generating post: ${postText.error}`;
             return;
        }

        DOM.finalPostTextarea.value = postText;
        DOM.postStatus.textContent = 'Post generated successfully! Generating image...';

        // 2. Generate Image
        const imageResult = await generateImage(topic, IMG_WORKER_URL, IMG_GEN_API_KEY);

        if (imageResult.error) {
             DOM.postStatus.textContent = `Post generated. Error generating image: ${imageResult.error}`;
             currentImageBlob = null; // Ensure blob is null if image failed
        } else {
             // Display image locally
             DOM.imageOutput.innerHTML = '';
             const img = document.createElement("img");
             img.src = imageResult.url;
             img.classList.add('generated-image');
             DOM.imageOutput.appendChild(img);

             // Store the Blob for publishing
             currentImageBlob = imageResult.blob;
             DOM.postStatus.textContent = 'Post and image generated successfully!';
        }

    } catch (e) {
        DOM.postStatus.textContent = `Network Error: ${e.message}`;
        DOM.finalPostTextarea.value = `An error occurred during generation. Check console for details.`;
    } finally {
        DOM.postBtn.disabled = false;
        // Enable publish only if we have text content
        if (DOM.finalPostTextarea.value && !DOM.finalPostTextarea.value.startsWith('Error')) {
             DOM.publishBtn.disabled = false;
        }
    }
}

// --- LINKEDIN PUBLISHING HANDLER ---
async function handlePublishToLinkedIn() {
    const postText = DOM.finalPostTextarea.value.trim();
    const hasImage = currentImageBlob !== null;
    
    if (!postText || postText.startsWith('Error')) {
        alert("Please generate a valid post first.");
        return;
    }

    DOM.publishBtn.disabled = true;
    DOM.postBtn.disabled = true;
    DOM.postStatus.textContent = hasImage 
        ? 'Publishing post and image to LinkedIn...' 
        : 'Publishing text-only post to LinkedIn...';

    let finalImageURN = null;
    let publishSuccess = false;

    try {
        if (hasImage) {
            DOM.postStatus.textContent = 'Step 1/2: Registering and uploading image...';
            
            try {
                // Image upload attempts to use the proxy
                finalImageURN = await uploadImageToLinkedIn(LINKEDIN_PROXY_URL, LINKEDIN_ACCESS_TOKEN, AUTHOR_URN, currentImageBlob);
                DOM.postStatus.textContent = 'Step 2/2: Image uploaded. Creating final post...';
            } catch (imageError) {
                // If image upload fails (likely due to unexpected CORS/network failure on the proxy side or an expired token)
                console.error("Image upload failed due to expected CORS/network issue.", imageError);
                
                // Prompt user to continue text-only
                const confirmText = `Image upload failed (Status: ${imageError.message}). Do you want to continue publishing the text post without the image?`;
                if (!window.confirm(confirmText)) {
                    throw new Error("Publishing cancelled by user.");
                }
                
                finalImageURN = null;
                currentImageBlob = null;
                DOM.postStatus.textContent = 'Publishing text-only post...';
            }
        }
        
        // 2. Create the Final Post (Text + Image URN or Text Only)
        const publishResult = await createLinkedInPost(
            LINKEDIN_PROXY_URL, 
            LINKEDIN_ACCESS_TOKEN, 
            AUTHOR_URN, 
            postText, 
            finalImageURN
        );

        DOM.postStatus.textContent = `Success! Post published. URN: ${publishResult.postUrn.split(':').pop()}`;
        console.log("LinkedIn Post URL (from Location header):", publishResult.postUrn);
        publishSuccess = true;

    } catch (e) {
        DOM.postStatus.textContent = `LinkedIn Publish Error: ${e.message}`;
        console.error("Publishing Failed:", e);
    } finally {
        DOM.publishBtn.disabled = publishSuccess; // Disable on success
        DOM.postBtn.disabled = false;
    }
}
